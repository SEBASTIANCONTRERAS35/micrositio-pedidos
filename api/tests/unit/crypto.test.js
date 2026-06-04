const { encryptSecret, decryptSecret, isEncrypted } = require('../../utils/crypto');

// Agrupa pruebas de round-trip de cifrado/descifrado de secretos.
describe('encryptSecret / decryptSecret — round-trip', () => {
  // Verifica que descifrar lo cifrado devuelve el valor original.
  it('descifrar lo cifrado devuelve el valor original', () => {
    const original = 'zk_test_b6a20e_supersecreto';
    const cifrado = encryptSecret(original);
    expect(decryptSecret(cifrado)).toBe(original);
  });

  // Comprueba el prefijo enc:v1: y que no se filtre el plaintext.
  it('el valor cifrado tiene el prefijo enc:v1: y NO contiene el plaintext', () => {
    const cifrado = encryptSecret('mi-secreto-123');
    expect(cifrado.startsWith('enc:v1:')).toBe(true);
    expect(cifrado).not.toContain('mi-secreto-123');
  });

  // Verifica que cifrar dos veces da ciphertexts distintos por IV aleatorio.
  it('cifrar el mismo valor dos veces da ciphertexts distintos (IV aleatorio)', () => {
    const a = encryptSecret('valor-repetido');
    const b = encryptSecret('valor-repetido');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('valor-repetido');
    expect(decryptSecret(b)).toBe('valor-repetido');
  });

  // Comprueba soporte de unicode y strings largos en el round-trip.
  it('soporta unicode y strings largos', () => {
    const original = 'ñÑáé🔐 ' + 'x'.repeat(500);
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });
});

// Agrupa pruebas de deteccion de tampering con AES-GCM.
describe('decryptSecret — deteccion de tampering (AES-GCM)', () => {
  // Verifica que un ciphertext alterado lanza por auth tag invalido.
  it('un ciphertext modificado lanza al descifrar (auth tag invalido)', () => {
    const cifrado = encryptSecret('secreto-intacto');
    const ultimo = cifrado.slice(-1);
    const alterado = cifrado.slice(0, -1) + (ultimo === 'a' ? 'b' : 'a');
    expect(() => decryptSecret(alterado)).toThrow();
  });
});

// Agrupa pruebas de passthrough de valores legacy en claro.
describe('decryptSecret — passthrough de valores legacy en claro', () => {
  // Verifica que un valor sin prefijo enc:v1: se devuelve tal cual.
  it('un valor SIN prefijo enc:v1: se devuelve tal cual (migracion suave)', () => {
    const legacy = 'zk_test_plano_legacy';
    expect(decryptSecret(legacy)).toBe(legacy);
  });

  // Comprueba que null, undefined y vacio se devuelven sin cambios.
  it('null / undefined / "" se devuelven tal cual', () => {
    expect(encryptSecret(null)).toBe(null);
    expect(encryptSecret(undefined)).toBe(undefined);
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret(null)).toBe(null);
    expect(decryptSecret('')).toBe('');
  });
});

// Agrupa pruebas de la deteccion de valores cifrados.
describe('isEncrypted', () => {
  // Verifica true para cifrados y false para legacy o vacios.
  it('true para valores cifrados, false para legacy/vacios', () => {
    expect(isEncrypted(encryptSecret('x'))).toBe(true);
    expect(isEncrypted('texto-plano')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
