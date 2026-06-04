const { RateLimiterRedis } = require('rate-limiter-flexible');
const redis = require('../services/redis');
const { RateLimitError } = require('../utils/errors');
const baseLogger = require('../utils/logger');

const limiterPublic = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:pub',
  points: parseInt(process.env.RATE_LIMIT_PUBLIC_POINTS || '100', 10),
  duration: parseInt(process.env.RATE_LIMIT_PUBLIC_DURATION || '60', 10),
});

const limiterWebhook = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:webhook',
  points: parseInt(process.env.RATE_LIMIT_WEBHOOK_POINTS || '200', 10),
  duration: parseInt(process.env.RATE_LIMIT_WEBHOOK_DURATION || '60', 10),
});

const limiterAuth = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:auth',
  points: 10,
  duration: 60 * 15,
  blockDuration: 60 * 60,
});

const limiterSensitive = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:sensitive',
  points: 30,
  duration: 60,
});

// Crea un middleware de rate limit que consume puntos por IP.
// `nombre` identifica al limiter para distinguir abuso de auth vs webhook/etc.
function makeLimiter(limiter, nombre) {
  return async (req, res, next) => {
    try {
      await limiter.consume(req.ip || 'unknown');
      next();
    } catch (rejRes) {
      const msBeforeNext = rejRes && rejRes.msBeforeNext;
      res.set('Retry-After', String(Math.round(msBeforeNext / 1000) || 60));
      // Seguridad: bloqueo por exceso de peticiones (posible fuerza bruta/abuso).
      const log = req.log || baseLogger;
      log.warn(
        {
          event: 'security.ratelimited',
          limiter: nombre,
          ip: req.ip,
          method: req.method,
          path: req.path,
          msBeforeNext,
        },
        `Peticion bloqueada por rate limit (${nombre})`
      );
      next(new RateLimitError());
    }
  };
}

module.exports = {
  publicLimiter: makeLimiter(limiterPublic, 'public'),
  webhookLimiter: makeLimiter(limiterWebhook, 'webhook'),
  authLimiter: makeLimiter(limiterAuth, 'auth'),
  sensitiveLimiter: makeLimiter(limiterSensitive, 'sensitive'),
};
