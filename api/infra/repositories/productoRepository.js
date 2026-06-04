'use strict';

const mongoose = require('mongoose');
const Producto = require('../../models/producto');
const logger = require('../../utils/logger');

// Resume el snapshot/productos a [{ id, cantidad }] para loguear sin PII ni precios.
function resumirItems(items) {
  return (items || []).map((p) => ({ id: String(p.id), cantidad: p.cantidad }));
}

// Filtra ids dejando solo ObjectId de Mongo validos, convertidos a ObjectId.
function idsObjectIdValidos(ids) {
  return (ids || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

// Busca los productos activos de un negocio por sus ids (strings).
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

// Descuenta stock de forma atomica y condicional dentro de una transaccion.
// ctx (opcional) lleva pedidoId/negocioId solo para correlacionar el log.
async function descontarStock(snapshot, session, ctx = {}) {
  const resultado = await Producto.bulkWrite(
    snapshot.map((p) => ({
      updateOne: {
        filter: { _id: p.id, stock: { $gte: p.cantidad } },
        update: { $inc: { stock: -p.cantidad } },
      },
    })),
    { session }
  );
  const exito = resultado.modifiedCount === snapshot.length;
  logger.info(
    {
      event: 'stock.descontado',
      pedidoId: ctx.pedidoId,
      negocioId: ctx.negocioId,
      items: resumirItems(snapshot),
      exito,
    },
    'Stock descontado dentro de la transaccion del pedido'
  );
  return exito;
}

// Devuelve stock al cancelar un pedido (incondicional).
// ctx (opcional) lleva pedidoId/negocioId solo para correlacionar el log.
async function devolverStock(productos, session, ctx = {}) {
  await Producto.bulkWrite(
    productos.map((p) => ({
      updateOne: {
        filter: { _id: p.id },
        update: { $inc: { stock: p.cantidad } },
      },
    })),
    { session }
  );
  logger.info(
    {
      event: 'stock.devuelto',
      pedidoId: ctx.pedidoId,
      negocioId: ctx.negocioId,
      items: resumirItems(productos),
    },
    'Stock devuelto al cancelar el pedido'
  );
}

module.exports = { buscarActivosPorIds, descontarStock, devolverStock, idsObjectIdValidos };
