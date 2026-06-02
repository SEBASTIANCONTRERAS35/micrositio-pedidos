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
  if (!signature || !secret) {
    return false;
  }

  const firmaLimpia = signature.replace(/^sha256=/, '');

  const calculado = crypto
    .createHmac('sha256', secret)
    .update(typeof body === 'string' ? body : body.toString('utf8'))
    .digest('hex');

  if (calculado.length !== firmaLimpia.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(calculado, 'hex'), Buffer.from(firmaLimpia, 'hex'));
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
  if (isNaN(ts)) {
    return false;
  }

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

/**
 * Verifica una firma estilo Stripe / ZUYU.
 * Header esperado:  X-Zuyu-Signature: t=<unix>,v1=<hmac>[,v0=<hmac_previo>]
 * Se firma  `${t}.${rawBody}`  (no solo el body).
 *
 * @param {string} rawBody - body crudo exacto
 * @param {string} signatureHeader - valor del header X-Zuyu-Signature
 * @param {string[]} secrets - [secretActual, secretPrevio?]
 * @param {number} [toleranceSeconds=300]
 * @returns {boolean}
 */
function verifyZuyuSignature(rawBody, signatureHeader, secrets, toleranceSeconds = 300) {
  if (!signatureHeader || !Array.isArray(secrets) || secrets.length === 0) {
    return false;
  }

  const partes = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    })
  );

  const t = parseInt(partes.t, 10);
  if (!t || Number.isNaN(t)) {
    return false;
  }

  // Anti-replay: timestamp dentro de la ventana
  if (!isTimestampValid(t, toleranceSeconds)) {
    return false;
  }

  const firmasCandidatas = [partes.v1, partes.v0].filter(Boolean);
  const payloadFirmado = `${t}.${rawBody}`;

  for (const secret of secrets.filter(Boolean)) {
    const esperado = crypto.createHmac('sha256', secret).update(payloadFirmado).digest('hex');
    for (const firma of firmasCandidatas) {
      if (firma.length !== esperado.length) {
        continue;
      }
      try {
        if (crypto.timingSafeEqual(Buffer.from(firma, 'hex'), Buffer.from(esperado, 'hex'))) {
          return true;
        }
      } catch {
        /* longitudes invalidas — seguir probando */
      }
    }
  }
  return false;
}

module.exports = {
  verifyHmacSignature,
  verifyZuyuSignature,
  isTimestampValid,
  signHmac,
};
