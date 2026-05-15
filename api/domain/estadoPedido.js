/**
 * Maquina de estados del Pedido — logica de dominio PURA.
 * Sin Mongoose, sin Express, sin I/O. Centraliza las transiciones validas
 * que antes vivian como `if` sueltos repartidos en pedidoService.js.
 *
 *   pendiente -> confirmado -> en_camino -> entregado
 *        \           \
 *         \-----------\--------> cancelado   (estado final)
 */
'use strict';

const ESTADOS = Object.freeze({
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  EN_CAMINO: 'en_camino',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado',
});

// Estados de los que ya no se puede salir.
const ESTADOS_FINALES = Object.freeze([ESTADOS.ENTREGADO, ESTADOS.CANCELADO]);

/** Solo un pedido `pendiente` puede confirmarse. */
function puedeConfirmar(estado) {
  return estado === ESTADOS.PENDIENTE;
}

/** Un pedido se puede cancelar mientras no este en un estado final. */
function puedeCancelar(estado) {
  return !ESTADOS_FINALES.includes(estado);
}

/** True si el estado es terminal (entregado o cancelado). */
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
