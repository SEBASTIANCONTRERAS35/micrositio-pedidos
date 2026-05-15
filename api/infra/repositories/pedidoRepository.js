/**
 * Repositorio de Pedidos — aisla el acceso Mongoose al modelo Pedido.
 * El service orquesta; este modulo es el unico que conoce el modelo.
 *
 * Las busquedas SIEMPRE reciben `negocioId` ademas de `pedidoId`: tenant
 * isolation (evita IDOR entre negocios).
 */
'use strict';

const Pedido = require('../../models/pedido');

/** Crea un pedido (fuera de transaccion). */
async function crear(datos) {
  return Pedido.create(datos);
}

/**
 * Crea un pedido DENTRO de una transaccion. Pedido.create con array +
 * session es la forma que soporta sesiones.
 */
async function crearEnSession(datos, session) {
  const [pedido] = await Pedido.create([datos], { session });
  return pedido;
}

/**
 * Busca un pedido scoped al negocio. Devuelve la query (no await) para que
 * el caller pueda encadenar si necesita.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.populateNegocio] - popula negocioId con el doc Negocio
 */
function buscarPorId(pedidoId, negocioId, { populateNegocio = false } = {}) {
  const query = Pedido.findOne({ pedidoId, negocioId });
  return populateNegocio ? query.populate('negocioId') : query;
}

/** Busca un pedido scoped al negocio, dentro de una transaccion. */
function buscarPorIdEnSession(pedidoId, negocioId, session) {
  return Pedido.findOne({ pedidoId, negocioId }).session(session);
}

module.exports = {
  crear,
  crearEnSession,
  buscarPorId,
  buscarPorIdEnSession,
};
