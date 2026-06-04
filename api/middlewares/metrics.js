'use strict';

const promClient = require('prom-client');

const register = new promClient.Registry();
register.setDefaultLabels({ app: 'api', service: 'micrositio-api' });
promClient.collectDefaultMetrics({ register });

const httpRequests = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const pedidosTotal = new promClient.Counter({
  name: 'pedidos_total',
  help: 'Total de pedidos por estado',
  labelNames: ['estado'],
  registers: [register],
});

// Middleware Express que mide la duracion y cuenta cada request HTTP.
function middleware(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path || req.path.replace(/\/[a-f0-9-]{8,}/g, '/:id') || 'unknown';
    const status = String(res.statusCode);
    const duracion = Number(process.hrtime.bigint() - inicio) / 1e9;
    httpRequests.labels(req.method, route, status).inc();
    httpDuration.labels(req.method, route, status).observe(duracion);
  });
  next();
}

// Handler del endpoint /metrics que expone las metricas en formato Prometheus.
async function handler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { middleware, handler, register, pedidosTotal };
