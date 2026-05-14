/**
 * Job: solicitar-repartidor
 * Llama al carrier configurado por el negocio y guarda deliveryId en el pedido
 */
const mongoose = require('mongoose');

// Reutilizamos el modelo del API (en producción sería package compartido)
const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

const { Queue } = require('bullmq');
const colaNotificaciones = new Queue('notificaciones', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

// Carriers (mock o real)
const carriers = {
  ivoy: require('../../api/services/delivery/providers/ivoy'),
  lalamove: require('../../api/services/delivery/providers/lalamove'),
  uberDirect: require('../../api/services/delivery/providers/uberDirect'),
};

module.exports = async (job, logger) => {
  if (job.name === 'solicitar-repartidor') {
    const { pedidoId, proveedor } = job.data;

    const pedido = await Pedido.findOne({ pedidoId });
    if (!pedido) throw new Error(`Pedido ${pedidoId} no encontrado`);

    const carrier = carriers[proveedor] || carriers.ivoy;
    const result = await carrier.requestDelivery(pedido);

    pedido.delivery = {
      proveedor,
      deliveryId: result.deliveryId,
      trackingUrl: result.trackingUrl,
      estado: result.estado,
      costoEnvio: result.costoEnvio,
      actualizadoEn: new Date(),
    };
    pedido.historial = pedido.historial || [];
    pedido.historial.push({
      estado: 'repartidor_solicitado',
      nota: `Solicitado a ${proveedor}: ${result.deliveryId}`,
    });
    await pedido.save();

    // Notificar al cliente
    await colaNotificaciones.add('repartidor-asignado', { pedidoId });

    logger.info({ pedidoId, deliveryId: result.deliveryId, proveedor }, 'Repartidor solicitado');
    return { ok: true, deliveryId: result.deliveryId };
  }

  throw new Error(`Job desconocido: ${job.name}`);
};
