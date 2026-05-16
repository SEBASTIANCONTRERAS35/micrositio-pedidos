/**
 * Prometheus metrics — exposes /metrics for kube-prometheus-stack scraping.
 *
 * Métricas:
 *  - http_requests_total{method,route,status}      counter
 *  - http_request_duration_seconds{method,route}   histogram (buckets default)
 *  - pedidos_total{estado}                         counter (custom, opcional)
 *  - default Node.js metrics (memory, GC, event loop)
 */
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

// Middleware Express — mide cada request
function middleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path || req.path.replace(/\/[a-f0-9-]{8,}/g, '/:id') || 'unknown';
    const status = String(res.statusCode);
    const dur = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequests.labels(req.method, route, status).inc();
    httpDuration.labels(req.method, route, status).observe(dur);
  });
  next();
}

// Endpoint /metrics
async function handler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { middleware, handler, register, pedidosTotal };
