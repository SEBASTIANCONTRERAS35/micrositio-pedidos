const baseLogger = require('../utils/logger');

// Elimina recursivamente keys con $ o . para prevenir NoSQL injection.
// Acumula en `removed` los NOMBRES de las keys descartadas (nunca sus valores).
function sanitize(obj, removed) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, removed));
  }

  const limpiado = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      removed.push(key);
      continue;
    }
    limpiado[key] = typeof value === 'object' ? sanitize(value, removed) : value;
  }
  return limpiado;
}

// Middleware que sanitiza req.body contra inyeccion de operadores MongoDB
function mongoSanitize(req, res, next) {
  if (req.body) {
    const removed = [];
    req.body = sanitize(req.body, removed);
    if (removed.length > 0) {
      // Seguridad: se detectaron y eliminaron operadores Mongo en el body.
      // Solo se loguean los NOMBRES de las keys, nunca los valores (posible PII).
      const log = req.log || baseLogger;
      log.warn(
        {
          event: 'security.nosql_sanitizado',
          ip: req.ip,
          method: req.method,
          path: req.path,
          removedKeys: removed,
        },
        'Posible inyeccion NoSQL: se sanearon claves del cuerpo de la peticion'
      );
    }
  }
  next();
}

module.exports = mongoSanitize;
