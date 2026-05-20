/**
 * Job: webhook-delivery
 * Procesa eventos del carrier (pickup, dropoff, delivered, etc.)
 * y actualiza el pedido + envia notificacion correspondiente
 */
const mongoose = require('mongoose');
const { Queue } = require('bullmq');

const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

const colaNotificaciones = new Queue('notificaciones', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

const ESTADO_MAP = {
  pickup: 'en_camino',
  dropoff: 'en_camino',
  delivered: 'entregado',
  cancelled: 'cancelado',
  failed: 'cancelado',
};

module.exports = async (job, logger) => {
  const { provider, event } = job.data;

  // Buscar pedido por deliveryId
  const pedido = await Pedido.findOne({ 'delivery.deliveryId': event.deliveryId });
  if (!pedido) {
    logger.warn({ deliveryId: event.deliveryId }, 'Pedido no encontrado para webhook');
    return { ok: false, reason: 'pedido no encontrado' };
  }

  // Idempotencia: si ya estamos en este estado, ignorar
  if (pedido.delivery?.estado === event.estado) {
    logger.info({ pedidoId: pedido.pedidoId, estado: event.estado }, 'Webhook duplicado ignorado');
    return { ok: true, duplicate: true };
  }

  // Actualizar pedido
  pedido.delivery.estado = event.estado;
  if (event.repartidor) {
    pedido.delivery.repartidor = event.repartidor;
  }
  pedido.delivery.actualizadoEn = new Date();

  const nuevoEstadoPedido = ESTADO_MAP[event.estado];
  if (nuevoEstadoPedido && pedido.estado !== nuevoEstadoPedido) {
    pedido.estado = nuevoEstadoPedido;
    pedido.historial = pedido.historial || [];
    pedido.historial.push({
      estado: nuevoEstadoPedido,
      nota: `Webhook ${provider}: ${event.estado}`,
    });
  }

  await pedido.save();

  // Notificar al cliente segun el evento
  if (event.estado === 'delivered') {
    await colaNotificaciones.add('entregado', { pedidoId: pedido.pedidoId });
  }

  logger.info({ pedidoId: pedido.pedidoId, estado: event.estado, provider }, 'Webhook procesado');
  return { ok: true };
};
