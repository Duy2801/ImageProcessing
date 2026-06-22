const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
