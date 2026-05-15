/**
 * Tests del cifrado at-rest de secretos (api/utils/crypto.js).
 * Cubren el round-trip, el formato, la deteccion de tampering (GCM) y el
 * passthrough de valores legacy en claro (migracion suave).
 *
 * describe/it/expect globales (vitest.config.js -> globals: true).
 * Sin ENCRYPTION_KEY en el entorno de test, crypto.js usa su clave de DEV
 * (deterministica) — perfecto para tests.
 */
const { encryptSecret, decryptSecret, isEncrypted } = require('../../utils/crypto');

describe('encryptSecret / decryptSecret — round-trip', () => {
  it('descifrar lo cifrado devuelve el valor original', () => {
    const original = 'zk_test_b6a20e_supersecreto';
    const cifrado = encryptSecret(original);
    expect(decryptSecret(cifrado)).toBe(original);
  });

  it('el valor cifrado tiene el prefijo enc:v1: y NO contiene el plaintext', () => {
    const cifrado = encryptSecret('mi-secreto-123');
    expect(cifrado.startsWith('enc:v1:')).toBe(true);
    expect(cifrado).not.toContain('mi-secreto-123');
  });

  it('cifrar el mismo valor dos veces da ciphertexts distintos (IV aleatorio)', () => {
    const a = encryptSecret('valor-repetido');
    const b = encryptSecret('valor-repetido');
    expect(a).not.toBe(b);
    // pero ambos descifran al mismo original
    expect(decryptSecret(a)).toBe('valor-repetido');
    expect(decryptSecret(b)).toBe('valor-repetido');
  });

  it('soporta unicode y strings largos', () => {
    const original = 'ñÑáé🔐 ' + 'x'.repeat(500);
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });
});

describe('decryptSecret — deteccion de tampering (AES-GCM)', () => {
  it('un ciphertext modificado lanza al descifrar (auth tag invalido)', () => {
    const cifrado = encryptSecret('secreto-intacto');
    // Alterar el ultimo caracter hex del ciphertext
    const ultimo = cifrado.slice(-1);
    const alterado = cifrado.slice(0, -1) + (ultimo === 'a' ? 'b' : 'a');
    expect(() => decryptSecret(alterado)).toThrow();
  });
});

describe('decryptSecret — passthrough de valores legacy en claro', () => {
  it('un valor SIN prefijo enc:v1: se devuelve tal cual (migracion suave)', () => {
    // Asi los apiKey guardados antes del cifrado siguen funcionando.
    const legacy = 'zk_test_plano_legacy';
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  it('null / undefined / "" se devuelven tal cual', () => {
    expect(encryptSecret(null)).toBe(null);
    expect(encryptSecret(undefined)).toBe(undefined);
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret(null)).toBe(null);
    expect(decryptSecret('')).toBe('');
  });
});

describe('isEncrypted', () => {
  it('true para valores cifrados, false para legacy/vacios', () => {
    expect(isEncrypted(encryptSecret('x'))).toBe(true);
    expect(isEncrypted('texto-plano')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
