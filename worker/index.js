require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const pino = require('pino');

const deliveryJob = require('./jobs/delivery');
const notificacionesJob = require('./jobs/notificaciones');
const webhookJob = require('./jobs/webhookDelivery');
const syncZuyuJob = require('./jobs/syncZuyu');
const simularCarrierJob = require('./jobs/simularCarrier');
const { instrumentWorker, startMetricsServer, startQueueDepthCollector } = require('./metrics');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      '*.password',
      '*.telefono',
      '*.email',
      '*.direccion',
      '*.cliente.telefono',
      '*.cliente.email',
      '*.cliente.direccion',
    ],
    censor: '[REDACTED]',
  },
});

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const workers = [];
let queueCollector = null;

// Conecta a MongoDB y arranca los workers de colas y el servidor de metricas
async function start() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  logger.info('MongoDB conectado');

  workers.push(
    new Worker(
      'delivery',
      async (job) => {
        logger.info({ jobName: job.name, jobId: job.id }, 'Procesando delivery job');
        return deliveryJob(job, logger);
      },
      {
        connection,
        concurrency: 5,
        autorun: true,
      }
    )
  );

  workers.push(
    new Worker(
      'notificaciones',
      async (job) => {
        logger.info({ jobName: job.name, jobId: job.id }, 'Procesando notificacion job');
        return notificacionesJob(job, logger);
      },
      {
        connection,
        concurrency: 10,
        autorun: true,
      }
    )
  );

  workers.push(
    new Worker(
      'webhook-delivery',
      async (job) => {
        logger.info({ jobName: job.name, jobId: job.id }, 'Procesando webhook job');
        return webhookJob(job, logger);
      },
      {
        connection,
        concurrency: 10,
        autorun: true,
      }
    )
  );

  workers.push(
    new Worker(
      'sync-zuyu',
      async (job) => {
        logger.info({ jobName: job.name, jobId: job.id }, 'Procesando sync ZUYU');
        return syncZuyuJob(job, logger);
      },
      {
        connection,
        concurrency: 10,
        autorun: true,
      }
    )
  );

  workers.push(
    new Worker(
      'simular-carrier',
      async (job) => {
        logger.info({ jobName: job.name, jobId: job.id }, 'Procesando simulacion de carrier');
        return simularCarrierJob(job, logger);
      },
      {
        connection,
        concurrency: 5,
        autorun: true,
      }
    )
  );

  workers.forEach((worker) => {
    instrumentWorker(worker);
    worker.on('completed', (job) => {
      logger.info({ jobId: job.id, queue: job.queueName }, 'Job completado');
    });
    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, queue: job?.queueName, err }, 'Job fallo');
    });
    worker.on('error', (err) => {
      logger.error({ err }, 'Worker error');
    });
  });

  startMetricsServer(parseInt(process.env.METRICS_PORT || '3001', 10));

  queueCollector = startQueueDepthCollector(
    ['delivery', 'notificaciones', 'webhook-delivery', 'sync-zuyu', 'simular-carrier'],
    connection
  );

  logger.info(`Worker iniciado con ${workers.length} colas + metrics en :3001`);
}

// Cierra ordenadamente colector, workers y conexion a MongoDB y termina el proceso
async function shutdown() {
  logger.info('Cerrando workers...');
  if (queueCollector) {
    await queueCollector.stop();
  }
  await Promise.all(workers.map((w) => w.close()));
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

start().catch((err) => {
  logger.error({ err }, 'Error al iniciar worker');
  process.exit(1);
});
