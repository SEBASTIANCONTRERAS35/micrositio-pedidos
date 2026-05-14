/**
 * Logger compartido del worker (Pino con PII redact)
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      '*.password',
      '*.telefono',
      '*.email',
      '*.direccion',
      '*.cliente.telefono',
      '*.cliente.email',
      '*.cliente.direccion',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
