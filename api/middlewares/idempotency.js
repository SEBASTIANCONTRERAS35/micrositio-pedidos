/**
 * Idempotency middleware
 * Si el cliente envia el mismo Idempotency-Key, regresa la respuesta cacheada
 * en vez de procesar la request dos veces.
 *
 * SEGURIDAD: el Idempotency-Key lo controla 100% el cliente. Si solo cacheamos
 * por key, un atacante puede reusar un key con OTRO body y recibir la respuesta
 * vieja (cache poisoning). Por eso atamos la entrada al hash del body: un mismo
 * key con body distinto se rechaza (422), no se sirve la respuesta stale.
 */
const crypto = require('crypto');
const redis = require('../services/redis');
const logger = require('../utils/logger');

const TTL = 24 * 60 * 60; // 24 horas

function hashBody(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body || {}))
    .digest('hex');
}

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
      // El Idempotency-Key se reuso con un body DISTINTO: no servir la
      // respuesta vieja (cache poisoning) ni reprocesar — es error del cliente.
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

  // Interceptar res.json para guardar la respuesta + el hash del body
  const jsonOriginal = res.json.bind(res);
  res.json = (body) => {
    // Solo cachear respuestas exitosas
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
