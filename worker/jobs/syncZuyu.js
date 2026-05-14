/**
 * Job: sync-zuyu
 * Procesa eventos de inventario que vienen de ZUYU via webhook.
 *
 * Tipos de evento (contrato ZUYU/backend/publicApi):
 *   - producto_creado:      upsert del producto en Mongo local
 *   - producto_actualizado: refrescar campos del producto
 *   - producto_eliminado:   marcar inactivo
 *   - stock_actualizado:    actualizar solo stock (mas frecuente)
 *   - pedido_confirmado:    confirmacion de que ZUYU registro el pedido
 *
 * IDEMPOTENCIA: BullMQ ya deduplica por jobId=eventId, pero agregamos una
 * segunda capa con un SET NX en Redis (TTL 10 min). Asi, aunque el job se
 * reintente o llegue duplicado por otra via, el efecto se aplica una vez.
 *
 * El payload de producto viene mapeado por el ACL de ZUYU:
 *   { id, nombre, descripcion, precio, stock, categoria, imagen, trackeado }
 * donde `id` es el ID_PRODUCTO de ZUYU.
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
  maxRetriesPerRequest: null,
});

const IDEM_TTL_SECONDS = 10 * 60; // 10 min

module.exports = async (job, logger) => {
  const { event, negocioSlug, payload, eventId } = job.data;
  logger.info({ event, negocioSlug, eventId }, 'Procesando sync ZUYU');

  // ── Idempotencia: SET NX. Si ya existe, el evento ya se proceso. ──
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

  // El id del producto en el payload es el ID_PRODUCTO de ZUYU.
  // En el micrositio lo guardamos como campo `zuyuProductoId` para
  // correlacionar (el _id local es independiente).
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

    case 'pedido_confirmado':
      // ZUYU confirma que registro el pedido como Venta. Solo logueamos —
      // el pedido local ya existe (lo creo el micrositio).
      logger.info(
        { referenciaExterna: payload?.referenciaExterna, idVenta: payload?.idVenta },
        'ZUYU confirmo el pedido'
      );
      break;

    default:
      logger.warn({ event }, 'Evento desconocido de ZUYU');
  }

  // Invalidar cache del catalogo del slug (el TTLCache in-memory del API
  // se invalida via su propio mecanismo; aqui limpiamos la key Redis si
  // existe alguna estrategia de cache compartida).
  await redis.del(`tienda:${negocioSlug}`).catch(() => {});
  logger.info({ negocioSlug, event }, 'Sync ZUYU completado, cache invalidado');

  return { ok: true };
};
