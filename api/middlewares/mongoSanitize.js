/**
 * Mongo sanitization custom (express-mongo-sanitize NO es compatible con Express 5)
 *
 * Elimina recursivamente keys que empiezan con $ o contienen . del body.
 * Esto previene NoSQL injection en operadores MongoDB.
 */

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const limpiado = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    limpiado[key] = typeof value === 'object' ? sanitize(value) : value;
  }
  return limpiado;
}

function mongoSanitize(req, res, next) {
  if (req.body) {
    req.body = sanitize(req.body);
  }
  // No tocamos req.query (Express 5 lo hace read-only)
  // Si necesitas sanitizar query, valida con Zod en el endpoint
  next();
}

module.exports = mongoSanitize;
