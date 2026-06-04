// Elimina recursivamente keys con $ o . para prevenir NoSQL injection
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

// Middleware que sanitiza req.body contra inyeccion de operadores MongoDB
function mongoSanitize(req, res, next) {
  if (req.body) {
    req.body = sanitize(req.body);
  }
  next();
}

module.exports = mongoSanitize;
