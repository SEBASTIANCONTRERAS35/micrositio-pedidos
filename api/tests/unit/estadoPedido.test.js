const { ESTADOS, puedeConfirmar, puedeCancelar, esFinal } = require('../../domain/estadoPedido');

// Agrupa los tests de la regla puedeConfirmar.
describe('estadoPedido.puedeConfirmar', () => {
  // Verifica que solo un pedido pendiente puede confirmarse.
  it('solo un pedido pendiente puede confirmarse', () => {
    expect(puedeConfirmar(ESTADOS.PENDIENTE)).toBe(true);
    expect(puedeConfirmar(ESTADOS.CONFIRMADO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.EN_CAMINO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.ENTREGADO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.CANCELADO)).toBe(false);
  });
});

// Agrupa los tests de la regla puedeCancelar.
describe('estadoPedido.puedeCancelar', () => {
  // Verifica que se puede cancelar mientras el pedido no este en estado final.
  it('se puede cancelar mientras el pedido no este en un estado final', () => {
    expect(puedeCancelar(ESTADOS.PENDIENTE)).toBe(true);
    expect(puedeCancelar(ESTADOS.CONFIRMADO)).toBe(true);
    expect(puedeCancelar(ESTADOS.EN_CAMINO)).toBe(true);
  });

  // Verifica que no se puede cancelar un pedido entregado o ya cancelado.
  it('NO se puede cancelar un pedido entregado o ya cancelado', () => {
    expect(puedeCancelar(ESTADOS.ENTREGADO)).toBe(false);
    expect(puedeCancelar(ESTADOS.CANCELADO)).toBe(false);
  });
});

// Agrupa los tests de la regla esFinal.
describe('estadoPedido.esFinal', () => {
  // Verifica que entregado y cancelado son estados finales.
  it('entregado y cancelado son estados finales', () => {
    expect(esFinal(ESTADOS.ENTREGADO)).toBe(true);
    expect(esFinal(ESTADOS.CANCELADO)).toBe(true);
  });

  // Verifica que los estados intermedios no son finales.
  it('los estados intermedios NO son finales', () => {
    expect(esFinal(ESTADOS.PENDIENTE)).toBe(false);
    expect(esFinal(ESTADOS.CONFIRMADO)).toBe(false);
    expect(esFinal(ESTADOS.EN_CAMINO)).toBe(false);
  });
});
