require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function setupDatabase() {
  console.warn('Warning: this script drops and recreates the motorshop database.');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    await connection.query(schema);

    const accounts = [
      { phone: '09000000001', password: 'Admin@12345', displayName: 'Demo Admin', role: 'admin' },
      { phone: '09000000002', password: 'Staff@12345', displayName: 'Demo Staff', role: 'staff' },
    ];

    for (const account of accounts) {
      const passwordHash = await bcrypt.hash(account.password, 10);
      await connection.execute(
        'INSERT INTO users (phone, password_hash, display_name, role, phone_verified) VALUES (?, ?, ?, ?, ?)',
        [account.phone, passwordHash, account.displayName, account.role, 1]
      );
    }

    console.log('Database ready');
    console.log('Demo admin: 09000000001 / Admin@12345');
    console.log('Demo staff: 09000000002 / Staff@12345');
  } finally {
    await connection.end();
  }
}

setupDatabase().catch((error) => {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
});
