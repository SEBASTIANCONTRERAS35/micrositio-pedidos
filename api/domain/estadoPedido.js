'use strict';

const ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
});

const ESTADOS_FINALES = Object.freeze([ESTADOS.ENTREGADO, ESTADOS.CANCELADO]);

// Indica si un pedido pendiente puede confirmarse.
function puedeConfirmar(estado) {
  return estado === ESTADOS.PENDIENTE;
}

// Indica si un pedido puede cancelarse mientras no este en estado final.
function puedeCancelar(estado) {
  return !ESTADOS_FINALES.includes(estado);
}

// Indica si el estado es terminal (entregado o cancelado).
function esFinal(estado) {
  return ESTADOS_FINALES.includes(estado);
}

module.exports = {
  ESTADOS,
  ESTADOS_FINALES,
  puedeConfirmar,
  puedeCancelar,
  esFinal,
};
