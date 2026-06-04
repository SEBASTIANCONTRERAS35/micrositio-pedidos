const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

// Convierte errores a respuestas JSON consistentes segun su tipo
function errorHandler(err, req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, err.message);
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message);
    }

    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: isProd ? 'Error interno del servidor' : err.message,
    ...(!isProd && { stack: err.stack }),
  });
}

module.exports = errorHandler;
