/**
 * Helmet con CSP configurado para EJS + Alpine.js + assets servidos localmente
 */
const helmet = require('helmet');

module.exports = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' YA NO se permite para scripts: todos los <script>
      // inline se externalizaron a /js/*.js. 'unsafe-eval' SI se mantiene —
      // Alpine.js (build estandar) evalua sus expresiones con Function();
      // quitarlo requiere migrar al build CSP-friendly de Alpine.
      scriptSrc: ["'self'", "'unsafe-eval'"],
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
