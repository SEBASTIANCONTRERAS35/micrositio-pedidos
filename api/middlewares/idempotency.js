const crypto = require('crypto');
const redis = require('../services/redis');
const baseLogger = require('../utils/logger');

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
  // Usa el child logger del request (requestId/usuarioId/negocioId) si existe.
  const log = req.log || baseLogger;
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
        // Mismo Idempotency-Key con cuerpo distinto: posible error del cliente.
        log.warn(
          {
            event: 'idempotency.conflicto',
            idempotencyKey: key,
            requestId: req.id,
            path: req.path,
          },
          'Idempotency-Key reusado con un cuerpo de peticion distinto'
        );
        return res.status(422).json({
          error: 'IDEMPOTENCY_KEY_REUSED',
          message: 'El Idempotency-Key ya se uso con un cuerpo de peticion distinto.',
        });
      }
      // Replay de una respuesta ya cacheada (idempotencia funcionando).
      log.info(
        {
          event: 'idempotency.replay',
          idempotencyKey: key,
          requestId: req.id,
          path: req.path,
          status: parseado.status,
        },
        'Respuesta servida desde cache de idempotencia'
      );
      return res.status(parseado.status).json(parseado.body);
    }
    // No habia respuesta cacheada: la peticion se procesa por primera vez.
    log.debug(
      { event: 'idempotency.miss', idempotencyKey: key, requestId: req.id, path: req.path },
      'Idempotency-Key sin respuesta previa; procesando peticion'
    );
  } catch (err) {
    log.error(
      { event: 'idempotency.error', err, idempotencyKey: key, requestId: req.id, path: req.path },
      'Fallo al consultar la cache de idempotencia'
    );
  }

  const jsonOriginal = res.json.bind(res);
  // Intercepta res.json para cachear en Redis las respuestas exitosas.
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis
        .set(redisKey, JSON.stringify({ status: res.statusCode, body, bodyHash }), 'EX', TTL, 'NX')
        .catch((err) =>
          log.error(
            { event: 'idempotency.error', err, idempotencyKey: key, requestId: req.id },
            'Fallo al cachear la respuesta idempotente'
          )
        );
    }
    return jsonOriginal(body);
  };

  next();
}

module.exports = idempotency;
