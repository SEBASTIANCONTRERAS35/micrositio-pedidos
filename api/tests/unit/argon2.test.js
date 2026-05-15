// describe/it/expect globales (vitest.config.js → globals: true)
const { hashPassword, verifyPassword } = require('../../services/auth/argon2');

describe('Argon2 password hashing', () => {
  it('hashea y verifica correctamente', async () => {
    const plaintext = 'super-strong-password-123';
    const hash = await hashPassword(plaintext);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, plaintext)).toBe(true);
  });

  it('rechaza password incorrecto', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('genera hashes distintos para mismo input (salt unico)', async () => {
    const h1 = await hashPassword('test');
    const h2 = await hashPassword('test');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword(h1, 'test')).toBe(true);
    expect(await verifyPassword(h2, 'test')).toBe(true);
  });
});
