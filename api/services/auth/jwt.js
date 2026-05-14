/**
 * JWT con RS256 + refresh tokens en Redis
 *
 * Flujo:
 * 1. Login -> emite accessToken (15 min) + refreshToken (7 dias)
 * 2. Cliente usa accessToken en header Authorization
 * 3. Cuando expira, cliente usa refreshToken para obtener uno nuevo
 * 4. refreshToken se invalida y se emite uno nuevo (rotation)
 * 5. Tokens revocados van a blacklist en Redis con TTL = vida del token
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const redis = require('../redis');
const { AuthenticationError } = require('../../utils/errors');

const ACCESS_TTL = process.env.JWT_ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

// Cargar claves desde archivos (montados como Secret en K8s)
let privateKey;
let publicKey;

function loadKeys() {
  const privatePath = process.env.JWT_PRIVATE_KEY_PATH;
  const publicPath = process.env.JWT_PUBLIC_KEY_PATH;

  if (privatePath && fs.existsSync(privatePath)) {
    privateKey = fs.readFileSync(privatePath, 'utf8');
  } else if (process.env.JWT_PRIVATE_KEY) {
    privateKey = process.env.JWT_PRIVATE_KEY;
  } else {
    // Fallback dev only: generar par efimero
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

function signAccessToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TTL,
    issuer: 'micrositio-api',
  });
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await redis.set(`refresh:${token}`, userId, 'EX', REFRESH_TTL_SECONDS);
  return token;
}

async function rotateRefreshToken(oldToken) {
  const userId = await redis.get(`refresh:${oldToken}`);
  if (!userId) throw new AuthenticationError('Refresh token invalido o expirado');
  await redis.del(`refresh:${oldToken}`);
  return { userId, newToken: await issueRefreshToken(userId) };
}

async function revokeRefreshToken(token) {
  await redis.del(`refresh:${token}`);
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  } catch (err) {
    throw new AuthenticationError(`Token invalido: ${err.message}`);
  }
}

async function isAccessTokenRevoked(jti) {
  if (!jti) return false;
  const exists = await redis.exists(`revoked:${jti}`);
  return exists === 1;
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  verifyAccessToken,
  isAccessTokenRevoked,
};
