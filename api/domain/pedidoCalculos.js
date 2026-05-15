/**
 * Calculos de dominio del Pedido — funciones PURAS.
 * Construyen el snapshot de productos y los totales sin tocar la BD ni Redis.
 * Esto es lo que hace el dominio testeable en aislamiento.
 */
'use strict';

// Estimado base del costo de envio; el provider de delivery lo ajusta luego.
const COSTO_ENVIO_BASE = 49;

/**
 * Construye el snapshot de productos del pedido cruzando lo que pidio el
 * cliente con lo que hay en la BD. NO lanza — reporta `faltantes` y
 * `noEncontrados` para que el caller decida (separa decision de I/O).
 *
 * @param {{id:string,cantidad:number}[]} productosInput - lo que pidio el cliente
 * @param {object[]} productosDb - docs Producto (lean): { _id, nombre, precio, stock }
 * @returns {{ snapshot: object[], faltantes: object[], noEncontrados: string[] }}
 */
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
    // Validacion preliminar de stock (la transaccion la re-valida de forma
    // atomica). Mismo criterio que el codigo original: `stock < cantidad`.
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

/**
 * Calcula subtotal / costoEnvio / total a partir del snapshot.
 *
 * @param {object[]} snapshot - productos con { precioUnitario, cantidad }
 * @param {number} [costoEnvio=COSTO_ENVIO_BASE]
 * @returns {{ subtotal:number, costoEnvio:number, total:number }}
 */
function calcularTotales(snapshot, costoEnvio = COSTO_ENVIO_BASE) {
  const subtotal = snapshot.reduce((s, p) => s + p.precioUnitario * p.cantidad, 0);
  return { subtotal, costoEnvio, total: subtotal + costoEnvio };
}

module.exports = { COSTO_ENVIO_BASE, construirSnapshot, calcularTotales };
