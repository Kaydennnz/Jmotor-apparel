require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const cartRoutes = require('./routes/cart');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/cart', cartRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = ?',
      [process.env.DB_NAME]
    );

    res.json({
      status: 'ok',
      database: 'connected',
      tables: Number(rows[0].tables),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Return application errors as JSON.
app.use((error, req, res, next) => {
  res.status(error.status || 500).json({
    status: 'error',
    message: error.message,
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
