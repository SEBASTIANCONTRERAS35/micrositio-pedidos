require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');

const logger = require('./utils/logger');

const deliveryJob = require('./jobs/delivery');
const notificacionesJob = require('./jobs/notificaciones');
const webhookJob = require('./jobs/webhookDelivery');
const syncZuyuJob = require('./jobs/syncZuyu');
const simularCarrierJob = require('./jobs/simularCarrier');
const { instrumentWorker, startMetricsServer, startQueueDepthCollector } = require('./metrics');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

// Definicion de cada cola: su nombre, su handler y la concurrencia.
const QUEUES = [
  { name: 'delivery', handler: deliveryJob, concurrency: 5 },
  { name: 'notificaciones', handler: notificacionesJob, concurrency: 10 },
  { name: 'webhook-delivery', handler: webhookJob, concurrency: 10 },
  { name: 'sync-zuyu', handler: syncZuyuJob, concurrency: 10 },
  { name: 'simular-carrier', handler: simularCarrierJob, concurrency: 5 },
];

const workers = [];
let queueCollector = null;

// Envuelve el handler de un job para crear un child logger por job (con los
// campos de correlacion) y emitir job.iniciado antes de delegar al handler.
function crearProcessor(handler) {
  return async (job) => {
    const jobLog = logger.child({
      requestId: job.data?.requestId,
      pedidoId: job.data?.pedidoId,
      jobId: job.id,
      queue: job.queueName,
      attemptsMade: job.attemptsMade,
    });
    jobLog.info({ event: 'job.iniciado', jobName: job.name }, `Procesando job ${job.name}`);
    return handler(job, jobLog);
  };
}

// Conecta a MongoDB y arranca los workers de colas y el servidor de metricas
async function start() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  logger.info({ event: 'infra.mongo.conectado' }, 'Conexion a MongoDB establecida');

  // Handlers del ciclo de vida de la conexion a MongoDB (caidas en caliente).
  mongoose.connection.on('disconnected', () => {
    logger.error({ event: 'infra.mongo.desconectado' }, 'Conexion a MongoDB perdida');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info({ event: 'infra.mongo.reconectado' }, 'Conexion a MongoDB restablecida');
  });
  mongoose.connection.on('error', (err) => {
    logger.error({ event: 'infra.mongo.error', err }, 'Error en la conexion a MongoDB');
  });

  for (const { name, handler, concurrency } of QUEUES) {
    workers.push(
      new Worker(name, crearProcessor(handler), {
        connection,
        concurrency,
        autorun: true,
      })
    );
  }

  workers.forEach((worker) => {
    instrumentWorker(worker);

    worker.on('completed', (job) => {
      const durationMs =
        job?.processedOn && job?.finishedOn ? job.finishedOn - job.processedOn : undefined;
      logger.info(
        {
          event: 'job.completado',
          jobId: job?.id,
          queue: job?.queueName,
          pedidoId: job?.data?.pedidoId,
          requestId: job?.data?.requestId,
          attemptsMade: job?.attemptsMade,
          durationMs,
        },
        'Job completado'
      );
    });

    worker.on('failed', (job, err) => {
      const attemptsMade = job?.attemptsMade;
      const attemptsMax = job?.opts?.attempts ?? 1;
      const willRetry = typeof attemptsMade === 'number' && attemptsMade < attemptsMax;
      const baseFields = {
        jobId: job?.id,
        queue: job?.queueName,
        pedidoId: job?.data?.pedidoId,
        requestId: job?.data?.requestId,
        attemptsMade,
        attemptsMax,
        willRetry,
        err,
      };
      logger.error({ event: 'job.fallo', ...baseFields }, 'Job fallo');

      // Si ya agoto sus reintentos, va a la dead-letter (failed set).
      if (typeof attemptsMade === 'number' && attemptsMade >= attemptsMax) {
        logger.error(
          {
            event: 'job.dlq',
            jobId: job?.id,
            queue: job?.queueName,
            pedidoId: job?.data?.pedidoId,
            requestId: job?.data?.requestId,
            attemptsMade,
            attemptsMax,
            failedReason: err?.message,
          },
          'Job agoto sus reintentos y quedo en la dead-letter'
        );
      }
    });

    // Errores de la conexion Redis/BullMQ subyacente del worker.
    worker.on('error', (err) => {
      logger.error({ event: 'infra.redis.error', queue: worker.name, err }, 'Error en el worker');
    });
  });

  startMetricsServer(parseInt(process.env.METRICS_PORT || '3001', 10));

  queueCollector = startQueueDepthCollector(
    QUEUES.map((q) => q.name),
    connection
  );

  logger.info(
    { event: 'infra.boot', workerCount: workers.length, queues: QUEUES.map((q) => q.name) },
    `Worker iniciado con ${workers.length} colas + metrics en :3001`
  );
}

let cerrando = false;

// Cierra ordenadamente colector, workers y conexion a MongoDB y termina el proceso
async function shutdown(signal) {
  if (cerrando) {
    return;
  }
  cerrando = true;
  logger.info({ event: 'infra.shutdown', signal }, `Apagando el worker (senal ${signal})`);
  try {
    if (queueCollector) {
      await queueCollector.stop();
    }
    await Promise.all(workers.map((w) => w.close()));
    await mongoose.disconnect();
    logger.info({ event: 'infra.shutdown', signal }, 'Worker apagado limpiamente');
  } catch (e) {
    logger.error({ event: 'infra.shutdown', err: e }, 'Error durante el apagado del worker');
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Excepciones no controladas: log fatal/error y salida para reinicio limpio.
process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'infra.uncaught', err }, 'Excepcion no capturada en el worker');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ event: 'infra.uncaught', err }, 'Promesa rechazada sin manejar en el worker');
  process.exit(1);
});

start().catch((err) => {
  logger.error({ event: 'infra.boot', err }, 'No se pudo iniciar el worker');
  process.exit(1);
});
