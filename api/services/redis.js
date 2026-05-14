/**
 * Cliente Redis compartido (singleton) para cache, idempotencia, rate limiting
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redis.on('connect', () => logger.info('Redis connected'));

module.exports = redis;
