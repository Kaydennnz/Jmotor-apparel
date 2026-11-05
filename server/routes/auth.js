const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
const phonePattern = /^09\d{9}$/;
const loginError = 'Invalid phone number or password';

// Replace the current session ID to protect against session fixation.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

// Remove the session from the session store.
function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

// Send a hashed, five-minute verification code for an unregistered phone.
async function requestCode(req, res) {
  const { phone } = req.body;

  if (typeof phone !== 'string' || !phonePattern.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid Philippine mobile number' });
  }

  const [users] = await pool.execute(
    'SELECT id FROM users WHERE phone = ? LIMIT 1',
    [phone]
  );

  if (users.length > 0) {
    return res.status(409).json({ error: 'Phone number is already registered' });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.execute(
    'UPDATE verification_codes SET used = 1 WHERE phone = ? AND used = 0',
    [phone]
  );
  await pool.execute(
    'INSERT INTO verification_codes (phone, code_hash, expires_at, attempts, used) VALUES (?, ?, ?, 0, 0)',
    [phone, codeHash, expiresAt]
  );

  const response = { message: 'Verification code created' };
  if (process.env.OTP_MODE === 'demo') {
    response.code = code;
  }

  res.json(response);
}

// Check the latest valid code and save the verified phone in the session.
async function verifyCode(req, res) {
  const { phone, code } = req.body;

  if (typeof phone !== 'string' || !phonePattern.test(phone)
      || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter a valid phone number and six-digit code' });
  }

  const [codes] = await pool.execute(
    'SELECT id, code_hash, attempts FROM verification_codes WHERE phone = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC, id DESC LIMIT 1',
    [phone]
  );

  if (codes.length === 0) {
    return res.status(400).json({ error: 'Verification code is invalid or expired' });
  }

  const verification = codes[0];
  if (verification.attempts >= 5) {
    return res.status(429).json({ error: 'Too many verification attempts' });
  }

  const matches = await bcrypt.compare(code, verification.code_hash);
  if (!matches) {
    await pool.execute(
      'UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?',
      [verification.id]
    );
    return res.status(400).json({ error: 'Verification code is incorrect' });
  }

  await pool.execute(
    'UPDATE verification_codes SET used = 1 WHERE id = ?',
    [verification.id]
  );
  req.session.verifiedPhone = phone;
  res.json({ message: 'Phone verified' });
}

// Register the verified phone and start a customer session.
async function register(req, res) {
  const phone = req.session.verifiedPhone;
  const { password, displayName } = req.body;

  if (!phone) {
    return res.status(401).json({ error: 'Verify your phone number first' });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 100) {
    return res.status(400).json({ error: 'Display name is required and must be 100 characters or fewer' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let result;
  try {
    const [insertResult] = await pool.execute(
      'INSERT INTO users (phone, password_hash, display_name, role, phone_verified) VALUES (?, ?, ?, ?, ?)',
      [phone, passwordHash, displayName.trim(), 'customer', 1]
    );
    result = insertResult;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Phone number is already registered' });
    }
    throw error;
  }

  await regenerateSession(req);
  req.session.userId = result.insertId;
  req.session.role = 'customer';

  res.status(201).json({
    id: result.insertId,
    displayName: displayName.trim(),
    role: 'customer',
  });
}

// Check credentials and replace the session ID before logging the user in.
async function login(req, res) {
  const { phone, password } = req.body;
  if (typeof phone !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: loginError });
  }

  const [users] = await pool.execute(
    'SELECT id, password_hash, display_name, role, is_active FROM users WHERE phone = ? LIMIT 1',
    [phone]
  );

  const user = users[0];
  const matches = user && user.password_hash
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!matches || !user.is_active) {
    return res.status(401).json({ error: loginError });
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.role = user.role;

  res.json({
    id: user.id,
    displayName: user.display_name,
    role: user.role,
  });
}

// Destroy the current session.
async function logout(req, res) {
  await destroySession(req);
  res.clearCookie('connect.sid');
  res.json({ message: 'Logged out' });
}

// Return the signed-in user's public account details.
async function getMe(req, res) {
  const [users] = await pool.execute(
    'SELECT id, display_name, role, is_active FROM users WHERE id = ? LIMIT 1',
    [req.session.userId]
  );

  if (users.length === 0 || !users[0].is_active) {
    return res.status(401).json({ error: 'Login required' });
  }

  res.json({
    id: users[0].id,
    displayName: users[0].display_name,
    role: users[0].role,
  });
}

router.post('/request-code', requestCode);
router.post('/verify-code', verifyCode);
router.post('/register', register);
router.post('/login', login);
router.post('/logout', requireLogin, logout);
router.get('/me', requireLogin, getMe);
// Confirm that the signed-in user has the administrator role.
function adminCheck(req, res) {
  res.json({ ok: true });
}

router.get('/admin-check', requireRole('admin'), adminCheck);

module.exports = router;
