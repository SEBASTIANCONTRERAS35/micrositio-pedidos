const mongoose = require('mongoose');

const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

const negocioSchema = new mongoose.Schema({}, { strict: false, collection: 'negocios' });
const Negocio = mongoose.models.Negocio || mongoose.model('Negocio', negocioSchema);

const { Queue } = require('bullmq');
const redisConnection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const colaNotificaciones = new Queue('notificaciones', {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

const colaSimularCarrier = new Queue('simular-carrier', {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

const carriers = {
  ivoy: require('../services/delivery/providers/ivoy'),
  lalamove: require('../services/delivery/providers/lalamove'),
  uberDirect: require('../services/delivery/providers/uberDirect'),
};

// Procesa jobs de solicitud y cancelacion de repartidor segun job.name
module.exports = async (job, logger) => {
  if (job.name === 'solicitar-repartidor') {
    const { pedidoId, proveedor } = job.data;

    const pedido = await Pedido.findOne({ pedidoId });
    if (!pedido) {
      throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const negocio = await Negocio.findById(pedido.negocioId).lean();

    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;
    const resultado = await repartidorProveedor.requestDelivery(pedido, negocio);

    pedido.set('delivery', {
      proveedor,
      deliveryId: resultado.deliveryId,
      trackingUrl: resultado.trackingUrl,
      estado: resultado.estado,
      costoEnvio: resultado.costoEnvio,
      actualizadoEn: new Date(),
    });
    pedido.historial = pedido.historial || [];
    pedido.historial.push({
      estado: 'repartidor_solicitado',
      timestamp: new Date(),
      nota: `Solicitado a ${proveedor}: ${resultado.deliveryId}`,
    });
    pedido.markModified('historial');
    await pedido.save();

    await colaNotificaciones.add('repartidor-asignado', { pedidoId });

    // En modo mock, simula la progresion del carrier (recolectado -> en camino ->
    // entregado) emitiendo los eventos via la cola webhook-delivery con retardos.
    if (resultado.deliveryId && resultado.deliveryId.includes('mock')) {
      await colaSimularCarrier.add(
        'simular-carrier',
        { pedidoId, deliveryId: resultado.deliveryId, provider: proveedor, paso: 0 },
        { delay: 6000 }
      );
      logger.info({ pedidoId, deliveryId: resultado.deliveryId }, 'Simulacion de carrier (mock) agendada');
    }

    logger.info({ pedidoId, deliveryId: resultado.deliveryId, proveedor }, 'Repartidor solicitado');
    return { ok: true, deliveryId: resultado.deliveryId };
  }

  if (job.name === 'cancelar-repartidor') {
    const { deliveryId, proveedor } = job.data;
    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;
    const resultado = await repartidorProveedor.cancelDelivery(deliveryId);
    logger.info({ deliveryId, proveedor, ok: resultado.ok }, 'Cancelacion de repartidor procesada');
    return resultado;
  }

  throw new Error(`Job desconocido: ${job.name}`);
};
