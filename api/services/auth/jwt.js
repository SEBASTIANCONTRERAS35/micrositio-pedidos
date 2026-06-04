const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const redis = require('../redis');
const logger = require('../../utils/logger');
const { AuthenticationError } = require('../../utils/errors');

const ACCESS_TTL = process.env.JWT_ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

let privateKey;
let publicKey;

// Carga las claves RSA desde archivos o variables de entorno
function loadKeys() {
  const privatePath = process.env.JWT_PRIVATE_KEY_PATH;
  const publicPath = process.env.JWT_PUBLIC_KEY_PATH;

  if (privatePath && fs.existsSync(privatePath)) {
    privateKey = fs.readFileSync(privatePath, 'utf8');
  } else if (process.env.JWT_PRIVATE_KEY) {
    privateKey = process.env.JWT_PRIVATE_KEY;
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_PRIVATE_KEY_PATH o JWT_PRIVATE_KEY requerido en produccion');
    }
    const { publicKey: pk, privateKey: sk } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = sk;
    publicKey = pk;
    return;
  }

  if (publicPath && fs.existsSync(publicPath)) {
    publicKey = fs.readFileSync(publicPath, 'utf8');
  } else if (process.env.JWT_PUBLIC_KEY) {
    publicKey = process.env.JWT_PUBLIC_KEY;
  } else {
    publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  }
}

loadKeys();

// Firma un access token RS256 con jti unico y expiracion
function signAccessToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TTL,
    issuer: 'micrositio-api',
    jwtid: crypto.randomBytes(16).toString('hex'),
  });
}

// Emite un refresh token y lo guarda en Redis con TTL
async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await redis.set(`refresh:${token}`, userId, 'EX', REFRESH_TTL_SECONDS);
  return token;
}

// Rota un refresh token: invalida el viejo y emite uno nuevo
async function rotateRefreshToken(oldToken) {
  const userId = await redis.get(`refresh:${oldToken}`);
  if (!userId) {
    // Seguridad: refresh token desconocido (expirado/ya rotado/posible robo).
    // No se loguea el token; solo el evento para alertar reuso.
    logger.warn(
      { event: 'auth.refresh.fail', motivo: 'token_no_encontrado' },
      'Rotacion rechazada: refresh token invalido o expirado'
    );
    throw new AuthenticationError('Refresh token invalido o expirado');
  }
  await redis.del(`refresh:${oldToken}`);
  return { userId, newToken: await issueRefreshToken(userId) };
}

// Revoca un refresh token borrandolo de Redis
async function revokeRefreshToken(token) {
  await redis.del(`refresh:${token}`);
}

// Verifica un access token RS256 y devuelve su payload
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  } catch (err) {
    // Seguridad: token invalido/expirado/firma incorrecta. Se loguea solo el
    // motivo (err.message de la libreria), NUNCA el token en si.
    logger.warn(
      { event: 'auth.token.invalido', motivo: err.message },
      'Verificacion de access token fallida'
    );
    throw new AuthenticationError(`Token invalido: ${err.message}`);
  }
}

// Indica si un access token esta revocado segun su jti en la blacklist
async function isAccessTokenRevoked(jti) {
  if (!jti) {
    return false;
  }
  const existe = await redis.exists(`revoked:${jti}`);
  return existe === 1;
}

// Revoca un access token por su jti metiendolo en la blacklist de Redis
async function revokeAccessToken(jti, expiresAtUnix) {
  if (!jti) {
    return;
  }
  const ttl = Math.max(1, (expiresAtUnix || 0) - Math.floor(Date.now() / 1000));
  await redis.set(`revoked:${jti}`, '1', 'EX', ttl);
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
  isAccessTokenRevoked,
  revokeAccessToken,
};
