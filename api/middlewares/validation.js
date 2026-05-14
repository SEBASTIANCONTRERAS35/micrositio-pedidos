/**
 * Middleware factory para validar requests con schemas Zod
 */
const { ValidationError } = require('../utils/errors');

function validate(schema, target = 'body') {
  return (req, res, next) => {
    const data = req[target];
    const result = schema.safeParse(data);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError('Datos invalidos', details));
    }
    req[target] = result.data; // datos parseados (con defaults aplicados)
    next();
  };
}

module.exports = { validate };
