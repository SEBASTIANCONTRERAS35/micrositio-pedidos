'use strict';

const COSTO_ENVIO_BASE = 49;

// Construye el snapshot de productos cruzando lo pedido con lo de la BD.
function construirSnapshot(productosInput, productosDb) {
  const snapshot = [];
  const faltantes = [];
  const noEncontrados = [];

  for (const req of productosInput) {
    const db = productosDb.find((p) => p._id.toString() === req.id);
    if (!db) {
      noEncontrados.push(req.id);
      continue;
    }
    if (db.stock < req.cantidad) {
      faltantes.push({ id: req.id, pedido: req.cantidad, disponible: db.stock });
    }
    snapshot.push({
      id: db._id,
      nombre: db.nombre,
      precioUnitario: db.precio,
      cantidad: req.cantidad,
    });
  }

  return { snapshot, faltantes, noEncontrados };
}

// Calcula subtotal / costoEnvio / total a partir del snapshot.
function calcularTotales(snapshot, costoEnvio = COSTO_ENVIO_BASE) {
  const subtotal = snapshot.reduce((s, p) => s + p.precioUnitario * p.cantidad, 0);
  return { subtotal, costoEnvio, total: subtotal + costoEnvio };
}

module.exports = { COSTO_ENVIO_BASE, construirSnapshot, calcularTotales };
