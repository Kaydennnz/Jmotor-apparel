DROP DATABASE IF EXISTS motorshop;
CREATE DATABASE motorshop CHARACTER SET utf8mb4;
USE motorshop;

-- User accounts for customers and store staff.
CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(20) NULL,
    email VARCHAR(255) NULL,
    google_id VARCHAR(255) NULL,
    password_hash VARCHAR(255) NULL,
    display_name VARCHAR(100) NOT NULL,
    role ENUM('customer', 'staff', 'admin') NOT NULL DEFAULT 'customer',
    phone_verified BOOLEAN NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_phone (phone),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_google_id (google_id),
    CONSTRAINT chk_users_phone_or_email CHECK (phone IS NOT NULL OR email IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One-time verification codes are associated with phone numbers, not accounts.
CREATE TABLE verification_codes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(20) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_verification_codes_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Saved delivery addresses for each user.
CREATE TABLE addresses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    street_address VARCHAR(255) NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_addresses_user_id (user_id),
    CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product categories available in the shop.
CREATE TABLE categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catalog products, grouped by category.
CREATE TABLE products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    image_url VARCHAR(2048) NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_products_category_active (category_id, is_active),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Purchasable size/color and price options for each catalog product.
CREATE TABLE product_variants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(100) NOT NULL,
    size VARCHAR(30) NULL,
    color VARCHAR(50) NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_variants_sku (sku),
    UNIQUE KEY uq_product_variants_product_size_color (product_id, size, color),
    KEY idx_product_variants_product_id (product_id),
    CONSTRAINT chk_product_variants_price CHECK (price >= 0),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Items currently held in a user's shopping cart.
CREATE TABLE cart_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    quantity INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cart_items_user_variant (user_id, variant_id),
    KEY idx_cart_items_variant_id (variant_id),
    CONSTRAINT chk_cart_items_quantity CHECK (quantity > 0),
    CONSTRAINT fk_cart_items_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer orders retain their checkout shipping details and status.
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    shipping_address TEXT NOT NULL,
    status ENUM('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_orders_user_status (user_id, status),
    CONSTRAINT chk_orders_total_amount CHECK (total_amount >= 0),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Purchased variants and their prices as paid at checkout.
CREATE TABLE order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_items_order_variant (order_id, variant_id),
    KEY idx_order_items_variant_id (variant_id),
    CONSTRAINT chk_order_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_order_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment attempts or records associated with an order.
CREATE TABLE payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    method ENUM('cod', 'gcash', 'bank_transfer') NOT NULL,
    status ENUM('unpaid', 'paid', 'refund_pending', 'refunded') NOT NULL DEFAULT 'unpaid',
    reference_number VARCHAR(255) NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_payments_order_id (order_id),
    CONSTRAINT chk_payments_amount CHECK (amount >= 0),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit history of order status changes and the user who made each change.
CREATE TABLE order_status_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    old_status ENUM('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled') NULL,
    new_status ENUM('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled') NOT NULL,
    reason VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_order_status_logs_order_id (order_id),
    KEY idx_order_status_logs_changed_by (changed_by),
    CONSTRAINT fk_order_status_logs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
    CONSTRAINT fk_order_status_logs_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the shop's product categories.
INSERT INTO categories (id, name) VALUES
    (1, 'Gloves'),
    (2, 'Long Sleeves'),
    (3, 'T-Shirts'),
    (4, 'Knee Guards'),
    (5, 'Elbow Guards'),
    (6, 'Stickers');

-- Seed demo products: two examples for each category.
INSERT INTO products (id, category_id, name, description, image_url) VALUES
    (1, 1, 'Jmotor TrailGrip Riding Gloves', 'Breathable gloves with reinforced palms for daily rides and light trail use.', NULL),
    (2, 1, 'Jmotor RoadShield Gloves', 'Abrasion-resistant road gloves with padded knuckles and a secure wrist closure.', NULL),
    (3, 2, 'Jmotor Apex Moto Long Sleeve', 'Lightweight riding shirt with a comfortable, relaxed fit.', NULL),
    (4, 2, 'Jmotor Enduro Line Long Sleeve', 'Durable long sleeve for trail days and everyday wear.', NULL),
    (5, 3, 'Jmotor Garage Classic T-Shirt', 'Soft cotton crew-neck tee with a clean garage-inspired design.', NULL),
    (6, 3, 'Jmotor Ride More T-Shirt', 'Everyday cotton tee for riders, available in two versatile colors.', NULL),
    (7, 4, 'Jmotor TrailLock Knee Guards', 'Adjustable impact guards designed to stay in place on the trail.', NULL),
    (8, 4, 'Jmotor RoadFlex Knee Guards', 'Lightweight knee protection with flexible, contoured shells.', NULL),
    (9, 5, 'Jmotor TrailLock Elbow Guards', 'Adjustable elbow guards with a flexible shell for trail riding.', NULL),
    (10, 5, 'Jmotor RoadFlex Elbow Guards', 'Low-profile elbow protection with comfortable, secure straps.', NULL),
    (11, 6, 'Jmotor Racing Number Sticker Set', 'Water-resistant racing number decals for helmets and gear.', NULL),
    (12, 6, 'Jmotor Moto Badge Sticker Pack', 'A set of durable Jmotor-inspired moto badge decals.', NULL);

-- Seed apparel and glove variants in sizes S, M, L, and XL; stock ranges from 5 to 30.
INSERT INTO product_variants (product_id, sku, size, color, price, stock) VALUES
    (1, 'JM-GLV-TG-BLK-S', 'S', 'Black', 1290.00, 12),
    (1, 'JM-GLV-TG-BLK-M', 'M', 'Black', 1290.00, 18),
    (1, 'JM-GLV-TG-BLK-L', 'L', 'Black', 1290.00, 15),
    (1, 'JM-GLV-TG-BLK-XL', 'XL', 'Black', 1290.00, 8),
    (1, 'JM-GLV-TG-RED-S', 'S', 'Black/Red', 1290.00, 10),
    (1, 'JM-GLV-TG-RED-M', 'M', 'Black/Red', 1290.00, 20),
    (1, 'JM-GLV-TG-RED-L', 'L', 'Black/Red', 1290.00, 14),
    (1, 'JM-GLV-TG-RED-XL', 'XL', 'Black/Red', 1290.00, 6),
    (2, 'JM-GLV-RS-BLK-S', 'S', 'Black', 1590.00, 9),
    (2, 'JM-GLV-RS-BLK-M', 'M', 'Black', 1590.00, 16),
    (2, 'JM-GLV-RS-BLK-L', 'L', 'Black', 1590.00, 13),
    (2, 'JM-GLV-RS-BLK-XL', 'XL', 'Black', 1590.00, 7),
    (2, 'JM-GLV-RS-GRY-S', 'S', 'Black/Grey', 1590.00, 11),
    (2, 'JM-GLV-RS-GRY-M', 'M', 'Black/Grey', 1590.00, 19),
    (2, 'JM-GLV-RS-GRY-L', 'L', 'Black/Grey', 1590.00, 17),
    (2, 'JM-GLV-RS-GRY-XL', 'XL', 'Black/Grey', 1590.00, 5),
    (3, 'JM-LS-AP-BLK-S', 'S', 'Black', 890.00, 20),
    (3, 'JM-LS-AP-BLK-M', 'M', 'Black', 890.00, 24),
    (3, 'JM-LS-AP-BLK-L', 'L', 'Black', 890.00, 18),
    (3, 'JM-LS-AP-BLK-XL', 'XL', 'Black', 890.00, 10),
    (3, 'JM-LS-AP-WHT-S', 'S', 'White', 890.00, 16),
    (3, 'JM-LS-AP-WHT-M', 'M', 'White', 890.00, 22),
    (3, 'JM-LS-AP-WHT-L', 'L', 'White', 890.00, 13),
    (3, 'JM-LS-AP-WHT-XL', 'XL', 'White', 890.00, 7),
    (4, 'JM-LS-EL-NVY-S', 'S', 'Navy', 990.00, 12),
    (4, 'JM-LS-EL-NVY-M', 'M', 'Navy', 990.00, 21),
    (4, 'JM-LS-EL-NVY-L', 'L', 'Navy', 990.00, 17),
    (4, 'JM-LS-EL-NVY-XL', 'XL', 'Navy', 990.00, 9),
    (4, 'JM-LS-EL-GRN-S', 'S', 'Olive', 990.00, 15),
    (4, 'JM-LS-EL-GRN-M', 'M', 'Olive', 990.00, 23),
    (4, 'JM-LS-EL-GRN-L', 'L', 'Olive', 990.00, 14),
    (4, 'JM-LS-EL-GRN-XL', 'XL', 'Olive', 990.00, 6),
    (5, 'JM-TEE-GC-BLK-S', 'S', 'Black', 590.00, 25),
    (5, 'JM-TEE-GC-BLK-M', 'M', 'Black', 590.00, 28),
    (5, 'JM-TEE-GC-BLK-L', 'L', 'Black', 590.00, 20),
    (5, 'JM-TEE-GC-BLK-XL', 'XL', 'Black', 590.00, 11),
    (5, 'JM-TEE-GC-WHT-S', 'S', 'White', 590.00, 19),
    (5, 'JM-TEE-GC-WHT-M', 'M', 'White', 590.00, 26),
    (5, 'JM-TEE-GC-WHT-L', 'L', 'White', 590.00, 17),
    (5, 'JM-TEE-GC-WHT-XL', 'XL', 'White', 590.00, 8),
    (6, 'JM-TEE-RM-CHR-S', 'S', 'Charcoal', 650.00, 14),
    (6, 'JM-TEE-RM-CHR-M', 'M', 'Charcoal', 650.00, 22),
    (6, 'JM-TEE-RM-CHR-L', 'L', 'Charcoal', 650.00, 18),
    (6, 'JM-TEE-RM-CHR-XL', 'XL', 'Charcoal', 650.00, 9),
    (6, 'JM-TEE-RM-RED-S', 'S', 'Red', 650.00, 13),
    (6, 'JM-TEE-RM-RED-M', 'M', 'Red', 650.00, 24),
    (6, 'JM-TEE-RM-RED-L', 'L', 'Red', 650.00, 16),
    (6, 'JM-TEE-RM-RED-XL', 'XL', 'Red', 650.00, 7);

-- Seed knee and elbow guards in sizes S, M, and L.
INSERT INTO product_variants (product_id, sku, size, color, price, stock) VALUES
    (7, 'JM-KG-TL-BLK-S', 'S', 'Black', 1890.00, 10),
    (7, 'JM-KG-TL-BLK-M', 'M', 'Black', 1890.00, 18),
    (7, 'JM-KG-TL-BLK-L', 'L', 'Black', 1890.00, 12),
    (8, 'JM-KG-RF-BLK-S', 'S', 'Black', 1590.00, 15),
    (8, 'JM-KG-RF-BLK-M', 'M', 'Black', 1590.00, 22),
    (8, 'JM-KG-RF-BLK-L', 'L', 'Black', 1590.00, 11),
    (9, 'JM-EG-TL-BLK-S', 'S', 'Black', 1190.00, 9),
    (9, 'JM-EG-TL-BLK-M', 'M', 'Black', 1190.00, 16),
    (9, 'JM-EG-TL-BLK-L', 'L', 'Black', 1190.00, 13),
    (10, 'JM-EG-RF-BLK-S', 'S', 'Black', 990.00, 20),
    (10, 'JM-EG-RF-BLK-M', 'M', 'Black', 990.00, 24),
    (10, 'JM-EG-RF-BLK-L', 'L', 'Black', 990.00, 17);

-- Seed sticker products with one default variant each.
INSERT INTO product_variants (product_id, sku, size, color, price, stock) VALUES
    (11, 'JM-ST-RN-DEFAULT', 'One Size', 'Default', 250.00, 30),
    (12, 'JM-ST-MB-DEFAULT', 'One Size', 'Default', 320.00, 25);
