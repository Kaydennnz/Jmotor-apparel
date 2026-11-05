// Require a user session before continuing.
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Login required' });
  }

  next();
}

// Require a logged-in user with one of the allowed roles.
function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Login required' });
    }

    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

module.exports = { requireLogin, requireRole };
