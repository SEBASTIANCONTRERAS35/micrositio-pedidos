class AppError extends Error {
  // Construye un error base con status HTTP y codigo de error.
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  // Crea un error de validacion (400) con detalles opcionales.
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  // Crea un error de autenticacion (401).
  constructor(message = 'No autenticado') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  // Crea un error de autorizacion (403).
  constructor(message = 'No autorizado') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  // Crea un error de recurso no encontrado (404).
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  // Crea un error de conflicto (409).
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  // Crea un error de limite de peticiones excedido (429).
  constructor(message = 'Demasiadas peticiones') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class StockInsuficienteError extends AppError {
  // Crea un error de stock insuficiente (409) para un producto.
  constructor(productoId) {
    super(`Stock insuficiente para producto ${productoId}`, 409, 'STOCK_INSUFICIENTE');
    this.productoId = productoId;
  }
}

class WebhookSignatureError extends AppError {
  // Crea un error de firma de webhook invalida (401).
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
