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
  maxRetriesPerRequest: null,
});

const IDEM_TTL_SECONDS = 10 * 60;

// Procesa eventos de inventario y pedidos que llegan de ZUYU via webhook.
module.exports = async (job, logger) => {
  const { event, negocioSlug, payload, eventId } = job.data;
  logger.info({ event, negocioSlug, eventId }, 'Procesando sync ZUYU');

  if (eventId) {
    const fresh = await redis.set(`zuyu:evt:${eventId}`, '1', 'EX', IDEM_TTL_SECONDS, 'NX');
    if (fresh === null) {
      logger.info({ eventId }, 'Evento ZUYU duplicado — ignorado (idempotencia)');
      return { ok: true, duplicate: true };
    }
  }

  const negocio = await Negocio.findOne({ slug: negocioSlug }).lean();
  if (!negocio) {
    logger.warn({ negocioSlug }, 'Negocio no encontrado en mongo local');
    return { ok: false, reason: 'negocio_no_encontrado' };
  }

  const zuyuId = payload?.id;

  switch (event) {
    case 'stock_actualizado':
      await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        { $set: { stock: payload.stock, actualizadoEn: new Date() } }
      );
      break;

    case 'producto_actualizado':
      await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        {
          $set: {
            nombre: payload.nombre,
            descripcion: payload.descripcion || '',
            precio: payload.precio,
            stock: payload.stock,
            categoria: payload.categoria || 'General',
            imagen: payload.imagen || null,
            activo: payload.activo !== false,
            actualizadoEn: new Date(),
          },
        },
        { upsert: true }
      );
      break;

    case 'producto_creado':
      await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        {
          $set: {
            negocioId: negocio._id,
            zuyuProductoId: zuyuId,
            nombre: payload.nombre,
            descripcion: payload.descripcion || '',
            precio: payload.precio,
            stock: payload.stock,
            categoria: payload.categoria || 'General',
            imagen: payload.imagen || null,
            activo: true,
          },
        },
        { upsert: true }
      );
      break;

    case 'producto_eliminado':
      await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        { $set: { activo: false, actualizadoEn: new Date() } }
      );
      break;

    case 'pedido_confirmado': {
      const Pedido =
        mongoose.models.Pedido ||
        mongoose.model('Pedido', new mongoose.Schema({}, { strict: false, collection: 'pedidos' }));
      const ref = payload?.referenciaExterna;
      if (ref) {
        await Pedido.updateOne(
          { referenciaExterna: ref, negocioId: negocio._id },
          {
            $set: {
              zuyuVentaId: payload.zuyuVentaId || null,
              zuyuIdVenta: payload.idVenta || null,
              estadoZuyu: payload.estado || 'confirmado',
              zuyuConfirmadoEn: new Date(),
            },
          }
        );
      }
      logger.info(
        { referenciaExterna: ref, idVenta: payload?.idVenta },
        'ZUYU confirmo el pedido — enlace zuyuVentaId/idVenta guardado'
      );
      break;
    }

    case 'pedido_cancelado': {
      const Pedido =
        mongoose.models.Pedido ||
        mongoose.model('Pedido', new mongoose.Schema({}, { strict: false, collection: 'pedidos' }));
      const refCancel = payload?.referenciaExterna;
      if (refCancel) {
        await Pedido.updateOne(
          { referenciaExterna: refCancel, negocioId: negocio._id, estado: { $ne: 'cancelado' } },
          {
            $set: { estado: 'cancelado', estadoZuyu: 'cancelado', actualizadoEn: new Date() },
            $push: {
              historial: {
                estado: 'cancelado',
                timestamp: new Date(),
                nota: `Cancelado en ZUYU${payload?.motivo ? ': ' + payload.motivo : ''}`,
              },
            },
          }
        );
      }
      logger.info(
        { referenciaExterna: refCancel },
        'ZUYU cancelo el pedido — estado local actualizado'
      );
      break;
    }

    default:
      logger.warn({ event }, 'Evento desconocido de ZUYU');
  }

  await redis.del(`tienda:${negocioSlug}`).catch(() => {});
  logger.info({ negocioSlug, event }, 'Sync ZUYU completado, cache invalidado');

  return { ok: true };
};
