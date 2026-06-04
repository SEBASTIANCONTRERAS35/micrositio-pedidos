const { verifyHmacSignature, isTimestampValid, signHmac } = require('../../utils/hmac');

// Agrupa las pruebas de verificacion de firma HMAC
describe('verifyHmacSignature', () => {
  const secret = 'super-secret-key';

  // Verifica que una firma valida sea aceptada
  it('verifica firma valida', () => {
    const body = 'hello world';
    const signature = signHmac(body, secret);
    expect(verifyHmacSignature(body, signature, secret)).toBe(true);
  });

  // Verifica que una firma invalida sea rechazada
  it('rechaza firma invalida', () => {
    const body = 'hello world';
    expect(
      verifyHmacSignature(body, 'bad-signature-of-correct-length-aaaaaaaaaaaaaaaaaa', secret)
    ).toBe(false);
  });

  // Verifica que se acepte una firma con prefijo sha256=
  it('acepta firma con prefijo sha256=', () => {
    const body = 'test';
    const sig = signHmac(body, secret);
    expect(verifyHmacSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  // Verifica que se rechace cuando el secret esta vacio
  it('rechaza si secret es vacio', () => {
    expect(verifyHmacSignature('body', 'sig', '')).toBe(false);
  });
});

// Agrupa las pruebas de validacion de timestamp
describe('isTimestampValid', () => {
  // Verifica que se acepte el timestamp actual
  it('acepta timestamp actual', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000))).toBe(true);
  });

  // Verifica que se rechace un timestamp viejo de mas de 5 min
  it('rechaza timestamp viejo (>5 min)', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000) - 600)).toBe(false);
  });

  // Verifica que se rechace un timestamp futuro de mas de 5 min
  it('rechaza timestamp futuro (>5 min)', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000) + 600)).toBe(false);
  });

  // Verifica que se rechace un timestamp invalido
  it('rechaza timestamp invalido', () => {
    expect(isTimestampValid('not-a-number')).toBe(false);
  });
});
