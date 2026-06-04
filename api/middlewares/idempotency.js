const crypto = require('crypto');
const redis = require('../services/redis');
const logger = require('../utils/logger');

const TTL = 24 * 60 * 60;

// Calcula el hash SHA-256 del cuerpo de la peticion.
function hashBody(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body || {}))
    .digest('hex');
}

// Middleware que cachea respuestas por Idempotency-Key atado al hash del body.
async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) {
    return next();
  }

  const redisKey = `idempotency:${req.method}:${req.path}:${key}`;
  const bodyHash = hashBody(req.body);

  try {
    const cacheado = await redis.get(redisKey);
    if (cacheado) {
      const parseado = JSON.parse(cacheado);
      if (parseado.bodyHash !== bodyHash) {
        logger.warn({ idempotencyKey: key }, 'Idempotency-Key reusado con body distinto');
        return res.status(422).json({
          error: 'IDEMPOTENCY_KEY_REUSED',
          message: 'El Idempotency-Key ya se uso con un cuerpo de peticion distinto.',
        });
      }
      logger.info({ idempotencyKey: key }, 'Idempotency hit');
      return res.status(parseado.status).json(parseado.body);
    }
  } catch (err) {
    logger.error({ err, idempotencyKey: key }, 'Idempotency check failed');
  }

  const jsonOriginal = res.json.bind(res);
  // Intercepta res.json para cachear en Redis las respuestas exitosas.
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis
        .set(redisKey, JSON.stringify({ status: res.statusCode, body, bodyHash }), 'EX', TTL, 'NX')
        .catch((err) => logger.error({ err }, 'Failed to cache idempotent response'));
    }
    return jsonOriginal(body);
  };

  next();
}

module.exports = idempotency;
