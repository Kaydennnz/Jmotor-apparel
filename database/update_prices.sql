START TRANSACTION;

-- Rename each sticker's existing default variant to Set before adding Pack.
UPDATE product_variants AS pv
JOIN products AS p ON p.id = pv.product_id
JOIN categories AS c ON c.id = p.category_id
SET pv.size = 'Set'
WHERE c.name = 'Stickers'
  AND pv.size NOT IN ('Set', 'Pack');

-- Apply the catalog prices by category and size, without relying on product IDs.
UPDATE product_variants AS pv
JOIN products AS p ON p.id = pv.product_id
JOIN categories AS c ON c.id = p.category_id
SET pv.price = CASE
    WHEN c.name = 'Gloves' AND pv.size IN ('S', 'M') THEN 399.00
    WHEN c.name = 'Gloves' AND pv.size IN ('L', 'XL') THEN 499.00
    WHEN c.name = 'Long Sleeves' AND pv.size IN ('S', 'M') THEN 499.00
    WHEN c.name = 'Long Sleeves' AND pv.size IN ('L', 'XL') THEN 599.00
    WHEN c.name = 'T-Shirts' AND pv.size IN ('S', 'M') THEN 259.00
    WHEN c.name = 'T-Shirts' AND pv.size IN ('L', 'XL') THEN 299.00
    WHEN c.name IN ('Knee Guards', 'Elbow Guards') THEN 799.00
    WHEN c.name = 'Stickers' AND pv.size = 'Set' THEN 100.00
    WHEN c.name = 'Stickers' AND pv.size = 'Pack' THEN 200.00
    ELSE pv.price
END
WHERE c.name IN (
    'Gloves',
    'Long Sleeves',
    'T-Shirts',
    'Knee Guards',
    'Elbow Guards',
    'Stickers'
);

-- Copy each Set variant's color, stock, and active state for its Pack variant.
INSERT INTO product_variants (product_id, sku, size, color, price, stock, is_active)
SELECT
    set_variant.product_id,
    CONCAT(set_variant.sku, '-PACK'),
    'Pack',
    set_variant.color,
    200.00,
    set_variant.stock,
    set_variant.is_active
FROM product_variants AS set_variant
JOIN products AS p ON p.id = set_variant.product_id
JOIN categories AS c ON c.id = p.category_id
WHERE c.name = 'Stickers'
  AND set_variant.size = 'Set'
  AND NOT EXISTS (
      SELECT 1
      FROM product_variants AS pack_variant
      WHERE pack_variant.product_id = set_variant.product_id
        AND pack_variant.size = 'Pack'
  );

COMMIT;
