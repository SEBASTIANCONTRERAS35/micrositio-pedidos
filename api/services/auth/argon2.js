const argon2 = require('argon2');

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
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
