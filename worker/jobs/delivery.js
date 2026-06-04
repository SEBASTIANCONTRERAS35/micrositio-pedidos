/**
 * Job: solicitar-repartidor
 * Llama al carrier configurado por el negocio y guarda deliveryId en el pedido
 */
const mongoose = require('mongoose');

// Reutilizamos el modelo del API (en producción sería package compartido)
const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

// El negocio aporta la dirección de pickup (origen del envío) que los
// providers de delivery necesitan — ver domain/envio.js.
const negocioSchema = new mongoose.Schema({}, { strict: false, collection: 'negocios' });
const Negocio = mongoose.models.Negocio || mongoose.model('Negocio', negocioSchema);

const { Queue } = require('bullmq');
const colaNotificaciones = new Queue('notificaciones', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  // Limpieza automática: no acumular jobs terminados en Redis.
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

// Carriers (mock o real) — copia local en worker/services/delivery/
const carriers = {
  ivoy: require('../services/delivery/providers/ivoy'),
  lalamove: require('../services/delivery/providers/lalamove'),
  uberDirect: require('../services/delivery/providers/uberDirect'),
};

module.exports = async (job, logger) => {
  if (job.name === 'solicitar-repartidor') {
    const { pedidoId, proveedor } = job.data;

    const pedido = await Pedido.findOne({ pedidoId });
    if (!pedido) {
      throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    // Origen del envío: dirección del negocio. findById castea negocioId a
    // ObjectId (un valor no-ObjectId daría CastError, no inyección).
    const negocio = await Negocio.findById(pedido.negocioId).lean();

    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;
    const resultado = await repartidorProveedor.requestDelivery(pedido, negocio);

    // .set() en vez de asignación directa: con schema strict:false un campo
    // NUEVO asignado con "=" no llega al _doc interno de Mongoose y save() lo
    // ignora aunque se llame markModified. .set() sí lo registra.
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

    // Notificar al cliente
    await colaNotificaciones.add('repartidor-asignado', { pedidoId });

    logger.info({ pedidoId, deliveryId: resultado.deliveryId, proveedor }, 'Repartidor solicitado');
    return { ok: true, deliveryId: resultado.deliveryId };
  }

  if (job.name === 'cancelar-repartidor') {
    // El pedido se cancelo y ya tenia repartidor — cancelarlo en el carrier.
    const { deliveryId, proveedor } = job.data;
    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;
    const resultado = await repartidorProveedor.cancelDelivery(deliveryId);
    logger.info({ deliveryId, proveedor, ok: resultado.ok }, 'Cancelacion de repartidor procesada');
    return resultado;
  }

  throw new Error(`Job desconocido: ${job.name}`);
};
