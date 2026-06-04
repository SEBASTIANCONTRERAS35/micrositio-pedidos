const { RateLimiterRedis } = require('rate-limiter-flexible');
const redis = require('../services/redis');
const { RateLimitError } = require('../utils/errors');

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

// Crea un middleware de rate limit que consume puntos por IP
function makeLimiter(limiter) {
  return async (req, res, next) => {
    try {
      await limiter.consume(req.ip || 'unknown');
      next();
    } catch (rejRes) {
      res.set('Retry-After', String(Math.round(rejRes.msBeforeNext / 1000) || 60));
      next(new RateLimitError());
    }
  };
}

module.exports = {
  publicLimiter: makeLimiter(limiterPublic),
  webhookLimiter: makeLimiter(limiterWebhook),
  authLimiter: makeLimiter(limiterAuth),
  sensitiveLimiter: makeLimiter(limiterSensitive),
};
