const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
const paymentMethods = new Map([
  ['cod', 'cod'],
  ['gcash', 'gcash'],
  ['bank transfer', 'bank_transfer'],
  ['bank_transfer', 'bank_transfer'],
]);

// Create an HTTP error that the route can return after rolling back.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Return the address fields accepted by the addresses table.
function validateAddress(address) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw httpError(400, 'A complete shipping address is required');
  }

  const fields = [
    ['recipientName', 100],
    ['phone', 20],
    ['street', 255],
    ['barangay', 100],
    ['city', 100],
    ['province', 100],
    ['postalCode', 20],
  ];
  const values = {};

  for (const [field, maxLength] of fields) {
    if (typeof address[field] !== 'string' || !address[field].trim()) {
      throw httpError(400, `${field} is required`);
    }
    values[field] = address[field].trim();
    if (values[field].length > maxLength) {
      throw httpError(400, `${field} must be ${maxLength} characters or fewer`);
    }
  }

  if (!/^09\d{9}$/.test(values.phone)) {
    throw httpError(400, 'Enter a valid Philippine mobile number for the recipient');
  }

  return values;
}

// Convert a validated address to the order's copied shipping text.
function formatShippingAddress(address) {
  return [
    address.street,
    address.barangay,
    address.city,
    address.province,
    address.postalCode,
  ].join(', ');
}

// Return the user's preferred saved shipping address or null.
async function getAddress(req, res) {
  const [addresses] = await pool.execute(
    `SELECT id, recipient_name, recipient_phone, street_address,
            barangay, city, province, postal_code, is_default, created_at
     FROM addresses
     WHERE user_id = ?
     ORDER BY is_default DESC, created_at DESC, id DESC
     LIMIT 1`,
    [req.session.userId]
  );
  res.json(addresses[0] || null);
}

// Create an order, charge record, and stock updates in one transaction.
async function checkout(req, res) {
  const body = req.body || {};
  const paymentMethod = typeof body.paymentMethod === 'string'
    ? paymentMethods.get(body.paymentMethod.trim().toLowerCase())
    : undefined;

  if (!paymentMethod) {
    return res.status(400).json({ error: 'Choose COD, GCash, or bank transfer' });
  }

  let referenceNumber = null;
  if (body.referenceNumber !== undefined && body.referenceNumber !== null) {
    if (typeof body.referenceNumber !== 'string' || body.referenceNumber.trim().length > 255) {
      return res.status(400).json({ error: 'Reference number must be 255 characters or fewer' });
    }
    referenceNumber = body.referenceNumber.trim() || null;
  }
  if (paymentMethod !== 'cod' && !referenceNumber) {
    return res.status(400).json({ error: 'A reference number is required for GCash and bank transfer' });
  }

  const providedAddress = body.address === undefined ? null : validateAddress(body.address);
  const userId = req.session.userId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      'SELECT id FROM users WHERE id = ? FOR UPDATE',
      [userId]
    );
    if (users.length === 0) {
      throw httpError(401, 'Login required');
    }

    const [cartItems] = await connection.execute(
      'SELECT variant_id, quantity FROM cart_items WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (cartItems.length === 0) {
      throw httpError(400, 'Your cart is empty');
    }

    const [savedAddresses] = await connection.execute(
      `SELECT id, recipient_name, recipient_phone, street_address,
              barangay, city, province, postal_code
       FROM addresses
       WHERE user_id = ?
       ORDER BY is_default DESC, created_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    let address;
    if (providedAddress) {
      address = providedAddress;
    } else if (savedAddresses.length > 0) {
      const saved = savedAddresses[0];
      address = {
        recipientName: saved.recipient_name,
        phone: saved.recipient_phone,
        street: saved.street_address,
        barangay: saved.barangay,
        city: saved.city,
        province: saved.province,
        postalCode: saved.postal_code,
      };
    } else {
      throw httpError(400, 'A complete shipping address is required');
    }

    if (savedAddresses.length === 0) {
      await connection.execute(
        `INSERT INTO addresses
           (user_id, recipient_name, recipient_phone, street_address,
            barangay, city, province, postal_code, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          address.recipientName,
          address.phone,
          address.street,
          address.barangay,
          address.city,
          address.province,
          address.postalCode,
          1,
        ]
      );
    }

    const orderItems = [];
    let totalCents = 0;
    for (const cartItem of cartItems) {
      const [variants] = await connection.execute(
        `SELECT pv.id, pv.price, pv.stock
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ? AND pv.is_active = 1 AND p.is_active = 1
         FOR UPDATE`,
        [cartItem.variant_id]
      );

      if (variants.length === 0) {
        throw httpError(409, 'A cart item is no longer available');
      }

      const variant = variants[0];
      const quantity = Number(cartItem.quantity);
      if (Number(variant.stock) < quantity) {
        throw httpError(409, 'A cart item has insufficient stock. Update your cart and try again.');
      }

      const unitPrice = Number(variant.price);
      totalCents += Math.round(unitPrice * 100) * quantity;
      orderItems.push({
        variantId: variant.id,
        quantity,
        unitPrice: variant.price,
      });
    }

    const total = Number((totalCents / 100).toFixed(2));
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
         (user_id, recipient_name, recipient_phone, shipping_address, status, total_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        address.recipientName,
        address.phone,
        formatShippingAddress(address),
        'pending',
        total.toFixed(2),
      ]
    );
    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        'INSERT INTO order_items (order_id, variant_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item.variantId, item.quantity, item.unitPrice]
      );
      await connection.execute(
        'UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [item.quantity, item.variantId, item.quantity]
      );
    }

    await connection.execute(
      `INSERT INTO payments (order_id, method, status, reference_number, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, paymentMethod, 'unpaid', referenceNumber, total.toFixed(2)]
    );
    await connection.execute(
      `INSERT INTO order_status_logs (order_id, changed_by, old_status, new_status, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, userId, null, 'pending', 'Order placed']
    );
    await connection.execute(
      'DELETE FROM cart_items WHERE user_id = ?',
      [userId]
    );

    await connection.commit();
    res.status(201).json({ orderId, total });
  } catch (error) {
    await connection.rollback();
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  } finally {
    connection.release();
  }
}

// Return this user's orders with the latest payment details.
async function getOrders(req, res) {
  const [orders] = await pool.execute(
    `SELECT o.id, o.status, o.total_amount AS total, o.created_at,
            (SELECT p.method FROM payments p
             WHERE p.order_id = o.id
             ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS paymentMethod,
            (SELECT p.status FROM payments p
             WHERE p.order_id = o.id
             ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS paymentStatus
     FROM orders o
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.session.userId]
  );

  res.json(orders.map((order) => ({
    ...order,
    id: Number(order.id),
    total: Number(order.total),
  })));
}

// Return one order and its items only when it belongs to this user.
async function getOrder(req, res) {
  const orderId = req.params.id;
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const [orders] = await pool.execute(
    `SELECT id, recipient_name, recipient_phone, shipping_address,
            status, total_amount, created_at
     FROM orders
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [orderId, req.session.userId]
  );
  if (orders.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const [items] = await pool.execute(
    `SELECT oi.variant_id AS variantId, p.name AS productName,
            pv.size, pv.color, oi.quantity, oi.unit_price AS unitPrice
     FROM order_items oi
     JOIN product_variants pv ON pv.id = oi.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id`,
    [orderId]
  );
  const order = orders[0];

  res.json({
    id: Number(order.id),
    recipientName: order.recipient_name,
    recipientPhone: order.recipient_phone,
    shippingAddress: order.shipping_address,
    status: order.status,
    total: Number(order.total_amount),
    createdAt: order.created_at,
    items: items.map((item) => ({
      ...item,
      variantId: Number(item.variantId),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
  });
}

// Cancel a pending or confirmed order and restore its stock.
async function cancelOrder(req, res) {
  const orderId = req.params.id;
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const userId = req.session.userId;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      'SELECT id, status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
      [orderId, userId]
    );

    if (orders.length === 0) {
      throw httpError(404, 'Order not found');
    }

    const oldStatus = orders[0].status;
    if (!['pending', 'confirmed'].includes(oldStatus)) {
      throw httpError(409, 'Only pending or confirmed orders can be cancelled');
    }

    const [items] = await connection.execute(
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    for (const item of items) {
      await connection.execute(
        'UPDATE product_variants SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.variant_id]
      );
    }

    await connection.execute(
      'UPDATE orders SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelled', orderId, userId]
    );
    await connection.execute(
      `INSERT INTO order_status_logs (order_id, changed_by, old_status, new_status, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, userId, oldStatus, 'cancelled', 'Cancelled by customer']
    );
    await connection.execute(
      `UPDATE payments SET status = ?
       WHERE order_id = ? AND status = ?`,
      ['refund_pending', orderId, 'paid']
    );

    await connection.commit();
    res.json({ message: 'Order cancelled' });
  } catch (error) {
    await connection.rollback();
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  } finally {
    connection.release();
  }
}

router.get('/address', requireLogin, getAddress);
router.post('/checkout', requireLogin, checkout);
router.get('/orders', requireLogin, getOrders);
router.get('/orders/:id', requireLogin, getOrder);
router.post('/orders/:id/cancel', requireLogin, cancelOrder);

module.exports = router;
