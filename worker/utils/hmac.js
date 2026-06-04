const crypto = require('crypto');

// Verifica una firma HMAC-SHA256 contra el body usando comparacion segura
function verifyHmacSignature(body, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const firmaLimpia = signature.replace(/^sha256=/, '');

  const firmaCalculada = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : body.toString('utf8'))
    .digest('hex');

  if (firmaCalculada.length !== firmaLimpia.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(firmaCalculada, 'hex'),
      Buffer.from(firmaLimpia, 'hex')
    );
  } catch {
    return false;
  }
}

// Verifica que el timestamp este dentro de una ventana (anti replay attack)
function isTimestampValid(timestamp, toleranceSeconds = 300) {
  const tsNumerico = parseInt(timestamp, 10);
  if (isNaN(tsNumerico)) {
    return false;
  }

  const ahora = Math.floor(Date.now() / 1000);
  return Math.abs(ahora - tsNumerico) <= toleranceSeconds;
}

// Genera firma HMAC para hacer pruebas o llamadas salientes
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
