const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

// Return the signed-in user's cart and its current-price total.
async function getCart(req, res) {
  const [items] = await pool.execute(
    `SELECT ci.variant_id AS variantId, p.name AS productName,
            pv.size, pv.color, pv.price AS unitPrice, ci.quantity, pv.stock
     FROM cart_items ci
     JOIN product_variants pv ON pv.id = ci.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE ci.user_id = ?
     ORDER BY ci.id`,
    [req.session.userId]
  );

  const cartItems = items.map((item) => {
    const unitPrice = Number(item.unitPrice);
    const quantity = Number(item.quantity);
    return {
      ...item,
      variantId: Number(item.variantId),
      unitPrice,
      quantity,
      stock: Number(item.stock),
      lineTotal: Number((unitPrice * quantity).toFixed(2)),
    };
  });
  const total = Number(cartItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));

  res.json({ items: cartItems, total });
}

// Validate a requested quantity.
function validQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
}

// Lock a sellable variant while checking its stock.
async function getAvailableVariant(connection, variantId) {
  const [variants] = await connection.execute(
    `SELECT pv.id, pv.stock
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.id = ? AND pv.is_active = 1 AND p.is_active = 1
     FOR UPDATE`,
    [variantId]
  );
  return variants[0];
}

// Add a variant to the signed-in user's cart without trusting client prices.
async function addItem(req, res) {
  const { variantId, quantity } = req.body || {};

  if (!Number.isInteger(variantId) || variantId < 1) {
    return res.status(400).json({ error: 'Variant ID must be a positive integer' });
  }
  if (!validQuantity(quantity)) {
    return res.status(400).json({ error: 'Quantity must be an integer from 1 to 99' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const variant = await getAvailableVariant(connection, variantId);
    if (!variant) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product variant not found or unavailable' });
    }

    const [existingItems] = await connection.execute(
      'SELECT quantity FROM cart_items WHERE user_id = ? AND variant_id = ? FOR UPDATE',
      [req.session.userId, variantId]
    );
    const existingQuantity = existingItems.length ? Number(existingItems[0].quantity) : 0;
    const newQuantity = existingQuantity + quantity;

    if (newQuantity > 99) {
      await connection.rollback();
      return res.status(409).json({ error: 'Cart quantity cannot exceed 99 per item' });
    }
    if (newQuantity > Number(variant.stock)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Requested quantity exceeds available stock' });
    }

    if (existingItems.length) {
      await connection.execute(
        'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND variant_id = ?',
        [newQuantity, req.session.userId, variantId]
      );
    } else {
      await connection.execute(
        'INSERT INTO cart_items (user_id, variant_id, quantity) VALUES (?, ?, ?)',
        [req.session.userId, variantId, newQuantity]
      );
    }

    await connection.commit();
    res.status(200).json({ message: 'Item added to cart', quantity: newQuantity });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Set a cart item's quantity after checking current stock.
async function updateItem(req, res) {
  const variantId = req.params.variantId;
  const { quantity } = req.body || {};

  if (!/^[1-9]\d*$/.test(variantId)) {
    return res.status(400).json({ error: 'Variant ID must be a positive integer' });
  }
  if (!validQuantity(quantity)) {
    return res.status(400).json({ error: 'Quantity must be an integer from 1 to 99' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const variant = await getAvailableVariant(connection, variantId);
    if (!variant) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product variant not found or unavailable' });
    }

    if (quantity > Number(variant.stock)) {
      await connection.rollback();
      return res.status(409).json({ error: 'Requested quantity exceeds available stock' });
    }

    const [existingItems] = await connection.execute(
      'SELECT quantity FROM cart_items WHERE user_id = ? AND variant_id = ? FOR UPDATE',
      [req.session.userId, variantId]
    );
    if (existingItems.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cart item not found' });
    }

    await connection.execute(
      'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND variant_id = ?',
      [quantity, req.session.userId, variantId]
    );

    await connection.commit();
    res.json({ message: 'Cart quantity updated', quantity });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Remove a cart item belonging to the signed-in user.
async function deleteItem(req, res) {
  const variantId = req.params.variantId;
  if (!/^[1-9]\d*$/.test(variantId)) {
    return res.status(400).json({ error: 'Variant ID must be a positive integer' });
  }

  const [result] = await pool.execute(
    'DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?',
    [req.session.userId, variantId]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Cart item not found' });
  }

  res.json({ message: 'Item removed from cart' });
}

router.get('/', getCart);
router.post('/items', addItem);
router.patch('/items/:variantId', updateItem);
router.delete('/items/:variantId', deleteItem);

module.exports = router;
