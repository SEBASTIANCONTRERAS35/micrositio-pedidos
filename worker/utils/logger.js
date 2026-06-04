const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

// Nombre del servicio: configurable por env (SERVICE_NAME) con fallback literal.
const serviceName = process.env.SERVICE_NAME || 'worker';

// Rutas a censurar. Cubre PII de cliente (telefono/email/direccion en cualquier
// nivel de anidamiento) y secretos (passwords/tokens/firmas/apikeys). Se usan
// wildcards profundos para que la PII no se escape si viaja anidada distinto.
const redactPaths = [
  // --- PII (cliente) ---
  '*.telefono',
  '*.email',
  '*.direccion',
  'cliente.*',
  'pedido.cliente.*',
  'req.body.cliente.*',
  '*.cliente.telefono',
  '*.cliente.email',
  '*.cliente.direccion',
  '*.cliente.nombre',
  // --- Secretos (nivel raiz y anidado: *.x solo cubre anidados en pino) ---
  'password',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'webhookSecret',
  'hmac',
  'token',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.webhookSecret',
  '*.hmac',
  '*.token',
  'req.body.refreshToken',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Origen y entorno en todos los logs para correlacionar en Loki.
  base: {
    service: serviceName,
    env: process.env.NODE_ENV || 'development',
    ...(process.env.APP_VERSION && { version: process.env.APP_VERSION }),
  },
  // Timestamp en ISO 8601 (estandar, ordenable, legible).
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // Devuelve el nivel de log como etiqueta de texto en vez de numero.
    level: (label) => ({ level: label }),
  },
  // Serializers estandar de error/request/response.
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: redactPaths,
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
