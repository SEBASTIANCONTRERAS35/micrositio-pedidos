'use strict';

const mongoose = require('mongoose');
const Producto = require('../../models/producto');

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

// Devuelve stock al cancelar un pedido (incondicional).
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
