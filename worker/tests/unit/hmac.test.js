const crypto = require('crypto');
const { verifyHmacSignature, isTimestampValid, signHmac } = require('../../utils/hmac');

const SECRET = 'test-secret-compartido-32-chars-xx';

// Suite de pruebas para la verificacion de firmas HMAC de webhooks.
describe('verifyHmacSignature', () => {
  // Verifica que se acepta una firma valida generada con el mismo secret.
  it('acepta una firma válida generada con el mismo secret', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, SECRET);
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(true);
  });

  // Verifica que se acepta una firma con el prefijo "sha256=".
  it('acepta firma con prefijo "sha256="', () => {
    const body = '{"evento":"pickup"}';
    const firma = signHmac(body, SECRET);
    expect(verifyHmacSignature(body, `sha256=${firma}`, SECRET)).toBe(true);
  });

  // Verifica que se acepta un body de tipo Buffer.
  it('acepta un body tipo Buffer', () => {
    const body = Buffer.from('{"evento":"dropoff"}', 'utf8');
    const firma = signHmac(body.toString('utf8'), SECRET);
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(true);
  });

  // Verifica que se rechaza una firma manipulada.
  it('rechaza una firma manipulada', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, SECRET);
    const manipulada = firma.slice(0, -1) + (firma.slice(-1) === '0' ? '1' : '0');
    expect(verifyHmacSignature(body, manipulada, SECRET)).toBe(false);
  });

  // Verifica que se rechaza si el body fue alterado tras firmar.
  it('rechaza si el body fue alterado tras firmar', () => {
    const firma = signHmac('{"total":100}', SECRET);
    expect(verifyHmacSignature('{"total":999}', firma, SECRET)).toBe(false);
  });

  // Verifica que se rechaza una firma generada con otro secret.
  it('rechaza una firma generada con otro secret', () => {
    const body = '{"evento":"delivered"}';
    const firma = signHmac(body, 'otro-secret-distinto-del-correcto');
    expect(verifyHmacSignature(body, firma, SECRET)).toBe(false);
  });

  // Verifica que se rechaza cuando no hay firma.
  it('rechaza cuando no hay firma', () => {
    expect(verifyHmacSignature('body', '', SECRET)).toBe(false);
    expect(verifyHmacSignature('body', null, SECRET)).toBe(false);
    expect(verifyHmacSignature('body', undefined, SECRET)).toBe(false);
  });

  // Verifica que se rechaza cuando no hay secret.
  it('rechaza cuando no hay secret', () => {
    expect(verifyHmacSignature('body', 'unafirma', '')).toBe(false);
    expect(verifyHmacSignature('body', 'unafirma', null)).toBe(false);
  });

  // Verifica que se rechaza una firma de longitud distinta sin lanzar excepcion.
  it('rechaza una firma de longitud distinta sin lanzar excepción', () => {
    expect(verifyHmacSignature('body', 'abc123', SECRET)).toBe(false);
  });

  // Verifica que se rechaza una firma con caracteres no hexadecimales.
  it('rechaza una firma con caracteres no hexadecimales', () => {
    const body = 'body';
    const largoValido = signHmac(body, SECRET).length;
    const noHex = 'z'.repeat(largoValido);
    expect(verifyHmacSignature(body, noHex, SECRET)).toBe(false);
  });
});

// Suite de pruebas para la validacion de timestamps contra replay.
describe('isTimestampValid', () => {
  // Devuelve el timestamp actual en segundos.
  const ahora = () => Math.floor(Date.now() / 1000);

  // Verifica que se acepta el timestamp actual.
  it('acepta el timestamp actual', () => {
    expect(isTimestampValid(ahora())).toBe(true);
  });

  // Verifica que se acepta un timestamp dentro de la ventana de tolerancia.
  it('acepta un timestamp dentro de la ventana de tolerancia', () => {
    expect(isTimestampValid(ahora() - 120)).toBe(true);
  });

  // Verifica que se rechaza un timestamp viejo (replay attack).
  it('rechaza un timestamp viejo (replay attack)', () => {
    expect(isTimestampValid(ahora() - 600)).toBe(false);
  });

  // Verifica que se rechaza un timestamp del futuro fuera de tolerancia.
  it('rechaza un timestamp del futuro fuera de tolerancia', () => {
    expect(isTimestampValid(ahora() + 600)).toBe(false);
  });

  // Verifica que se rechaza un timestamp no numerico.
  it('rechaza un timestamp no numérico', () => {
    expect(isTimestampValid('no-es-un-numero')).toBe(false);
    expect(isTimestampValid(undefined)).toBe(false);
  });

  // Verifica que se acepta un timestamp pasado como string numerico.
  it('acepta un timestamp pasado como string numérico', () => {
    expect(isTimestampValid(String(ahora()))).toBe(true);
  });

  // Verifica que se respeta una ventana de tolerancia personalizada.
  it('respeta una ventana de tolerancia personalizada', () => {
    expect(isTimestampValid(ahora() - 30, 10)).toBe(false);
    expect(isTimestampValid(ahora() - 5, 10)).toBe(true);
  });
});

// Suite de pruebas para la generacion de firmas HMAC.
describe('signHmac', () => {
  // Verifica que produce una firma hex SHA-256 de 64 caracteres.
  it('produce una firma hex SHA-256 (64 caracteres)', () => {
    const firma = signHmac('payload', SECRET);
    expect(firma).toMatch(/^[a-f0-9]{64}$/);
  });

  // Verifica que serializa un body objeto con JSON.stringify antes de firmar.
  it('serializa un body objeto con JSON.stringify antes de firmar', () => {
    const obj = { evento: 'delivered', pedidoId: 'PED-1' };
    const firma = signHmac(obj, SECRET);
    expect(verifyHmacSignature(JSON.stringify(obj), firma, SECRET)).toBe(true);
  });

  // Verifica que es determinista: mismo body y secret producen la misma firma.
  it('es determinista: mismo body + secret → misma firma', () => {
    expect(signHmac('x', SECRET)).toBe(signHmac('x', SECRET));
  });

  // Verifica que coincide con un HMAC-SHA256 calculado de forma independiente.
  it('coincide con un HMAC-SHA256 calculado de forma independiente', () => {
    const body = 'verificacion-cruzada';
    const esperado = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(signHmac(body, SECRET)).toBe(esperado);
  });
});
