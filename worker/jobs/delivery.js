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
    const proveedorElegido = carriers[proveedor] ? proveedor : 'ivoy';

    const pedido = await Pedido.findOne({ pedidoId });
    if (!pedido) {
      throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const negocio = await Negocio.findById(pedido.negocioId).lean();

    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;
    let resultado;
    try {
      resultado = await repartidorProveedor.requestDelivery(pedido, negocio);
    } catch (err) {
      // Fallo real del carrier (HTTP no-OK, timeout, credenciales rechazadas).
      // Se loguea como error de dominio y se re-lanza para que el wrapper emita
      // job.fallo/job.dlq; los reintentos quedan acotados por la config de la cola
      // (attempts<=3 con backoff), nunca infinitos.
      logger.error(
        { event: 'delivery.carrier.error', pedidoId, provider: proveedorElegido, err },
        'Fallo al solicitar el repartidor al carrier'
      );
      throw err;
    }

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

    await colaNotificaciones.add('repartidor-asignado', {
      pedidoId,
      requestId: job.data.requestId,
    });

    // En modo mock, simula la progresion del carrier (recolectado -> en camino ->
    // entregado) emitiendo los eventos via la cola webhook-delivery con retardos.
    if (resultado.deliveryId && resultado.deliveryId.includes('mock')) {
      await colaSimularCarrier.add(
        'simular-carrier',
        {
          pedidoId,
          deliveryId: resultado.deliveryId,
          provider: proveedor,
          paso: 0,
          requestId: job.data.requestId,
        },
        { delay: 6000 }
      );
      logger.info(
        {
          event: 'delivery.solicitado',
          pedidoId,
          deliveryId: resultado.deliveryId,
          provider: proveedorElegido,
        },
        'Simulacion de carrier (mock) agendada'
      );
    }

    logger.info(
      {
        event: 'delivery.solicitado',
        pedidoId,
        deliveryId: resultado.deliveryId,
        provider: proveedorElegido,
        costoEnvio: resultado.costoEnvio,
      },
      'Repartidor solicitado al carrier'
    );
    return { ok: true, deliveryId: resultado.deliveryId };
  }

  if (job.name === 'cancelar-repartidor') {
    const { pedidoId, deliveryId, proveedor } = job.data;
    const proveedorElegido = carriers[proveedor] ? proveedor : 'ivoy';
    const repartidorProveedor = carriers[proveedor] || carriers.ivoy;

    let resultado;
    try {
      resultado = await repartidorProveedor.cancelDelivery(deliveryId);
    } catch (err) {
      logger.error(
        { event: 'delivery.carrier.error', pedidoId, deliveryId, provider: proveedorElegido, err },
        'Fallo al cancelar el repartidor en el carrier'
      );
      throw err;
    }

    // ok:false es una regla de negocio (el carrier rechazo la cancelacion), no
    // un fallo de infra: se loguea como warn y no se re-lanza.
    logger[resultado.ok ? 'info' : 'warn'](
      {
        event: 'delivery.cancelado',
        pedidoId,
        deliveryId,
        provider: proveedorElegido,
        ok: resultado.ok,
      },
      resultado.ok
        ? 'Repartidor cancelado en el carrier'
        : 'El carrier no pudo cancelar el repartidor'
    );
    return resultado;
  }

  throw new Error(`Job desconocido: ${job.name}`);
};
