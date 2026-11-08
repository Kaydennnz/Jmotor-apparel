# Jmotor Apparel

Jmotor Apparel is an online shop for a motorcycle apparel and accessories store. It has a three-tier architecture: a browser-based HTML/CSS/JavaScript front end, a Node.js/Express API, and a MySQL database.

## Tech stack

- Browser: plain HTML, CSS, and JavaScript
- Server: Node.js, Express 5, CommonJS
- Database: MySQL via `mysql2`
- Authentication: Express sessions and `bcryptjs`

## Setup

Complete these steps on Windows or macOS:

1. Install Node.js, XAMPP, and Git. Use the Node.js installer for your operating system and the XAMPP installer for your platform.
2. Open the XAMPP control application and start **MySQL**.
3. Clone the repository and enter its folder:

   ```sh
   git clone https://github.com/Kaydennnz/Jmotor-apparel.git
   cd Jmotor-apparel
   ```

4. Install the Node.js dependencies:

   ```sh
   npm install
   ```

5. Copy `.env.example` to `.env`.

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS Terminal:

   ```sh
   cp .env.example .env
   ```

   Configure the variables in `.env` for your local setup:

   | Variable | Purpose |
   |---|---|
   | `PORT` | Port used by the Express server. |
   | `DB_HOST` | MySQL host. |
   | `DB_PORT` | MySQL port. |
   | `DB_USER` | MySQL account used by setup and the server. |
   | `DB_PASSWORD` | Password for that MySQL account. |
   | `DB_NAME` | Database name used by the application; the schema creates `motorshop`. |
   | `SESSION_SECRET` | Secret used to sign session cookies; replace the example value. |
   | `OTP_MODE` | Set to `demo` to include the verification code in the registration response for display on screen. |

6. Create and seed the database:

   ```sh
   npm run setup
   ```

   **Warning:** this command drops and recreates the `motorshop` database, including its tables and data, before adding demo staff accounts.

7. Start the server:

   ```sh
   npm start
   ```

8. Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

| Role | Phone | Password |
|---|---|---|
| Admin | `09000000001` | `Admin@12345` |
| Staff | `09000000002` | `Staff@12345` |

Customers create accounts through the site's registration flow.

## Demo OTP

Registration verification codes are generated, stored as hashes, expire after five minutes, and allow up to five attempts. No SMS delivery is implemented. With `OTP_MODE=demo`, the code is returned to the browser and shown on screen instead of being sent by SMS.

## Roles

- **Customer:** registers and signs in, manages a cart, checks out, views their own orders, and can cancel eligible orders.
- **Staff:** manages order status, verifies qualifying payments, and updates variant stock.
- **Admin:** manages products and variants, creates and lists staff accounts, and views reports. Admins can also use staff order-management routes.

The server enforces login and role permissions; hiding or showing navigation links in the browser is only a user-interface behavior.

## Order flow

Orders use these statuses: `pending`, `confirmed`, `packed`, `shipped`, `delivered`, and `cancelled`. Staff can advance orders through `pending → confirmed → packed → shipped → delivered`; staff can cancel orders in `pending`, `confirmed`, or `packed`. Customers can cancel orders in `pending` or `confirmed`. Cancellation restores stock; paid payments are set to `refund_pending`.

Payment statuses are `unpaid`, `paid`, `refund_pending`, and `refunded`. Checkout creates an unpaid payment record. Staff can manually mark unpaid GCash or bank-transfer payments as paid after checking the reference; unpaid COD payments are marked paid when the order is delivered.

Checkout creates the order, order items, stock changes, payment, and status log and clears the cart within one database transaction.

## API overview

All paths below are relative to the local server origin (for example, `http://localhost:3000`). “Public” means the route does not require a signed-in session. Protected routes are enforced by the server.

| Method | Path | Who can call it |
|---|---|---|
| GET | `/api/health` | Public |
| POST | `/api/auth/request-code` | Public |
| POST | `/api/auth/verify-code` | Public |
| POST | `/api/auth/register` | Public, with a verified phone in the session |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Signed-in users |
| GET | `/api/auth/me` | Signed-in users |
| GET | `/api/auth/admin-check` | Admin |
| GET | `/api/categories` | Public |
| GET | `/api/products` | Public; optional `category` query filter |
| GET | `/api/products/:id` | Public |
| GET | `/api/cart/` | Signed-in users |
| POST | `/api/cart/items` | Signed-in users |
| PATCH | `/api/cart/items/:variantId` | Signed-in users |
| DELETE | `/api/cart/items/:variantId` | Signed-in users |
| GET | `/api/address` | Signed-in users |
| POST | `/api/checkout` | Signed-in users |
| GET | `/api/orders` | Signed-in users; returns their own orders |
| GET | `/api/orders/:id` | Signed-in users; only their own order |
| POST | `/api/orders/:id/cancel` | Signed-in users; only their own eligible order |
| GET | `/api/staff/orders` | Staff or admin |
| GET | `/api/staff/orders/:id` | Staff or admin |
| POST | `/api/staff/orders/:id/status` | Staff or admin |
| POST | `/api/staff/orders/:id/mark-paid` | Staff or admin |
| POST | `/api/staff/orders/:id/cancel` | Staff or admin |
| PATCH | `/api/staff/variants/:id/stock` | Staff or admin |
| GET | `/api/admin/products` | Admin |
| POST | `/api/admin/products` | Admin |
| PATCH | `/api/admin/products/:id` | Admin |
| POST | `/api/admin/products/:id/variants` | Admin |
| PATCH | `/api/admin/variants/:id` | Admin |
| POST | `/api/admin/staff` | Admin |
| GET | `/api/admin/staff` | Admin |
| GET | `/api/admin/reports` | Admin |

## Design decisions

- Shipping address text is copied into the order at checkout so the order retains the submitted delivery details.
- `order_items.unit_price` stores the purchase-time price independently of later variant price changes.
- Foreign keys use `RESTRICT` where deleting referenced orders, users, payments, or purchased variants could break order history. The schema also uses `CASCADE` for address/cart rows owned by a deleted user and variants owned by a deleted product.
- Database queries use parameterized `mysql2` calls.
- Passwords are hashed with `bcryptjs`; verification-code values are hashed as well.

## Known limitations

- Sessions use the default in-memory Express session store; restarting the server logs users out.
- OTP is demo-only: no SMS provider is configured, and the code is exposed in the browser when `OTP_MODE=demo`.
- There is no payment-gateway integration. Staff manually verify GCash and bank-transfer references.
- There is no returns workflow.
- Google sign-up is not implemented.

## Project structure

```text
database/
  schema.sql          Database schema and demo catalog seed data
public/
  *.html              Store, account, checkout, order, staff, and admin pages
  css/style.css       Shared page styles
  js/                 Browser-side page scripts and navigation
server/
  app.js              Express app, middleware, and route mounting
  db.js               MySQL connection pool
  setup.js            Database recreation and demo-account setup
  middleware/auth.js  Login and role middleware
  routes/             Auth, catalog, cart, order, staff, and admin routes
.env.example          Local environment-variable template
package.json          Dependencies and npm scripts
```

## Database design

ERD image placeholders: `docs/conceptual-erd.png` and `docs/logical-erd.png`.
