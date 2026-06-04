const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const colaWebhookDelivery = new Queue('webhook-delivery', {
  connection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

const colaSimularCarrier = new Queue('simular-carrier', {
  connection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});

const pasos = [
  { estado: 'pickup', repartidor: { nombre: 'Carlos Sim', telefono: '+525500000000' } },
  { estado: 'dropoff' },
  { estado: 'delivered' },
];

// Simula la progresion del carrier en modo mock: emite el evento del paso actual
// hacia la cola webhook-delivery y agenda el siguiente paso con retardo.
module.exports = async (job, logger) => {
  const { pedidoId, deliveryId, provider, paso } = job.data;

  const pasoActual = pasos[paso];
  if (!pasoActual) {
    logger.warn(
      {
        event: 'delivery.solicitado',
        sim: true,
        pedidoId,
        deliveryId,
        provider,
        paso,
        motivo: 'paso_fuera_de_rango',
      },
      'Carrier simulado: paso fuera de rango — ignorado'
    );
    return { ok: false, reason: 'paso fuera de rango' };
  }

  await colaWebhookDelivery.add('webhook-mock', {
    provider,
    requestId: job.data.requestId,
    event: {
      deliveryId,
      estado: pasoActual.estado,
      repartidor: pasoActual.repartidor,
    },
  });

  logger.info(
    {
      event: 'delivery.solicitado',
      sim: true,
      pedidoId,
      deliveryId,
      provider,
      paso,
      estado: pasoActual.estado,
    },
    'Carrier simulado: emitiendo evento del paso'
  );

  const siguiente = paso + 1;
  if (pasos[siguiente]) {
    await colaSimularCarrier.add(
      'simular-carrier',
      { pedidoId, deliveryId, provider, paso: siguiente, requestId: job.data.requestId },
      { delay: 6000 }
    );
    logger.info(
      {
        event: 'delivery.solicitado',
        sim: true,
        pedidoId,
        deliveryId,
        provider,
        paso,
        siguientePaso: siguiente,
        delayMs: 6000,
      },
      'Carrier simulado: siguiente paso agendado'
    );
  }

  return { ok: true, estado: pasoActual.estado };
};
