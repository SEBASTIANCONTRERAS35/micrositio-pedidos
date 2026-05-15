/**
 * Login del dueno del negocio
 */
const express = require('express');
const { z } = require('zod');
const Usuario = require('../models/usuario');
const { verifyPassword } = require('../services/auth/argon2');
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAccessToken,
} = require('../services/auth/jwt');
const { validate } = require('../middlewares/validation');
const { authLimiter, sensitiveLimiter } = require('../middlewares/rateLimit');
const requireAuth = require('../middlewares/auth');
const { AuthenticationError } = require('../utils/errors');

const router = express.Router();

const LoginSchema = z.object({
  email: z.string().email().max(150),
  password: z.string().min(1).max(200),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const usuario = await Usuario.findOne({ email, activo: true });
    if (!usuario || !(await verifyPassword(usuario.passwordHash, password))) {
      throw new AuthenticationError('Credenciales invalidas');
    }

    const accessToken = signAccessToken({
      sub: usuario._id.toString(),
      email: usuario.email,
      negocioId: usuario.negocioId.toString(),
    });
    const refreshToken = await issueRefreshToken(usuario._id.toString());

    res.json({ accessToken, refreshToken });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/refresh
router.post('/refresh', sensitiveLimiter, validate(RefreshSchema), async (req, res, next) => {
  try {
    const { userId, newToken } = await rotateRefreshToken(req.body.refreshToken);
    const usuario = await Usuario.findById(userId);
    if (!usuario || !usuario.activo) {
      throw new AuthenticationError('Usuario invalido');
    }

    const accessToken = signAccessToken({
      sub: usuario._id.toString(),
      email: usuario.email,
      negocioId: usuario.negocioId.toString(),
    });

    res.json({ accessToken, refreshToken: newToken });
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/logout — revoca el refresh token Y el access token actual.
// requireAuth nos da el jti del access token para meterlo en la blacklist.
router.post(
  '/logout',
  sensitiveLimiter,
  requireAuth,
  validate(RefreshSchema),
  async (req, res, next) => {
    try {
      await revokeRefreshToken(req.body.refreshToken);
      await revokeAccessToken(req.user.jti, req.user.exp);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
