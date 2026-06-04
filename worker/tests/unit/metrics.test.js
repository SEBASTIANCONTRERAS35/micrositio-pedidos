const { register, sampleQueueDepth } = require('../../metrics');

// Crea un queue falso cuyo getJobCounts devuelve los conteos dados.
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
      // Simula fallo de Redis lanzando un error de conexion.
      getJobCounts: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    await expect(sampleQueueDepth([badQueue])).resolves.not.toThrow();
  });
});
