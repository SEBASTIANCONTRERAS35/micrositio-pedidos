/**
 * Idempotency middleware
 * Si el cliente envia el mismo Idempotency-Key, regresa la respuesta cacheada
 * en vez de procesar la request dos veces
 */
const redis = require('../services/redis');
const logger = require('../utils/logger');

const TTL = 24 * 60 * 60; // 24 horas

async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const redisKey = `idempotency:${req.method}:${req.path}:${key}`;

  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      logger.info({ idempotencyKey: key }, 'Idempotency hit');
      return res.status(status).json(body);
    }
  } catch (err) {
    logger.error({ err, idempotencyKey: key }, 'Idempotency check failed');
  }

  // Interceptar res.json para guardar la respuesta
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Solo cachear respuestas exitosas
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis
        .set(redisKey, JSON.stringify({ status: res.statusCode, body }), 'EX', TTL, 'NX')
        .catch((err) => logger.error({ err }, 'Failed to cache idempotent response'));
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotency;
