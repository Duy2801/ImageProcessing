const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

function authResponse(user) {
  return {
    success: true,
    data: {
      user: user.toJSON(),
      token: signToken(user),
    },
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existed = await User.findOne({ email: normalizedEmail });

    if (existed) {
      return res.status(409).json({ success: false, error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return res.status(201).json(authResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    return res.json(authResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ success: true, data: { user: req.user.toJSON() } });
});

module.exports = router;
