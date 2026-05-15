/**
 * Cifrado simetrico at-rest para secretos (AES-256-GCM).
 *
 * Se usa para que el API key y el webhook secret de ZUYU NO se guarden en
 * texto plano en MongoDB: un backup robado, una replica comprometida o un
 * `mongodump` no entregan la credencial.
 *
 * Formato del valor cifrado:  enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 * El prefijo `enc:v1:` permite distinguir valores cifrados de valores legacy
 * que quedaron en claro antes de introducir el cifrado (migracion suave).
 *
 * La clave viene de ENCRYPTION_KEY (64 hex chars = 32 bytes). En produccion
 * es obligatoria; en dev hay un fallback fijo (con warning) para no bloquear.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

let _keyWarned = false;

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY (64 caracteres hex) es obligatoria en produccion');
  }
  if (!_keyWarned) {
    console.warn('[crypto] ENCRYPTION_KEY no configurada — usando clave de DEV (insegura)');
    _keyWarned = true;
  }
  return crypto.createHash('sha256').update('micrositio-dev-encryption-key').digest();
}

/**
 * Cifra un secreto. Devuelve el string `enc:v1:...`. Valores vacios/null
 * se devuelven tal cual (no hay nada que cifrar).
 */
function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex');
}

/**
 * Descifra un valor producido por encryptSecret. Si el valor NO tiene el
 * prefijo `enc:v1:` se asume legacy en claro y se devuelve tal cual — asi
 * los secretos guardados antes del cifrado siguen funcionando hasta que se
 * re-guarden desde el panel.
 */
function decryptSecret(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  if (!String(value).startsWith(PREFIX)) {
    return value; // legacy en claro
  }
  const [ivHex, tagHex, ctHex] = value.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return pt.toString('utf8');
}

/** True si el valor ya esta cifrado con este esquema. */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encryptSecret, decryptSecret, isEncrypted };
