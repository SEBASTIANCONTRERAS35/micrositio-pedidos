const argon2 = require('argon2');
const logger = require('../../utils/logger');

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Genera el hash Argon2id de una contrasena en texto plano.
async function hashPassword(textoPlano) {
  return argon2.hash(textoPlano, HASH_OPTIONS);
}

// Verifica una contrasena contra su hash; devuelve false si falla.
async function verifyPassword(hash, textoPlano) {
  try {
    return await argon2.verify(hash, textoPlano);
  } catch (err) {
    // Una excepcion aqui suele indicar un hash mal formado/corrupto en BD
    // (no un password incorrecto, que argon2 devuelve como false). Se loguea
    // solo el motivo; NUNCA el hash ni la contrasena.
    logger.warn(
      { event: 'auth.password.verify_error', motivo: err.message },
      'Fallo al verificar la contrasena (posible hash corrupto)'
    );
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
