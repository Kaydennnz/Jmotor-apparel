const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
const allowedStatuses = new Set([
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
]);
const statusTransitions = new Map([
  ['pending', 'confirmed'],
  ['confirmed', 'packed'],
  ['packed', 'shipped'],
  ['shipped', 'delivered'],
]);

router.use(requireLogin, requireRole('staff', 'admin'));

// Create an HTTP error that a transaction can return after rollback.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Return order summaries, optionally filtered by a valid status.
async function getOrders(req, res) {
  const status = req.query.status;
  if (status !== undefined && !allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  const statusFilter = status === undefined ? '' : 'WHERE o.status = ?';
  const params = status === undefined ? [] : [status];
  const [orders] = await pool.execute(
    `SELECT o.id, o.created_at, u.display_name AS customerName,
            o.recipient_name AS recipientName, o.status,
            o.total_amount AS total,
            (SELECT p.method FROM payments p
             WHERE p.order_id = o.id
             ORDER BY p.id DESC LIMIT 1) AS paymentMethod,
            (SELECT p.status FROM payments p
             WHERE p.order_id = o.id
             ORDER BY p.id DESC LIMIT 1) AS paymentStatus
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ${statusFilter}
     ORDER BY o.created_at DESC, o.id DESC`,
    params
  );

  res.json(orders.map((order) => ({
    ...order,
    id: Number(order.id),
    total: Number(order.total),
  })));
}

// Return order items, payments, and status history without account secrets.
async function getOrder(req, res) {
  const orderId = req.params.id;
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const [orders] = await pool.execute(
    `SELECT o.id, u.display_name AS customerName,
            o.recipient_name AS recipientName, o.recipient_phone AS recipientPhone,
            o.shipping_address AS shippingAddress, o.status,
            o.total_amount AS total, o.created_at, o.updated_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = ?
     LIMIT 1`,
    [orderId]
  );
  if (orders.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const [items] = await pool.execute(
    `SELECT p.name AS productName, pv.size, pv.color,
            oi.quantity, oi.unit_price AS unitPrice
     FROM order_items oi
     JOIN product_variants pv ON pv.id = oi.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id`,
    [orderId]
  );
  const [payments] = await pool.execute(
    `SELECT id, method, status, reference_number AS referenceNumber,
            amount, created_at AS createdAt, updated_at AS updatedAt
     FROM payments
     WHERE order_id = ?
     ORDER BY id DESC`,
    [orderId]
  );
  const [statusLog] = await pool.execute(
    `SELECT l.id, l.changed_by AS changedBy, u.display_name AS changedByName,
            l.old_status AS oldStatus, l.new_status AS newStatus,
            l.reason, l.created_at AS createdAt
     FROM order_status_logs l
     JOIN users u ON u.id = l.changed_by
     WHERE l.order_id = ?
     ORDER BY l.created_at, l.id`,
    [orderId]
  );
  const order = orders[0];

  res.json({
    ...order,
    id: Number(order.id),
    total: Number(order.total),
    items: items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    payments: payments.map((payment) => ({
      ...payment,
      id: Number(payment.id),
      amount: Number(payment.amount),
    })),
    statusLog: statusLog.map((entry) => ({
      ...entry,
      id: Number(entry.id),
      changedBy: Number(entry.changedBy),
    })),
  });
}

// Lock an order and its payment rows before changing its status.
async function lockOrder(connection, orderId) {
  const [orders] = await connection.execute(
    'SELECT id, status FROM orders WHERE id = ? FOR UPDATE',
    [orderId]
  );
  if (orders.length === 0) {
    throw httpError(404, 'Order not found');
  }

  const [payments] = await connection.execute(
    'SELECT id, method, status FROM payments WHERE order_id = ? FOR UPDATE',
    [orderId]
  );
  return { order: orders[0], payments };
}

// Record an order status change and the staff member who made it.
async function insertStatusLog(connection, req, orderId, oldStatus, newStatus, reason) {
  await connection.execute(
    `INSERT INTO order_status_logs
       (order_id, changed_by, old_status, new_status, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, req.session.userId, oldStatus, newStatus, reason]
  );
}

// Apply only the four allowed forward order status transitions.
async function updateOrderStatus(req, res) {
  const orderId = req.params.id;
  const { status } = req.body || {};
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (!Array.from(statusTransitions.values()).includes(status)) {
    return res.status(400).json({ error: 'Status must be a valid next order status' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { order, payments } = await lockOrder(connection, orderId);
    if (statusTransitions.get(order.status) !== status) {
      throw httpError(409, `Cannot change order status from ${order.status} to ${status}`);
    }

    await connection.execute(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, orderId]
    );
    if (status === 'delivered') {
      for (const payment of payments) {
        if (payment.method === 'cod' && payment.status === 'unpaid') {
          await connection.execute(
            'UPDATE payments SET status = ? WHERE id = ?',
            ['paid', payment.id]
          );
        }
      }
    }
    await insertStatusLog(connection, req, orderId, order.status, status, null);
    await connection.commit();
    res.json({ message: 'Order status updated', status });
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

// Mark an unpaid GCash or bank transfer payment as paid after verification.
async function markPaid(req, res) {
  const orderId = req.params.id;
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { order, payments } = await lockOrder(connection, orderId);
    const unpaidPayments = payments.filter((payment) => (
      ['gcash', 'bank_transfer'].includes(payment.method)
      && payment.status === 'unpaid'
    ));

    if (unpaidPayments.length === 0) {
      throw httpError(409, 'No unpaid GCash or bank transfer payment exists for this order');
    }

    for (const payment of unpaidPayments) {
      await connection.execute(
        'UPDATE payments SET status = ? WHERE id = ? AND status = ?',
        ['paid', payment.id, 'unpaid']
      );
    }
    await insertStatusLog(
      connection,
      req,
      orderId,
      order.status,
      order.status,
      'Payment marked paid after reference verification'
    );
    await connection.commit();
    res.json({ message: 'Payment marked as paid' });
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

// Cancel an eligible order, restore its stock, and save the required reason.
async function cancelOrder(req, res) {
  const orderId = req.params.id;
  const { reason } = req.body || {};
  if (!/^[1-9]\d*$/.test(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }
  if (reason.trim().length > 500) {
    return res.status(400).json({ error: 'Cancellation reason must be 500 characters or fewer' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { order, payments } = await lockOrder(connection, orderId);
    if (!['pending', 'confirmed', 'packed'].includes(order.status)) {
      throw httpError(409, `An order with status ${order.status} cannot be cancelled`);
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
      'UPDATE orders SET status = ? WHERE id = ?',
      ['cancelled', orderId]
    );
    await insertStatusLog(
      connection,
      req,
      orderId,
      order.status,
      'cancelled',
      reason.trim()
    );
    for (const payment of payments) {
      if (payment.status === 'paid') {
        await connection.execute(
          'UPDATE payments SET status = ? WHERE id = ? AND status = ?',
          ['refund_pending', payment.id, 'paid']
        );
      }
    }

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

// Set inventory without allowing price changes.
async function updateVariantStock(req, res) {
  const variantId = req.params.id;
  const body = req.body || {};
  if (!/^[1-9]\d*$/.test(variantId)) {
    return res.status(404).json({ error: 'Product variant not found' });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'price')) {
    return res.status(400).json({ error: 'Price cannot be changed through this endpoint' });
  }
  if (!Number.isInteger(body.stock) || body.stock < 0) {
    return res.status(400).json({ error: 'Stock must be a non-negative integer' });
  }

  const [variants] = await pool.execute(
    'SELECT id FROM product_variants WHERE id = ? LIMIT 1',
    [variantId]
  );
  if (variants.length === 0) {
    return res.status(404).json({ error: 'Product variant not found' });
  }

  await pool.execute(
    'UPDATE product_variants SET stock = ? WHERE id = ?',
    [body.stock, variantId]
  );
  res.json({ message: 'Stock updated', stock: body.stock });
}

router.get('/orders', getOrders);
router.get('/orders/:id', getOrder);
router.post('/orders/:id/status', updateOrderStatus);
router.post('/orders/:id/mark-paid', markPaid);
router.post('/orders/:id/cancel', cancelOrder);
router.patch('/variants/:id/stock', updateVariantStock);

module.exports = router;
