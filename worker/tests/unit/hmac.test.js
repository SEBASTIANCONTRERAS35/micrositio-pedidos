/**
 * Tests de worker/utils/hmac.js — verificación de firmas HMAC de webhooks.
 * Es la frontera de seguridad del worker: un fallo aquí deja pasar webhooks
 * falsificados. Por eso se cubren los casos de ataque (firma inválida,
 * ausente, replay) además del camino feliz.
 */
const crypto = require('crypto');
const { verifyHmacSignature, isTimestampValid, signHmac } = require('../../utils/hmac');

const SECRET = 'test-secret-compartido-32-chars-xx';

describe('verifyHmacSignature', () => {
  it('acepta una firma válida generada con el mismo secret', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, SECRET);
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(true);
  });

  it('acepta firma con prefijo "sha256="', () => {
    const body = '{"evento":"pickup"}';
    const firma = signHmac(body, SECRET);
    expect(verifyHmacSignature(body, `sha256=${firma}`, SECRET)).toBe(true);
  });

  it('acepta un body tipo Buffer', () => {
    const body = Buffer.from('{"evento":"dropoff"}', 'utf8');
    const firma = signHmac(body.toString('utf8'), SECRET);
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(true);
  });

  it('rechaza una firma manipulada', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, SECRET);
    const manipulada = firma.slice(0, -1) + (firma.slice(-1) === '0' ? '1' : '0');
    expect(verifyHmacSignature(body, manipulada, SECRET)).toBe(false);
  });

  it('rechaza si el body fue alterado tras firmar', () => {
    const firma = signHmac('{"total":100}', SECRET);
    expect(verifyHmacSignature('{"total":999}', firma, SECRET)).toBe(false);
  });

  it('rechaza una firma generada con otro secret', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, 'otro-secret-distinto-del-correcto');
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(false);
  });

  it('rechaza cuando no hay firma', () => {
    expect(verifyHmacSignature('body', '', SECRET)).toBe(false);
    expect(verifyHmacSignature('body', null, SECRET)).toBe(false);
    expect(verifyHmacSignature('body', undefined, SECRET)).toBe(false);
  });

  it('rechaza cuando no hay secret', () => {
    expect(verifyHmacSignature('body', 'unafirma', '')).toBe(false);
    expect(verifyHmacSignature('body', 'unafirma', null)).toBe(false);
  });

  it('rechaza una firma de longitud distinta sin lanzar excepción', () => {
    expect(verifyHmacSignature('body', 'abc123', SECRET)).toBe(false);
  });

  it('rechaza una firma con caracteres no hexadecimales', () => {
    const body = 'body';
    const largoValido = signHmac(body, SECRET).length;
    const noHex = 'z'.repeat(largoValido);
    expect(verifyHmacSignature(body, noHex, SECRET)).toBe(false);
  });
});

describe('isTimestampValid', () => {
  const ahora = () => Math.floor(Date.now() / 1000);

  it('acepta el timestamp actual', () => {
    expect(isTimestampValid(ahora())).toBe(true);
  });

  it('acepta un timestamp dentro de la ventana de tolerancia', () => {
    expect(isTimestampValid(ahora() - 120)).toBe(true); // hace 2 min, default 5 min
  });

  it('rechaza un timestamp viejo (replay attack)', () => {
    expect(isTimestampValid(ahora() - 600)).toBe(false); // hace 10 min
  });

  it('rechaza un timestamp del futuro fuera de tolerancia', () => {
    expect(isTimestampValid(ahora() + 600)).toBe(false);
  });

  it('rechaza un timestamp no numérico', () => {
    expect(isTimestampValid('no-es-un-numero')).toBe(false);
    expect(isTimestampValid(undefined)).toBe(false);
  });

  it('acepta un timestamp pasado como string numérico', () => {
    expect(isTimestampValid(String(ahora()))).toBe(true);
  });

  it('respeta una ventana de tolerancia personalizada', () => {
    expect(isTimestampValid(ahora() - 30, 10)).toBe(false); // 30s fuera de ventana de 10s
    expect(isTimestampValid(ahora() - 5, 10)).toBe(true); // 5s dentro de ventana de 10s
  });
});

describe('signHmac', () => {
  it('produce una firma hex SHA-256 (64 caracteres)', () => {
    const firma = signHmac('payload', SECRET);
    expect(firma).toMatch(/^[a-f0-9]{64}$/);
  });

  it('serializa un body objeto con JSON.stringify antes de firmar', () => {
    const obj = { evento: 'delivered', pedidoId: 'PED-1' };
    const firma = signHmac(obj, SECRET);
    // verify sobre el mismo JSON string debe coincidir
    expect(verifyHmacSignature(JSON.stringify(obj), firma, SECRET)).toBe(true);
  });

  it('es determinista: mismo body + secret → misma firma', () => {
    expect(signHmac('x', SECRET)).toBe(signHmac('x', SECRET));
  });

  it('coincide con un HMAC-SHA256 calculado de forma independiente', () => {
    const body = 'verificacion-cruzada';
    const esperado = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(signHmac(body, SECRET)).toBe(esperado);
  });
});
