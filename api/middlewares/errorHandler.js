const { AppError } = require('../utils/errors');
const baseLogger = require('../utils/logger');

// Mapea un AppError a un event de taxonomia segun su codigo/status (seguridad).
function eventoParaError(err) {
  switch (err.code) {
    case 'AUTHENTICATION_ERROR':
      return 'auth.denied';
    case 'AUTHORIZATION_ERROR':
      return 'auth.denied';
    case 'RATE_LIMIT_EXCEEDED':
      return 'auth.ratelimited';
    case 'WEBHOOK_SIGNATURE_INVALID':
      return 'webhook.firma_invalida';
    case 'VALIDATION_ERROR':
      return 'request.invalido';
    default:
      return err.statusCode >= 500 ? 'request.error' : 'request.rechazado';
  }
}

// Convierte errores a respuestas JSON consistentes segun su tipo
function errorHandler(err, req, res, _next) {
  const isProd = process.env.NODE_ENV === 'production';
  // Usa el child logger del request (requestId/usuarioId/negocioId) si existe.
  const log = req.log || baseLogger;
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Campos comunes de seguridad/observabilidad para TODA respuesta de error.
  const campos = {
    statusCode,
    method: req.method,
    path: req.path,
    ip: req.ip,
    requestId: req.id,
    actor: req.user?.id,
  };

  if (err instanceof AppError) {
    const event = eventoParaError(err);
    if (statusCode >= 500) {
      // 5xx: error real -> incluye stack via serializer de err.
      log.error({ event, err, ...campos }, err.message);
    } else {
      // 4xx: regla de negocio/seguridad fallida -> warn sin stack.
      log.warn({ event, code: err.code, ...campos }, err.message);
    }

    return res.status(statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Error no controlado: siempre 5xx con stack (via serializer de err).
  log.error({ event: 'request.error', err, ...campos }, 'Error no controlado en la API');

  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: isProd ? 'Error interno del servidor' : err.message,
    ...(!isProd && { stack: err.stack }),
  });
}

module.exports = errorHandler;
