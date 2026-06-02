/**
 * Argon2 para hashing de passwords
 * Argon2id es la recomendacion oficial de OWASP en 2026 (mejor que bcrypt)
 */
const argon2 = require('argon2');

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MB
  timeCost: 2,
  parallelism: 1,
};

async function hashPassword(textoPlano) {
  return argon2.hash(textoPlano, HASH_OPTIONS);
}

async function verifyPassword(hash, textoPlano) {
  try {
    return await argon2.verify(hash, textoPlano);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
