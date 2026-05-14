/**
 * Helmet con CSP configurado para EJS + Alpine.js + assets servidos localmente
 */
const helmet = require('helmet');

module.exports = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // Alpine.js requiere unsafe-eval para sus directivas inline (x-show, x-data)
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
      // EJS templates tienen estilos inline ocasionales
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
});
