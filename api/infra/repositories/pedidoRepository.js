'use strict';

const Pedido = require('../../models/pedido');

// Crea un pedido (fuera de transaccion).
async function crear(datos) {
  return Pedido.create(datos);
}

// Crea un pedido dentro de una transaccion con session.
async function crearEnSession(datos, session) {
  const [pedido] = await Pedido.create([datos], { session });
  return pedido;
}

// Busca un pedido scoped al negocio y devuelve la query encadenable.
function buscarPorId(pedidoId, negocioId, { populateNegocio = false } = {}) {
  const query = Pedido.findOne({ pedidoId, negocioId });
  return populateNegocio ? query.populate('negocioId') : query;
}

// Busca un pedido scoped al negocio, dentro de una transaccion.
function buscarPorIdEnSession(pedidoId, negocioId, session) {
  return Pedido.findOne({ pedidoId, negocioId }).session(session);
}

module.exports = {
  crear,
  crearEnSession,
  buscarPorId,
  buscarPorIdEnSession,
};
