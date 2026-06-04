const { verifyAccessToken, isAccessTokenRevoked } = require('../services/auth/jwt');
const { AuthenticationError } = require('../utils/errors');
const baseLogger = require('../utils/logger');

// Middleware de autenticacion JWT para rutas protegidas (panel del dueno)
async function requireAuth(req, res, next) {
  // Logger base del request (solo trae ip hasta aqui); se enriquece al validar.
  const log = req.log || baseLogger;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn(
      { event: 'auth.denied', motivo: 'falta_bearer', ip: req.ip, path: req.path },
      'Acceso denegado: falta el header Authorization Bearer'
    );
    return next(new AuthenticationError('Falta header Authorization'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    if (await isAccessTokenRevoked(payload.jti)) {
      log.warn(
        {
          event: 'auth.denied',
          motivo: 'token_revocado',
          ip: req.ip,
          path: req.path,
          jti: payload.jti,
          usuarioId: payload.sub,
        },
        'Acceso denegado: el token fue revocado'
      );
      return next(new AuthenticationError('Token revocado'));
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      negocioId: payload.negocioId,
      jti: payload.jti,
      exp: payload.exp,
    };

    // Enriquece el logger del request con la identidad para correlacionar
    // todos los logs posteriores (rutas/servicios) por usuario y negocio.
    if (req.log) {
      req.log = req.log.child({
        requestId: req.id,
        usuarioId: payload.sub,
        negocioId: payload.negocioId,
      });
    }

    next();
  } catch (err) {
    log.warn(
      { event: 'auth.denied', motivo: 'token_invalido', ip: req.ip, path: req.path },
      'Acceso denegado: token invalido o expirado'
    );
    next(err);
  }
}

module.exports = requireAuth;
