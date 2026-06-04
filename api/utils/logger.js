const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // Devuelve el nivel de log como etiqueta de texto.
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'cliente.telefono',
      'cliente.email',
      'cliente.direccion',
      'pedido.cliente.telefono',
      'pedido.cliente.email',
      'pedido.cliente.direccion',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.cliente.telefono',
      'req.body.cliente.email',
      'req.body.cliente.direccion',
      'res.headers["set-cookie"]',
      '*.password',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
});

module.exports = logger;
