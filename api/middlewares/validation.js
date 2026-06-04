const { ValidationError } = require('../utils/errors');

// Crea un middleware que valida el target del request con un schema Zod
function validate(schema, target = 'body') {
  // Middleware Express que parsea y valida los datos, propagando errores
  return (req, res, next) => {
    const datos = req[target];
    const resultado = schema.safeParse(datos);
    if (!resultado.success) {
      const detalles = resultado.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError('Datos invalidos', detalles));
    }
    req[target] = resultado.data;
    next();
  };
}

module.exports = { validate };
