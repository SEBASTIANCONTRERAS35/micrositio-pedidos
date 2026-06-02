/**
 * Middleware factory para validar requests con schemas Zod
 */
const { ValidationError } = require('../utils/errors');

function validate(schema, target = 'body') {
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
    req[target] = resultado.data; // datos parseados (con defaults aplicados)
    next();
  };
}

module.exports = { validate };
