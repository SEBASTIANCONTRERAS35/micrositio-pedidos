const crypto = require('crypto');
const { verifyZuyuSignature } = require('../../utils/hmac');

const SECRET = crypto.randomBytes(24).toString('hex');
const SECRET_PREVIO = crypto.randomBytes(24).toString('hex');

// Replica el esquema de firma de ZUYU (hmacSigner.sign).
function firmarEstiloZuyu(rawBody, secret, secretPrevio = null, timestampMs = Date.now()) {
  const t = Math.floor(timestampMs / 1000);
  const signedPayload = `${t}.${rawBody}`;
  const v1 = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  let header = `t=${t},v1=${v1}`;
  if (secretPrevio) {
    const v0 = crypto.createHmac('sha256', secretPrevio).update(signedPayload).digest('hex');
    header += `,v0=${v0}`;
  }
  return header;
}

describe('verifyZuyuSignature — contrato con el firmante de ZUYU', () => {
  it('acepta una firma generada con el esquema de ZUYU', () => {
    const body = '{"eventType":"stock_actualizado","negocioSlug":"demo"}';
    const header = firmarEstiloZuyu(body, SECRET);
    expect(verifyZuyuSignature(body, header, [SECRET])).toBe(true);
  });

  it('rechaza si el secret no coincide', () => {
    const body = '{"a":1}';
    const header = firmarEstiloZuyu(body, SECRET);
    expect(verifyZuyuSignature(body, header, ['otro-secret-distinto'])).toBe(false);
  });

  it('rechaza si el body fue modificado (tampering)', () => {
    const header = firmarEstiloZuyu('{"monto":100}', SECRET);
    expect(verifyZuyuSignature('{"monto":999}', header, [SECRET])).toBe(false);
  });
});

describe('verifyZuyuSignature — rotacion dual-secret', () => {
  it('acepta firma con el secret NUEVO cuando el receptor tiene [previo, nuevo]', () => {
    const body = '{"a":1}';
    const header = firmarEstiloZuyu(body, SECRET);
    expect(verifyZuyuSignature(body, header, [SECRET_PREVIO, SECRET])).toBe(true);
  });

  it('acepta firma v0 (secret previo) durante la transicion', () => {
    const body = '{"a":1}';
    const header = firmarEstiloZuyu(body, SECRET, SECRET_PREVIO);
    expect(verifyZuyuSignature(body, header, [SECRET_PREVIO])).toBe(true);
  });
});

describe('verifyZuyuSignature — anti-replay', () => {
  it('rechaza timestamp fuera de la ventana (replay attack)', () => {
    const body = '{"a":1}';
    const viejo = firmarEstiloZuyu(body, SECRET, null, Date.now() - 10 * 60 * 1000);
    expect(verifyZuyuSignature(body, viejo, [SECRET], 300)).toBe(false);
  });

  it('acepta timestamp dentro de la ventana', () => {
    const body = '{"a":1}';
    const reciente = firmarEstiloZuyu(body, SECRET, null, Date.now() - 60 * 1000);
    expect(verifyZuyuSignature(body, reciente, [SECRET], 300)).toBe(true);
  });
});

describe('verifyZuyuSignature — entradas invalidas', () => {
  it('rechaza header malformado, vacio o null', () => {
    expect(verifyZuyuSignature('body', 'basura', [SECRET])).toBe(false);
    expect(verifyZuyuSignature('body', '', [SECRET])).toBe(false);
    expect(verifyZuyuSignature('body', null, [SECRET])).toBe(false);
  });

  it('rechaza si no hay secrets', () => {
    const header = firmarEstiloZuyu('{"a":1}', SECRET);
    expect(verifyZuyuSignature('{"a":1}', header, [])).toBe(false);
  });
});
