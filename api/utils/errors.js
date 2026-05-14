/**
 * Clases de error tipadas
 * Permiten al errorHandler middleware decidir el status HTTP
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'No autenticado') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Demasiadas peticiones') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class StockInsuficienteError extends AppError {
  constructor(productoId) {
    super(`Stock insuficiente para producto ${productoId}`, 409, 'STOCK_INSUFICIENTE');
    this.productoId = productoId;
  }
}

class WebhookSignatureError extends AppError {
  constructor(message = 'Firma de webhook invalida') {
    super(message, 401, 'WEBHOOK_SIGNATURE_INVALID');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  StockInsuficienteError,
  WebhookSignatureError,
};
