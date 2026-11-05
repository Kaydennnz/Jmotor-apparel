const express = require('express');
const pool = require('../db');

const router = express.Router();

// Return every category for the storefront filter.
async function getCategories(req, res) {
  const [categories] = await pool.execute(
    'SELECT id, name FROM categories ORDER BY name'
  );
  res.json(categories);
}

// Return active products and their lowest active variant price.
async function getProducts(req, res) {
  const categoryId = req.query.category;
  const conditions = ['p.is_active = 1'];
  const params = [];

  if (categoryId !== undefined) {
    if (!/^[1-9]\d*$/.test(categoryId)) {
      return res.status(400).json({ error: 'Category must be a positive number' });
    }

    conditions.push('p.category_id = ?');
    params.push(categoryId);
  }

  const [products] = await pool.execute(
    `SELECT p.id, p.name, p.description, c.name AS categoryName,
            MIN(v.price) AS fromPrice
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
     WHERE ${conditions.join(' AND ')}
     GROUP BY p.id, p.name, p.description, c.name
     ORDER BY p.name`,
    params
  );

  res.json(products.map((product) => ({
    ...product,
    fromPrice: product.fromPrice === null ? null : Number(product.fromPrice),
  })));
}

// Return one active product with all of its variant details.
async function getProduct(req, res) {
  const productId = req.params.id;
  if (!/^[1-9]\d*$/.test(productId)) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const [products] = await pool.execute(
    `SELECT p.id, p.name, p.description, c.name AS categoryName
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = ? AND p.is_active = 1
     LIMIT 1`,
    [productId]
  );

  if (products.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const [variants] = await pool.execute(
    `SELECT id, size, color, price, stock
     FROM product_variants
     WHERE product_id = ?
     ORDER BY size, color, id`,
    [productId]
  );

  res.json({
    ...products[0],
    variants: variants.map((variant) => ({
      ...variant,
      price: Number(variant.price),
      stock: Number(variant.stock),
    })),
  });
}

router.get('/categories', getCategories);
router.get('/products', getProducts);
router.get('/products/:id', getProduct);

module.exports = router;
