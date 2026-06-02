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
  const nombreCola = worker.name;
  worker.on('active', () => activeJobs.labels(nombreCola).inc());
  worker.on('completed', (job) => {
    activeJobs.labels(nombreCola).dec();
    jobsTotal.labels(nombreCola, 'completed').inc();
    if (job?.processedOn && job?.timestamp) {
      jobDuration.labels(nombreCola).observe((job.processedOn - job.timestamp) / 1000);
    }
  });
  worker.on('failed', () => {
    activeJobs.labels(nombreCola).dec();
    jobsTotal.labels(nombreCola, 'failed').inc();
  });
}

/** Arranca servidor HTTP en :3001 con endpoint /metrics. */
function startMetricsServer(port = 3001) {
  const servidor = http.createServer(async (req, respuesta) => {
    if (req.url === '/metrics') {
      respuesta.setHeader('Content-Type', register.contentType);
      respuesta.end(await register.metrics());
    } else if (req.url === '/healthz') {
      respuesta.end('ok');
    } else {
      respuesta.statusCode = 404;
      respuesta.end();
    }
  });
  servidor.listen(port, '0.0.0.0', () => {
    console.log(`[metrics] HTTP server on :${port}/metrics`);
  });
  return servidor;
}

/**
 * Muestrea la profundidad de cada cola BullMQ y actualiza worker_queue_pending.
 * Exportado para poder testear el sampling sin levantar el colector completo.
 *
 * @param {import('bullmq').Queue[]} queues
 */
async function sampleQueueDepth(colas) {
  for (const q of colas) {
    try {
      const conteos = await q.getJobCounts('wait', 'delayed');
      queuePending.labels(q.name).set((conteos.wait || 0) + (conteos.delayed || 0));
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
function startQueueDepthCollector(queueNames, conexion, intervalMs = 15000) {
  const colas = queueNames.map((nombre) => new Queue(nombre, { connection: conexion }));
  const temporizador = setInterval(() => sampleQueueDepth(colas), intervalMs);
  temporizador.unref(); // las métricas no deben impedir que el proceso termine
  sampleQueueDepth(colas); // primera muestra inmediata
  return {
    async stop() {
      clearInterval(temporizador);
      await Promise.all(colas.map((q) => q.close()));
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
