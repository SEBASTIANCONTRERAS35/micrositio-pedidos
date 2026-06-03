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

/**
 * Filtra una lista de ids dejando solo los que son ObjectId de Mongo válidos,
 * convertidos a ObjectId. Los inválidos (ej. SKUs de ZUYU como 'AVI-250' si el
 * carrito quedó con datos de otro modo) se DESCARTAN en vez de tronar con
 * BSONError. Pura y testeable (no toca BD).
 */
function idsObjectIdValidos(ids) {
  return (ids || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Busca los productos activos de un negocio por sus ids (strings).
 * Usa idsObjectIdValidos: un id inválido no matchea → el service lo reporta
 * como "no encontrado" y responde 404 limpio, NUNCA un 500 por BSONError.
 */
async function buscarActivosPorIds(ids, negocioId) {
  const objectIds = idsObjectIdValidos(ids);
  if (objectIds.length === 0) {
    return [];
  }
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
  const resultado = await Producto.bulkWrite(
    snapshot.map((p) => ({
      updateOne: {
        filter: { _id: p.id, stock: { $gte: p.cantidad } },
        update: { $inc: { stock: -p.cantidad } },
      },
    })),
    { session }
  );
  return resultado.modifiedCount === snapshot.length;
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

module.exports = { buscarActivosPorIds, descontarStock, devolverStock, idsObjectIdValidos };
