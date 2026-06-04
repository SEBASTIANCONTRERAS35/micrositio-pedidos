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

// Resume el resultado de un updateOne de mongo en campos planos para el log.
function resumenMutacion(res) {
  return {
    matched: res?.matchedCount ?? 0,
    modified: res?.modifiedCount ?? 0,
    upserted: res?.upsertedCount ?? 0,
  };
}

// Procesa eventos de inventario y pedidos que llegan de ZUYU via webhook.
module.exports = async (job, logger) => {
  const { event, negocioSlug, payload, eventId } = job.data;
  logger.info(
    { event: 'sync.zuyu.iniciado', tipo: event, negocioSlug, eventId },
    'Procesando sync ZUYU'
  );

  if (eventId) {
    const fresh = await redis.set(`zuyu:evt:${eventId}`, '1', 'EX', IDEM_TTL_SECONDS, 'NX');
    if (fresh === null) {
      logger.info(
        { event: 'sync.zuyu.duplicado', tipo: event, negocioSlug, eventId },
        'Evento ZUYU duplicado — ignorado (idempotencia)'
      );
      return { ok: true, duplicate: true };
    }
  }

  const negocio = await Negocio.findOne({ slug: negocioSlug }).lean();
  if (!negocio) {
    logger.warn(
      { event: 'sync.zuyu.completado', tipo: event, negocioSlug, motivo: 'negocio_no_encontrado' },
      'Negocio no encontrado en mongo local'
    );
    return { ok: false, reason: 'negocio_no_encontrado' };
  }

  const zuyuId = payload?.id;

  switch (event) {
    case 'stock_actualizado': {
      const res = await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        { $set: { stock: payload.stock, actualizadoEn: new Date() } }
      );
      logger.info(
        {
          event: 'sync.zuyu.producto.actualizado',
          tipo: event,
          negocioSlug,
          zuyuProductoId: zuyuId,
          ...resumenMutacion(res),
        },
        'Stock de producto actualizado desde ZUYU'
      );
      break;
    }

    case 'producto_actualizado': {
      const res = await Producto.updateOne(
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
      logger.info(
        {
          event: 'sync.zuyu.producto.actualizado',
          tipo: event,
          negocioSlug,
          zuyuProductoId: zuyuId,
          ...resumenMutacion(res),
        },
        'Producto actualizado desde ZUYU'
      );
      break;
    }

    case 'producto_creado': {
      const res = await Producto.updateOne(
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
      logger.info(
        {
          event: 'sync.zuyu.producto.actualizado',
          tipo: event,
          negocioSlug,
          zuyuProductoId: zuyuId,
          ...resumenMutacion(res),
        },
        'Producto creado desde ZUYU'
      );
      break;
    }

    case 'producto_eliminado': {
      const res = await Producto.updateOne(
        { negocioId: negocio._id, zuyuProductoId: zuyuId },
        { $set: { activo: false, actualizadoEn: new Date() } }
      );
      logger.info(
        {
          event: 'sync.zuyu.producto.actualizado',
          tipo: event,
          negocioSlug,
          zuyuProductoId: zuyuId,
          ...resumenMutacion(res),
        },
        'Producto desactivado desde ZUYU'
      );
      break;
    }

    case 'pedido_confirmado': {
      const Pedido =
        mongoose.models.Pedido ||
        mongoose.model('Pedido', new mongoose.Schema({}, { strict: false, collection: 'pedidos' }));
      const ref = payload?.referenciaExterna;
      let res = null;
      let pedidoId = null;
      if (ref) {
        res = await Pedido.updateOne(
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
        const doc = await Pedido.findOne(
          { referenciaExterna: ref, negocioId: negocio._id },
          { pedidoId: 1 }
        ).lean();
        pedidoId = doc?.pedidoId || null;
      }
      logger.info(
        {
          event: 'zuyu.pedido.confirmado',
          pedidoId,
          negocioSlug,
          idVenta: payload?.idVenta,
          ...resumenMutacion(res),
        },
        'ZUYU confirmo el pedido — enlace zuyuVentaId/idVenta guardado'
      );
      break;
    }

    case 'pedido_cancelado': {
      const Pedido =
        mongoose.models.Pedido ||
        mongoose.model('Pedido', new mongoose.Schema({}, { strict: false, collection: 'pedidos' }));
      const refCancel = payload?.referenciaExterna;
      let res = null;
      let pedidoId = null;
      if (refCancel) {
        const doc = await Pedido.findOne(
          { referenciaExterna: refCancel, negocioId: negocio._id },
          { pedidoId: 1, estado: 1 }
        ).lean();
        pedidoId = doc?.pedidoId || null;
        const estadoAnterior = doc?.estado || null;
        res = await Pedido.updateOne(
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
        logger.info(
          {
            event: 'zuyu.pedido.cancelado',
            pedidoId,
            negocioSlug,
            estadoAnterior,
            estadoNuevo: 'cancelado',
            ...resumenMutacion(res),
          },
          'ZUYU cancelo el pedido — estado local actualizado'
        );
      } else {
        logger.info(
          { event: 'zuyu.pedido.cancelado', pedidoId, negocioSlug, ...resumenMutacion(res) },
          'ZUYU cancelo el pedido — sin referenciaExterna, nada que actualizar'
        );
      }
      break;
    }

    default:
      logger.warn(
        { event: 'sync.zuyu.completado', tipo: event, negocioSlug, motivo: 'evento_desconocido' },
        'Evento desconocido de ZUYU'
      );
  }

  // Invalidacion de cache de la tienda: si falla, se loguea (no se traga) pero no
  // se re-lanza para no marcar el sync como fallido por una cache obsoleta.
  try {
    await redis.del(`tienda:${negocioSlug}`);
    logger.info(
      { event: 'sync.zuyu.cache.invalidada', tipo: event, negocioSlug },
      'Cache de la tienda invalidada tras sync ZUYU'
    );
  } catch (err) {
    logger.warn(
      { event: 'sync.zuyu.cache.fallo', tipo: event, negocioSlug, err },
      'No se pudo invalidar la cache de la tienda tras sync ZUYU'
    );
  }

  logger.info({ event: 'sync.zuyu.completado', tipo: event, negocioSlug }, 'Sync ZUYU completado');

  return { ok: true };
};
