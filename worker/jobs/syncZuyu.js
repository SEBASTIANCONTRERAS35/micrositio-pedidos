/**
 * Job: sync-zuyu
 * Procesa eventos de inventario que vienen de ZUYU via webhook.
 *
 * Tipos de evento:
 *   - producto_creado:  fetchar y agregar a Mongo local
 *   - producto_actualizado: refrescar campos del producto
 *   - producto_eliminado: marcar inactivo
 *   - stock_actualizado: actualizar solo stock (mas frecuente)
 *
 * Tambien invalida el cache de catalogo del slug afectado.
 */
const mongoose = require('mongoose');

const negocioSchema = new mongoose.Schema({}, { strict: false, collection: 'negocios' });
const productoSchema = new mongoose.Schema({}, { strict: false, collection: 'productos' });
const Negocio = mongoose.models.Negocio || mongoose.model('Negocio', negocioSchema);
const Producto = mongoose.models.Producto || mongoose.model('Producto', productoSchema);

const IORedis = require('ioredis');
const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
});

module.exports = async (job, logger) => {
  const { event, negocioSlug, payload } = job.data;
  logger.info({ event, negocioSlug }, 'Procesando sync ZUYU');

  const negocio = await Negocio.findOne({ slug: negocioSlug }).lean();
  if (!negocio) {
    logger.warn({ negocioSlug }, 'Negocio no encontrado en mongo local');
    return { ok: false, reason: 'negocio_no_encontrado' };
  }

  switch (event) {
    case 'stock_actualizado':
      await Producto.updateOne(
        { negocioId: negocio._id, _id: payload.productoId },
        { $set: { stock: payload.stock, actualizadoEn: new Date() } }
      );
      break;

    case 'producto_actualizado':
      await Producto.updateOne(
        { negocioId: negocio._id, _id: payload.productoId },
        {
          $set: {
            nombre: payload.nombre,
            precio: payload.precio,
            stock: payload.stock,
            categoria: payload.categoria,
            imagen: payload.imagen,
            activo: payload.activo,
            actualizadoEn: new Date(),
          },
        }
      );
      break;

    case 'producto_creado':
      await Producto.updateOne(
        { negocioId: negocio._id, _id: payload.productoId },
        {
          $set: {
            negocioId: negocio._id,
            nombre: payload.nombre,
            precio: payload.precio,
            stock: payload.stock,
            categoria: payload.categoria,
            imagen: payload.imagen,
            activo: true,
          },
        },
        { upsert: true }
      );
      break;

    case 'producto_eliminado':
      await Producto.updateOne(
        { negocioId: negocio._id, _id: payload.productoId },
        { $set: { activo: false } }
      );
      break;

    default:
      logger.warn({ event }, 'Evento desconocido de ZUYU');
  }

  // Invalidar cache del catalogo del slug
  await redis.del(`tienda:${negocioSlug}`);
  logger.info({ negocioSlug, event }, 'Cache invalidado');

  return { ok: true };
};
