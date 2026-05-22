/**
 * Tests del colector de profundidad de cola (worker/metrics.js).
 * sampleQueueDepth alimenta el gauge worker_queue_pending que consume la
 * alerta QueueBacklogHigh. describe/it/expect son globales (vitest config).
 */
const { register, sampleQueueDepth } = require('../../metrics');

/** Queue falso: getJobCounts devuelve los conteos que le pasemos. */
function fakeQueue(name, counts) {
  return { name, getJobCounts: async () => counts };
}

describe('sampleQueueDepth — gauge worker_queue_pending', () => {
  it('expone wait + delayed como worker_queue_pending', async () => {
    await sampleQueueDepth([fakeQueue('notificaciones', { wait: 70, delayed: 35 })]);
    const metrics = await register.metrics();
    expect(metrics).toMatch(/worker_queue_pending\{[^}]*queue="notificaciones"[^}]*\}\s+105/);
  });

  it('trata conteos ausentes como 0', async () => {
    await sampleQueueDepth([fakeQueue('delivery', {})]);
    const metrics = await register.metrics();
    expect(metrics).toMatch(/worker_queue_pending\{[^}]*queue="delivery"[^}]*\}\s+0/);
  });

  it('no lanza si getJobCounts falla (Redis caido) — las métricas nunca tumban el worker', async () => {
    const badQueue = {
      name: 'sync-zuyu',
      getJobCounts: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    await expect(sampleQueueDepth([badQueue])).resolves.not.toThrow();
  });
});
