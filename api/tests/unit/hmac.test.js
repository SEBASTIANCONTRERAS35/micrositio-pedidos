const { describe, it, expect } = require('vitest');
const { verifyHmacSignature, isTimestampValid, signHmac } = require('../../utils/hmac');

describe('verifyHmacSignature', () => {
  const secret = 'super-secret-key';

  it('verifica firma valida', () => {
    const body = 'hello world';
    const signature = signHmac(body, secret);
    expect(verifyHmacSignature(body, signature, secret)).toBe(true);
  });

  it('rechaza firma invalida', () => {
    const body = 'hello world';
    expect(verifyHmacSignature(body, 'bad-signature-of-correct-length-aaaaaaaaaaaaaaaaaa', secret)).toBe(false);
  });

  it('acepta firma con prefijo sha256=', () => {
    const body = 'test';
    const sig = signHmac(body, secret);
    expect(verifyHmacSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it('rechaza si secret es vacio', () => {
    expect(verifyHmacSignature('body', 'sig', '')).toBe(false);
  });
});

describe('isTimestampValid', () => {
  it('acepta timestamp actual', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000))).toBe(true);
  });

  it('rechaza timestamp viejo (>5 min)', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000) - 600)).toBe(false);
  });

  it('rechaza timestamp futuro (>5 min)', () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000) + 600)).toBe(false);
  });

  it('rechaza timestamp invalido', () => {
    expect(isTimestampValid('not-a-number')).toBe(false);
  });
});
