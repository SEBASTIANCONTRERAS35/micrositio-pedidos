const express = require('express');
const crypto = require('crypto');
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

// Hash corto y estable del email para correlacionar intentos SIN exponer PII.
function emailHash(email) {
  return crypto
    .createHash('sha256')
    .update(String(email || '').toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

const LoginSchema = z.object({
  email: z.string().email().max(150),
  password: z.string().min(1).max(200),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// Login del dueno del negocio: valida credenciales y emite tokens
router.post('/login', authLimiter, validate(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const hashEmail = emailHash(email);

    const usuario = await Usuario.findOne({ email, activo: true });
    if (!usuario) {
      // Seguridad: nunca se loguea el email en claro, solo su hash.
      req.log.warn(
        {
          event: 'auth.login.fail',
          emailHash: hashEmail,
          motivo: 'usuario_inexistente',
          ip: req.ip,
        },
        'Intento de login con un usuario inexistente o inactivo'
      );
      throw new AuthenticationError('Credenciales invalidas');
    }

    if (!(await verifyPassword(usuario.passwordHash, password))) {
      req.log.warn(
        {
          event: 'auth.login.fail',
          emailHash: hashEmail,
          motivo: 'password_invalida',
          usuarioId: usuario._id.toString(),
          negocioId: usuario.negocioId.toString(),
          ip: req.ip,
        },
        'Intento de login con contrasena invalida'
      );
      throw new AuthenticationError('Credenciales invalidas');
    }

    const accessToken = signAccessToken({
      sub: usuario._id.toString(),
      email: usuario.email,
      negocioId: usuario.negocioId.toString(),
    });
    const refreshToken = await issueRefreshToken(usuario._id.toString());

    req.log.info(
      {
        event: 'auth.login.ok',
        usuarioId: usuario._id.toString(),
        negocioId: usuario.negocioId.toString(),
        emailHash: hashEmail,
        ip: req.ip,
      },
      'Login exitoso del dueno del negocio'
    );

    res.json({ accessToken, refreshToken });
  } catch (e) {
    next(e);
  }
});

// Rota el refresh token y emite un nuevo access token
router.post('/refresh', sensitiveLimiter, validate(RefreshSchema), async (req, res, next) => {
  try {
    let userId;
    let newToken;
    try {
      ({ userId, newToken } = await rotateRefreshToken(req.body.refreshToken));
    } catch (e) {
      // Refresh token invalido/expirado/reusado: posible robo de token.
      req.log.warn(
        { event: 'auth.refresh.fail', motivo: 'token_invalido', ip: req.ip },
        'Intento de refresh con un refresh token invalido o ya usado'
      );
      throw e;
    }

    const usuario = await Usuario.findById(userId);
    if (!usuario || !usuario.activo) {
      req.log.warn(
        { event: 'auth.refresh.fail', motivo: 'usuario_invalido', usuarioId: userId, ip: req.ip },
        'Intento de refresh para un usuario inexistente o inactivo'
      );
      throw new AuthenticationError('Usuario invalido');
    }

    const accessToken = signAccessToken({
      sub: usuario._id.toString(),
      email: usuario.email,
      negocioId: usuario.negocioId.toString(),
    });

    req.log.info(
      {
        event: 'auth.refresh.ok',
        usuarioId: usuario._id.toString(),
        negocioId: usuario.negocioId.toString(),
        ip: req.ip,
      },
      'Refresh token rotado y access token renovado'
    );

    res.json({ accessToken, refreshToken: newToken });
  } catch (e) {
    next(e);
  }
});

// Logout: revoca el refresh token y el access token actual
router.post(
  '/logout',
  sensitiveLimiter,
  requireAuth,
  validate(RefreshSchema),
  async (req, res, next) => {
    try {
      await revokeRefreshToken(req.body.refreshToken);
      await revokeAccessToken(req.user.jti, req.user.exp);

      req.log.info(
        {
          event: 'auth.logout',
          usuarioId: req.user.id,
          negocioId: req.user.negocioId,
          jti: req.user.jti,
          ip: req.ip,
        },
        'Logout exitoso: tokens revocados'
      );

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
