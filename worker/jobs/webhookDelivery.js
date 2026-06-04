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
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

const ESTADO_MAP = {
  pickup: 'en_camino',
  dropoff: 'en_camino',
  delivered: 'entregado',
  cancelled: 'cancelado',
  failed: 'cancelado',
};

// Procesa eventos del carrier y actualiza el pedido + envia notificacion
module.exports = async (job, logger) => {
  const { provider, event } = job.data;

  if (!event || !event.deliveryId) {
    logger.warn({ provider }, 'Webhook sin deliveryId — ignorado');
    return { ok: false, reason: 'sin deliveryId' };
  }

  const pedido = await Pedido.findOne({ 'delivery.deliveryId': event.deliveryId });
  if (!pedido) {
    logger.warn({ deliveryId: event.deliveryId }, 'Pedido no encontrado para webhook');
    return { ok: false, reason: 'pedido no encontrado' };
  }

  if (pedido.delivery?.estado === event.estado) {
    logger.info({ pedidoId: pedido.pedidoId, estado: event.estado }, 'Webhook duplicado ignorado');
    return { ok: true, duplicate: true };
  }

  pedido.delivery.estado = event.estado;
  if (event.repartidor) {
    pedido.delivery.repartidor = event.repartidor;
  }
  pedido.delivery.actualizadoEn = new Date();
  pedido.markModified('delivery');

  const nuevoEstadoPedido = ESTADO_MAP[event.estado];
  if (nuevoEstadoPedido && pedido.estado !== nuevoEstadoPedido) {
    pedido.set('estado', nuevoEstadoPedido);
    pedido.historial = pedido.historial || [];
    pedido.historial.push({
      estado: nuevoEstadoPedido,
      timestamp: new Date(),
      nota: `Webhook ${provider}: ${event.estado}`,
    });
    pedido.markModified('historial');
  }

  await pedido.save();

  if (event.estado === 'delivered') {
    await colaNotificaciones.add('entregado', { pedidoId: pedido.pedidoId });
  }

  logger.info({ pedidoId: pedido.pedidoId, estado: event.estado, provider }, 'Webhook procesado');
  return { ok: true };
};
