/**
 * Repositorio de Productos — aisla el acceso Mongoose. El service y el
 * dominio hablan con esta interfaz, no con el modelo directamente.
 *
 * Las operaciones de stock aceptan una `session` para poder participar en
 * la transaccion atomica que orquesta el service.
 */
'use strict';

const mongoose = require('mongoose');
const Producto = require('../../models/producto');

/** Busca los productos activos de un negocio por sus ids (strings). */
async function buscarActivosPorIds(ids, negocioId) {
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  return Producto.find({
    _id: { $in: objectIds },
    negocioId,
    activo: true,
  }).lean();
}

/**
 * Descuenta stock de forma ATOMICA y CONDICIONAL dentro de una transaccion.
 * Cada updateOne solo aplica si hay stock suficiente (filter con `$gte`),
 * asi dos pedidos concurrentes del ultimo producto no pueden ganar ambos.
 *
 * @param {object[]} snapshot - productos con { id, cantidad }
 * @param {object} session - sesion Mongoose de la transaccion
 * @returns {Promise<boolean>} true si TODOS los productos se descontaron
 */
async function descontarStock(snapshot, session) {
  const result = await Producto.bulkWrite(
    snapshot.map((p) => ({
      updateOne: {
        filter: { _id: p.id, stock: { $gte: p.cantidad } },
        update: { $inc: { stock: -p.cantidad } },
      },
    })),
    { session }
  );
  return result.modifiedCount === snapshot.length;
}

/**
 * Devuelve stock (al cancelar un pedido). Incondicional — el pedido ya
 * habia descontado ese stock.
 *
 * @param {object[]} productos - snapshot del pedido con { id, cantidad }
 * @param {object} session - sesion Mongoose de la transaccion
 */
async function devolverStock(productos, session) {
  await Producto.bulkWrite(
    productos.map((p) => ({
      updateOne: {
        filter: { _id: p.id },
        update: { $inc: { stock: p.cantidad } },
      },
    })),
    { session }
  );
}

module.exports = { buscarActivosPorIds, descontarStock, devolverStock };
