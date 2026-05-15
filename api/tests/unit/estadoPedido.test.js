/**
 * Tests de la maquina de estados del Pedido (api/domain/estadoPedido.js).
 * Dominio puro — sin BD, sin I/O. describe/it/expect globales.
 */
const { ESTADOS, puedeConfirmar, puedeCancelar, esFinal } = require('../../domain/estadoPedido');

describe('estadoPedido.puedeConfirmar', () => {
  it('solo un pedido pendiente puede confirmarse', () => {
    expect(puedeConfirmar(ESTADOS.PENDIENTE)).toBe(true);
    expect(puedeConfirmar(ESTADOS.CONFIRMADO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.EN_CAMINO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.ENTREGADO)).toBe(false);
    expect(puedeConfirmar(ESTADOS.CANCELADO)).toBe(false);
  });
});

describe('estadoPedido.puedeCancelar', () => {
  it('se puede cancelar mientras el pedido no este en un estado final', () => {
    expect(puedeCancelar(ESTADOS.PENDIENTE)).toBe(true);
    expect(puedeCancelar(ESTADOS.CONFIRMADO)).toBe(true);
    expect(puedeCancelar(ESTADOS.EN_CAMINO)).toBe(true);
  });

  it('NO se puede cancelar un pedido entregado o ya cancelado', () => {
    expect(puedeCancelar(ESTADOS.ENTREGADO)).toBe(false);
    expect(puedeCancelar(ESTADOS.CANCELADO)).toBe(false);
  });
});

describe('estadoPedido.esFinal', () => {
  it('entregado y cancelado son estados finales', () => {
    expect(esFinal(ESTADOS.ENTREGADO)).toBe(true);
    expect(esFinal(ESTADOS.CANCELADO)).toBe(true);
  });

  it('los estados intermedios NO son finales', () => {
    expect(esFinal(ESTADOS.PENDIENTE)).toBe(false);
    expect(esFinal(ESTADOS.CONFIRMADO)).toBe(false);
    expect(esFinal(ESTADOS.EN_CAMINO)).toBe(false);
  });
});
