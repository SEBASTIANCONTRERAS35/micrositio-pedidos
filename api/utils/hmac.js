/**
 * Verificacion de firmas HMAC para webhooks
 * Usa timingSafeEqual para evitar timing attacks
 */
const crypto = require('crypto');

/**
 * Verifica una firma HMAC-SHA256
 * @param {Buffer|string} body - body crudo del request
 * @param {string} signature - firma recibida (puede tener prefijo tipo 'sha256=...')
 * @param {string} secret - secret compartido
 * @returns {boolean}
 */
function verifyHmacSignature(body, signature, secret) {
  if (!signature || !secret) return false;

  const cleanSignature = signature.replace(/^sha256=/, '');

  const computed = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : body.toString('utf8'))
    .digest('hex');

  if (computed.length !== cleanSignature.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(cleanSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Verifica que el timestamp este dentro de una ventana (replay attack prevention)
 * @param {number} timestamp - timestamp Unix en segundos
 * @param {number} toleranceSeconds - ventana de tolerancia (default: 300 = 5 min)
 * @returns {boolean}
 */
function isTimestampValid(timestamp, toleranceSeconds = 300) {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}

/**
 * Genera firma HMAC para hacer pruebas o llamadas salientes
 */
function signHmac(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : JSON.stringify(body))
    .digest('hex');
}

module.exports = {
  verifyHmacSignature,
  isTimestampValid,
  signHmac,
};
