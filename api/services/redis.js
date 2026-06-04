const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  // Calcula el retardo de reintento de conexion (max 3000 ms).
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

// Listeners del ciclo de vida de Redis. Nunca exponen la password
// (no se loguea la config de conexion, solo el evento y el error serializado).
redis.on('connect', () => {
  logger.info({ event: 'infra.redis.conectado' }, 'Conexion a Redis iniciada');
});
redis.on('ready', () => {
  logger.info({ event: 'infra.redis.conectado' }, 'Redis listo para recibir comandos');
});
redis.on('error', (err) => {
  logger.error({ event: 'infra.redis.error', err }, 'Error en la conexion a Redis');
});
redis.on('reconnecting', (delayMs) => {
  logger.warn({ event: 'infra.redis.reconectando', delayMs }, 'Reintentando conexion a Redis');
});
redis.on('end', () => {
  logger.warn({ event: 'infra.redis.error' }, 'Conexion a Redis cerrada');
});

module.exports = redis;
