/**
 * Middleware de autenticacion JWT para rutas protegidas (panel del dueno)
 */
const { verifyAccessToken, isAccessTokenRevoked } = require('../services/auth/jwt');
const { AuthenticationError } = require('../utils/errors');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Falta header Authorization'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    if (await isAccessTokenRevoked(payload.jti)) {
      return next(new AuthenticationError('Token revocado'));
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      negocioId: payload.negocioId,
      jti: payload.jti, // necesario para revocar el token en logout
      exp: payload.exp, // TTL del blacklist al revocar
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
