const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

let _keyWarned = false;

// Obtiene la clave de cifrado de 32 bytes desde ENCRYPTION_KEY o fallback dev.
function getKey() {
  const claveHex = process.env.ENCRYPTION_KEY;
  if (claveHex && /^[0-9a-f]{64}$/i.test(claveHex)) {
    return Buffer.from(claveHex, 'hex');
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

// Cifra un secreto y devuelve el string enc:v1:...; vacios/null se devuelven igual.
function encryptSecret(textoPlano) {
  if (textoPlano === null || textoPlano === undefined || textoPlano === '') {
    return textoPlano;
  }
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv(ALGO, getKey(), iv);
  const textoCifrado = Buffer.concat([
    cifrador.update(String(textoPlano), 'utf8'),
    cifrador.final(),
  ]);
  const tag = cifrador.getAuthTag();
  return (
    PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + textoCifrado.toString('hex')
  );
}

// Descifra un valor de encryptSecret; valores legacy sin prefijo se devuelven igual.
function decryptSecret(value) {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  if (!String(value).startsWith(PREFIX)) {
    return value;
  }
  const [ivHex, tagHex, ctHex] = value.slice(PREFIX.length).split(':');
  const descifrador = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  descifrador.setAuthTag(Buffer.from(tagHex, 'hex'));
  const textoPlano = Buffer.concat([
    descifrador.update(Buffer.from(ctHex, 'hex')),
    descifrador.final(),
  ]);
  return textoPlano.toString('utf8');
}

// True si el valor ya esta cifrado con este esquema.
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encryptSecret, decryptSecret, isEncrypted };
