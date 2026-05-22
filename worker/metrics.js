/**
 * Prometheus metrics para el worker BullMQ.
 * Expone /metrics en :3001 — scrape por kube-prometheus-stack vía ServiceMonitor.
 *
 * Métricas custom:
 *  - worker_jobs_total{queue,status}       counter (status=completed|failed)
 *  - worker_job_duration_seconds{queue}    histogram (procesamiento)
 *  - worker_active_jobs{queue}             gauge (jobs en flight)
 *  - + default Node.js metrics
 */
'use strict';

const http = require('http');
const promClient = require('prom-client');
const { Queue } = require('bullmq');

const register = new promClient.Registry();
register.setDefaultLabels({ app: 'worker', service: 'micrositio-worker' });
promClient.collectDefaultMetrics({ register });

const jobsTotal = new promClient.Counter({
  name: 'worker_jobs_total',
  help: 'Total de jobs procesados',
  labelNames: ['queue', 'status'],
  registers: [register],
});

const jobDuration = new promClient.Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Duración del procesamiento de un job',
  labelNames: ['queue'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
  registers: [register],
});

const activeJobs = new promClient.Gauge({
  name: 'worker_active_jobs',
  help: 'Jobs activos por cola',
  labelNames: ['queue'],
  registers: [register],
});

// Profundidad de cola: jobs esperando ser procesados. Lo consume la alerta
// QueueBacklogHigh y refleja lo mismo que ve KEDA para escalar.
const queuePending = new promClient.Gauge({
  name: 'worker_queue_pending',
  help: 'Jobs pendientes (waiting + delayed) por cola BullMQ',
  labelNames: ['queue'],
  registers: [register],
});

/** Conecta los eventos de BullMQ Worker a las métricas. */
function instrumentWorker(worker) {
  const queueName = worker.name;
  worker.on('active', () => activeJobs.labels(queueName).inc());
  worker.on('completed', (job) => {
    activeJobs.labels(queueName).dec();
    jobsTotal.labels(queueName, 'completed').inc();
    if (job?.processedOn && job?.timestamp) {
      jobDuration.labels(queueName).observe((job.processedOn - job.timestamp) / 1000);
    }
  });
  worker.on('failed', () => {
    activeJobs.labels(queueName).dec();
    jobsTotal.labels(queueName, 'failed').inc();
  });
}

/** Arranca servidor HTTP en :3001 con endpoint /metrics. */
function startMetricsServer(port = 3001) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else if (req.url === '/healthz') {
      res.end('ok');
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[metrics] HTTP server on :${port}/metrics`);
  });
  return server;
}

/**
 * Muestrea la profundidad de cada cola BullMQ y actualiza worker_queue_pending.
 * Exportado para poder testear el sampling sin levantar el colector completo.
 *
 * @param {import('bullmq').Queue[]} queues
 */
async function sampleQueueDepth(queues) {
  for (const q of queues) {
    try {
      const counts = await q.getJobCounts('wait', 'delayed');
      queuePending.labels(q.name).set((counts.wait || 0) + (counts.delayed || 0));
    } catch {
      // Redis temporalmente inaccesible — las métricas nunca deben tumbar
      // el worker. La siguiente muestra reintenta.
    }
  }
}

/**
 * Arranca un colector periódico de profundidad de colas. Crea un Queue
 * read-only por nombre y actualiza el gauge cada `intervalMs`.
 *
 * @returns {{ stop: () => Promise<void> }}
 */
function startQueueDepthCollector(queueNames, connection, intervalMs = 15000) {
  const queues = queueNames.map((name) => new Queue(name, { connection }));
  const timer = setInterval(() => sampleQueueDepth(queues), intervalMs);
  timer.unref(); // las métricas no deben impedir que el proceso termine
  sampleQueueDepth(queues); // primera muestra inmediata
  return {
    async stop() {
      clearInterval(timer);
      await Promise.all(queues.map((q) => q.close()));
    },
  };
}

module.exports = {
  register,
  instrumentWorker,
  startMetricsServer,
  startQueueDepthCollector,
  sampleQueueDepth,
};
