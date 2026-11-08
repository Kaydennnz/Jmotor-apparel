const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
const orderStatuses = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
];
const usernamePattern = /^[A-Za-z0-9_]{3,50}$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(value) {
  return /^[1-9]\d*$/.test(String(value));
}

function validateVariant(variant) {
  if (!isObject(variant)) {
    return 'Each variant must be an object';
  }
  if (variant.size !== null && variant.size !== undefined
      && (typeof variant.size !== 'string' || variant.size.length > 30)) {
    return 'Variant size must be 30 characters or fewer';
  }
  if (variant.color !== null && variant.color !== undefined
      && (typeof variant.color !== 'string' || variant.color.length > 50)) {
    return 'Variant color must be 50 characters or fewer';
  }
  if (!Number.isInteger(variant.price) || variant.price <= 0) {
    return 'Variant price must be a positive integer';
  }
  if (!Number.isInteger(variant.stock) || variant.stock < 0) {
    return 'Variant stock must be a non-negative integer';
  }
  return null;
}

function createSku(productId) {
  return `ADM-${productId}-${crypto.randomBytes(12).toString('hex')}`;
}

function isDuplicateEntry(error) {
  return error.code === 'ER_DUP_ENTRY';
}

async function getProducts(req, res) {
  const [products] = await pool.execute(
    `SELECT p.id, p.name, p.description, p.category_id AS categoryId,
            c.name AS categoryName, p.is_active AS active
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ORDER BY p.id`
  );
  const [variants] = await pool.execute(
    `SELECT id, product_id AS productId, size, color, price, stock
     FROM product_variants
     ORDER BY product_id, id`
  );
  const variantsByProduct = new Map();
  variants.forEach((variant) => {
    const productId = String(variant.productId);
    if (!variantsByProduct.has(productId)) {
      variantsByProduct.set(productId, []);
    }
    variantsByProduct.get(productId).push({
      id: Number(variant.id),
      size: variant.size,
      color: variant.color,
      price: Number(variant.price),
      stock: Number(variant.stock),
    });
  });

  res.json(products.map((product) => ({
    id: Number(product.id),
    name: product.name,
    description: product.description,
    category: {
      id: Number(product.categoryId),
      name: product.categoryName,
    },
    active: Boolean(product.active),
    variants: variantsByProduct.get(String(product.id)) || [],
  })));
}

async function createProduct(req, res) {
  const body = req.body;
  if (!isObject(body)
      || typeof body.name !== 'string'
      || !body.name.trim()
      || body.name.trim().length > 150) {
    return res.status(400).json({ error: 'Product name is required and must be 150 characters or fewer' });
  }
  if (body.description !== null && body.description !== undefined
      && typeof body.description !== 'string') {
    return res.status(400).json({ error: 'Product description must be a string or null' });
  }
  if (!Number.isInteger(body.categoryId) || body.categoryId < 1) {
    return res.status(400).json({ error: 'Category ID must be a positive integer' });
  }
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return res.status(400).json({ error: 'At least one product variant is required' });
  }
  for (const variant of body.variants) {
    const validationError = validateVariant(variant);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [categories] = await connection.execute(
      'SELECT id FROM categories WHERE id = ? LIMIT 1',
      [body.categoryId]
    );
    if (categories.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Category not found' });
    }

    const [result] = await connection.execute(
      'INSERT INTO products (category_id, name, description) VALUES (?, ?, ?)',
      [body.categoryId, body.name.trim(), body.description ?? null]
    );
    const productId = result.insertId;
    for (const variant of body.variants) {
      await connection.execute(
        `INSERT INTO product_variants
           (product_id, sku, size, color, price, stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          productId,
          createSku(productId),
          variant.size ?? null,
          variant.color ?? null,
          variant.price,
          variant.stock,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ id: Number(productId), message: 'Product created' });
  } catch (error) {
    await connection.rollback();
    if (isDuplicateEntry(error)) {
      return res.status(409).json({ error: 'A product variant with the same size and color already exists' });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProduct(req, res) {
  if (!validId(req.params.id)) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const body = req.body;
  if (!isObject(body)) {
    return res.status(400).json({ error: 'Product details are required' });
  }
  if (Object.keys(body).some((key) => !['name', 'description', 'categoryId', 'active'].includes(key))) {
    return res.status(400).json({ error: 'Only name, description, categoryId, and active can be updated' });
  }

  const updates = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 150) {
      return res.status(400).json({ error: 'Product name is required and must be 150 characters or fewer' });
    }
    updates.push('name = ?');
    values.push(body.name.trim());
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    if (body.description !== null && typeof body.description !== 'string') {
      return res.status(400).json({ error: 'Product description must be a string or null' });
    }
    updates.push('description = ?');
    values.push(body.description);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
    if (!Number.isInteger(body.categoryId) || body.categoryId < 1) {
      return res.status(400).json({ error: 'Category ID must be a positive integer' });
    }
    const [categories] = await pool.execute(
      'SELECT id FROM categories WHERE id = ? LIMIT 1',
      [body.categoryId]
    );
    if (categories.length === 0) {
      return res.status(400).json({ error: 'Category not found' });
    }
    updates.push('category_id = ?');
    values.push(body.categoryId);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'active')) {
    if (typeof body.active !== 'boolean') {
      return res.status(400).json({ error: 'Active must be a boolean' });
    }
    updates.push('is_active = ?');
    values.push(body.active);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'At least one product field is required' });
  }

  const [products] = await pool.execute(
    'SELECT id FROM products WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (products.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  values.push(req.params.id);
  await pool.execute(
    `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  res.json({ message: 'Product updated' });
}

async function addVariant(req, res) {
  if (!validId(req.params.id)) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const validationError = validateVariant(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const [products] = await pool.execute(
    'SELECT id FROM products WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (products.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO product_variants
         (product_id, sku, size, color, price, stock)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        createSku(req.params.id),
        req.body.size ?? null,
        req.body.color ?? null,
        req.body.price,
        req.body.stock,
      ]
    );
    res.status(201).json({ id: Number(result.insertId), message: 'Variant created' });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return res.status(409).json({ error: 'A variant with the same size and color already exists for this product' });
    }
    throw error;
  }
}

async function updateVariant(req, res) {
  if (!validId(req.params.id)) {
    return res.status(404).json({ error: 'Product variant not found' });
  }
  if (!isObject(req.body)) {
    return res.status(400).json({ error: 'Variant details are required' });
  }

  const [variants] = await pool.execute(
    'SELECT size, color, price, stock FROM product_variants WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (variants.length === 0) {
    return res.status(404).json({ error: 'Product variant not found' });
  }
  const current = variants[0];
  const updated = {
    size: Object.prototype.hasOwnProperty.call(req.body, 'size') ? req.body.size : current.size,
    color: Object.prototype.hasOwnProperty.call(req.body, 'color') ? req.body.color : current.color,
    price: Object.prototype.hasOwnProperty.call(req.body, 'price') ? req.body.price : Number(current.price),
    stock: Object.prototype.hasOwnProperty.call(req.body, 'stock') ? req.body.stock : Number(current.stock),
  };
  const validationError = validateVariant(updated);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  if (Object.keys(req.body).some((key) => !['size', 'color', 'price', 'stock'].includes(key))) {
    return res.status(400).json({ error: 'Only size, color, price, and stock can be updated' });
  }
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'At least one variant field is required' });
  }

  try {
    await pool.execute(
      `UPDATE product_variants
       SET size = ?, color = ?, price = ?, stock = ?
       WHERE id = ?`,
      [updated.size, updated.color, updated.price, updated.stock, req.params.id]
    );
    res.json({ message: 'Variant updated' });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return res.status(409).json({ error: 'A variant with the same size and color already exists for this product' });
    }
    throw error;
  }
}

async function createStaff(req, res) {
  const body = req.body;
  if (!isObject(body)
      || typeof body.username !== 'string'
      || !usernamePattern.test(body.username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters and contain only letters, digits, or underscores' });
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (typeof body.displayName !== 'string'
      || !body.displayName.trim()
      || body.displayName.trim().length > 100) {
    return res.status(400).json({ error: 'Display name is required and must be 100 characters or fewer' });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  try {
    const [result] = await pool.execute(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES (?, ?, ?, ?)`,
      [body.username, passwordHash, body.displayName.trim(), 'staff']
    );
    res.status(201).json({
      id: Number(result.insertId),
      username: body.username,
      displayName: body.displayName.trim(),
      role: 'staff',
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return res.status(409).json({ error: 'Username is already taken' });
    }
    throw error;
  }
}

async function getStaff(req, res) {
  const [staff] = await pool.execute(
    `SELECT id, display_name AS displayName, username, role
     FROM users
     WHERE role = ?
     ORDER BY display_name, id`,
    ['staff']
  );
  res.json(staff.map((user) => ({ ...user, id: Number(user.id) })));
}

async function getReports(req, res) {
  const [sales] = await pool.execute(
    `SELECT COALESCE(SUM(total_amount), 0) AS totalSales
     FROM orders
     WHERE status = ?`,
    ['delivered']
  );
  const [counts] = await pool.execute(
    'SELECT status, COUNT(*) AS orderCount FROM orders GROUP BY status'
  );
  const countByStatus = new Map(
    counts.map((row) => [row.status, Number(row.orderCount)])
  );
  const [lowStock] = await pool.execute(
    `SELECT pv.id, pv.product_id AS productId, p.name AS productName,
            pv.size, pv.color, pv.price, pv.stock
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.stock < ?
     ORDER BY pv.stock, p.name, pv.id`,
    [5]
  );

  res.json({
    totalSales: Number(sales[0].totalSales),
    orderCounts: orderStatuses.map((status) => ({
      status,
      count: countByStatus.get(status) || 0,
    })),
    lowStockVariants: lowStock.map((variant) => ({
      ...variant,
      id: Number(variant.id),
      productId: Number(variant.productId),
      price: Number(variant.price),
      stock: Number(variant.stock),
    })),
  });
}

router.get('/products', requireLogin, requireRole('admin'), getProducts);
router.post('/products', requireLogin, requireRole('admin'), createProduct);
router.patch('/products/:id', requireLogin, requireRole('admin'), updateProduct);
router.post('/products/:id/variants', requireLogin, requireRole('admin'), addVariant);
router.patch('/variants/:id', requireLogin, requireRole('admin'), updateVariant);
router.post('/staff', requireLogin, requireRole('admin'), createStaff);
router.get('/staff', requireLogin, requireRole('admin'), getStaff);
router.get('/reports', requireLogin, requireRole('admin'), getReports);

module.exports = router;
