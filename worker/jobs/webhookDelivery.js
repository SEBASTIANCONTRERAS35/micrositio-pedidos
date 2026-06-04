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
    logger.warn(
      { event: 'webhook.delivery.recibido', provider, motivo: 'sin_delivery_id' },
      'Webhook de carrier sin deliveryId — ignorado'
    );
    return { ok: false, reason: 'sin deliveryId' };
  }

  const pedido = await Pedido.findOne({ 'delivery.deliveryId': event.deliveryId });
  if (!pedido) {
    logger.warn(
      {
        event: 'webhook.delivery.recibido',
        provider,
        deliveryId: event.deliveryId,
        motivo: 'pedido_no_encontrado',
      },
      'Webhook de carrier sin pedido asociado — ignorado'
    );
    return { ok: false, reason: 'pedido no encontrado' };
  }

  const estadoAnterior = pedido.delivery?.estado;

  logger.info(
    {
      event: 'webhook.delivery.recibido',
      provider,
      pedidoId: pedido.pedidoId,
      deliveryId: event.deliveryId,
      estado: event.estado,
    },
    'Webhook de carrier recibido'
  );

  if (estadoAnterior === event.estado) {
    logger.info(
      {
        event: 'webhook.delivery.recibido',
        provider,
        pedidoId: pedido.pedidoId,
        estado: event.estado,
        duplicado: true,
      },
      'Webhook de carrier duplicado — ignorado'
    );
    return { ok: true, duplicate: true };
  }

  pedido.delivery.estado = event.estado;
  if (event.repartidor) {
    pedido.delivery.repartidor = event.repartidor;
  }
  pedido.delivery.actualizadoEn = new Date();
  pedido.markModified('delivery');

  const nuevoEstadoPedido = ESTADO_MAP[event.estado];
  const estadoPedidoAnterior = pedido.estado;
  let cambioEstadoPedido = false;
  if (nuevoEstadoPedido && pedido.estado !== nuevoEstadoPedido) {
    pedido.set('estado', nuevoEstadoPedido);
    pedido.historial = pedido.historial || [];
    pedido.historial.push({
      estado: nuevoEstadoPedido,
      timestamp: new Date(),
      nota: `Webhook ${provider}: ${event.estado}`,
    });
    pedido.markModified('historial');
    cambioEstadoPedido = true;
  }

  await pedido.save();

  if (event.estado === 'delivered') {
    await colaNotificaciones.add('entregado', {
      pedidoId: pedido.pedidoId,
      requestId: job.data.requestId,
    });
  }

  if (cambioEstadoPedido) {
    logger.info(
      {
        event: 'webhook.delivery.recibido',
        provider,
        pedidoId: pedido.pedidoId,
        deliveryEstadoAnterior: estadoAnterior,
        deliveryEstadoNuevo: event.estado,
        estadoAnterior: estadoPedidoAnterior,
        estadoNuevo: nuevoEstadoPedido,
      },
      'Webhook de carrier procesado: cambio de estado del pedido'
    );
  } else {
    logger.info(
      {
        event: 'webhook.delivery.recibido',
        provider,
        pedidoId: pedido.pedidoId,
        deliveryEstadoAnterior: estadoAnterior,
        deliveryEstadoNuevo: event.estado,
      },
      'Webhook de carrier procesado: estado de entrega actualizado'
    );
  }
  return { ok: true };
};
