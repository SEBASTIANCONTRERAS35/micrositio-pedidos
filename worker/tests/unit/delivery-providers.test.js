process.env.IVOY_MOCK = 'true';

const ivoy = require('../../services/delivery/providers/ivoy');
const lalamove = require('../../services/delivery/providers/lalamove');
const uberDirect = require('../../services/delivery/providers/uberDirect');
const { signHmac } = require('../../utils/hmac');

const pedidoDemo = {
  pedidoId: 'PED-2605-0001',
  cliente: { nombre: 'Cliente Demo', telefono: '+525555555555', direccion: 'Calle 1' },
  productos: [{ nombre: 'Paracetamol', cantidad: 2, precioUnitario: 50 }],
};

// Agrupa los tests del provider iVoy.
describe('iVoy provider', () => {
  // Verifica que parseWebhook normaliza un evento de entrega.
  it('parseWebhook normaliza un evento de entrega', () => {
    const r = ivoy.parseWebhook({ orderId: 'iv-99', status: 'delivered' });
    expect(r).toEqual({ deliveryId: 'iv-99', estado: 'delivered', repartidor: null });
  });

  // Verifica que picking_up se mapea a pickup e incluye repartidor.
  it('parseWebhook mapea picking_up → pickup e incluye repartidor', () => {
    const r = ivoy.parseWebhook({
      id: 'iv-100',
      status: 'picking_up',
      driver: { name: 'Repartidor Uno', phone: '5512345678' },
    });
    expect(r.estado).toBe('pickup');
    expect(r.deliveryId).toBe('iv-100');
    expect(r.repartidor).toEqual({ nombre: 'Repartidor Uno', telefono: '5512345678' });
  });

  // Verifica que un status desconocido cae a "pending".
  it('parseWebhook usa "pending" ante un status desconocido', () => {
    expect(ivoy.parseWebhook({ orderId: 'x', status: 'estado_inventado' }).estado).toBe('pending');
  });

  // Verifica que requestDelivery en MOCK devuelve deliveryId con prefijo ivoy-mock.
  it('requestDelivery en MOCK devuelve un deliveryId con prefijo ivoy-mock', async () => {
    const r = await ivoy.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('ivoy-mock-PED-2605-0001');
    expect(r.estado).toBe('pending');
    expect(r.costoEnvio).toBe(49);
  });
});

// Agrupa los tests del provider Lalamove.
describe('Lalamove provider', () => {
  // Verifica que COMPLETED se mapea a delivered.
  it('parseWebhook mapea COMPLETED → delivered', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-1', status: 'COMPLETED' }).estado).toBe(
      'delivered'
    );
  });

  // Verifica que ASSIGNING_DRIVER se mapea a pending.
  it('parseWebhook mapea ASSIGNING_DRIVER → pending', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-2', status: 'ASSIGNING_DRIVER' }).estado).toBe(
      'pending'
    );
  });

  // Verifica que REJECTED se mapea a failed.
  it('parseWebhook mapea REJECTED → failed', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-3', status: 'REJECTED' }).estado).toBe('failed');
  });

  // Verifica que requestDelivery en MOCK devuelve costoEnvio 35.
  it('requestDelivery en MOCK devuelve costoEnvio 35', async () => {
    const r = await lalamove.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('lalamove-mock-PED-2605-0001');
    expect(r.costoEnvio).toBe(35);
  });
});

// Agrupa los tests del provider Uber Direct.
describe('Uber Direct provider', () => {
  // Verifica que parseWebhook usa delivery_id cuando está presente.
  it('parseWebhook usa delivery_id cuando está presente', () => {
    const r = uberDirect.parseWebhook({ delivery_id: 'ub-1', status: 'delivered' });
    expect(r.deliveryId).toBe('ub-1');
    expect(r.estado).toBe('delivered');
  });

  // Verifica que parseWebhook cae a id cuando no hay delivery_id.
  it('parseWebhook cae a id cuando no hay delivery_id', () => {
    expect(uberDirect.parseWebhook({ id: 'ub-2', status: 'dropoff' }).deliveryId).toBe('ub-2');
  });

  // Verifica que returned se mapea a failed.
  it('parseWebhook mapea returned → failed', () => {
    expect(uberDirect.parseWebhook({ id: 'ub-3', status: 'returned' }).estado).toBe('failed');
  });

  // Verifica que requestDelivery en MOCK devuelve deliveryId con prefijo uber-mock.
  it('requestDelivery en MOCK devuelve un deliveryId con prefijo uber-mock', async () => {
    const r = await uberDirect.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('uber-mock-PED-2605-0001');
  });
});

// Agrupa los tests de getStatus y cancelDelivery en modo MOCK.
describe('getStatus / cancelDelivery — modo MOCK', () => {
  // Verifica que iVoy getStatus devuelve un estado mock.
  it('iVoy getStatus devuelve un estado mock', async () => {
    expect(await ivoy.getStatus('iv-1')).toEqual({ estado: 'pickup' });
  });

  // Verifica que iVoy cancelDelivery en MOCK devuelve ok.
  it('iVoy cancelDelivery en MOCK devuelve ok', async () => {
    expect(await ivoy.cancelDelivery('iv-1')).toEqual({ ok: true });
  });

  // Verifica que Lalamove getStatus devuelve un estado mock.
  it('Lalamove getStatus devuelve un estado mock', async () => {
    expect(await lalamove.getStatus('la-1')).toEqual({ estado: 'pickup' });
  });

  // Verifica que Lalamove cancelDelivery en MOCK devuelve ok.
  it('Lalamove cancelDelivery en MOCK devuelve ok', async () => {
    expect(await lalamove.cancelDelivery('la-1')).toEqual({ ok: true });
  });

  // Verifica que Uber Direct getStatus devuelve un estado mock.
  it('Uber Direct getStatus devuelve un estado mock', async () => {
    expect(await uberDirect.getStatus('ub-1')).toEqual({ estado: 'pickup' });
  });

  // Verifica que Uber Direct cancelDelivery en MOCK devuelve ok.
  it('Uber Direct cancelDelivery en MOCK devuelve ok', async () => {
    expect(await uberDirect.cancelDelivery('ub-1')).toEqual({ ok: true });
  });
});

// Agrupa los tests de validación de firma HMAC de webhooks.
describe('verifyWebhook — validación de firma HMAC', () => {
  // Verifica que iVoy acepta una firma válida con timestamp vigente.
  it('iVoy acepta firma válida con timestamp vigente', () => {
    process.env.WEBHOOK_SECRET_IVOY = 'secret-ivoy-para-test';
    const body = '{"orderId":"iv-1","status":"delivered"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      'x-ivoy-signature': signHmac(body, 'secret-ivoy-para-test'),
      'x-ivoy-timestamp': ts,
    };
    expect(ivoy.verifyWebhook(body, headers)).toBe(true);
    delete process.env.WEBHOOK_SECRET_IVOY;
  });

  // Verifica que iVoy rechaza una firma inválida.
  it('iVoy rechaza una firma inválida', () => {
    process.env.WEBHOOK_SECRET_IVOY = 'secret-ivoy-para-test';
    const body = '{"orderId":"iv-1"}';
    const headers = {
      'x-ivoy-signature': signHmac(body, 'secret-equivocado'),
      'x-ivoy-timestamp': String(Math.floor(Date.now() / 1000)),
    };
    expect(ivoy.verifyWebhook(body, headers)).toBe(false);
    delete process.env.WEBHOOK_SECRET_IVOY;
  });

  // Verifica que iVoy rechaza un timestamp viejo (anti-replay).
  it('iVoy rechaza un timestamp viejo (anti-replay)', () => {
    process.env.WEBHOOK_SECRET_IVOY = 'secret-ivoy-para-test';
    const body = '{"orderId":"iv-1"}';
    const headers = {
      'x-ivoy-signature': signHmac(body, 'secret-ivoy-para-test'),
      'x-ivoy-timestamp': String(Math.floor(Date.now() / 1000) - 600),
    };
    expect(ivoy.verifyWebhook(body, headers)).toBe(false);
    delete process.env.WEBHOOK_SECRET_IVOY;
  });

  // Verifica que Lalamove acepta firma válida sobre "timestamp.body".
  it('Lalamove acepta firma válida sobre "timestamp.body"', () => {
    process.env.WEBHOOK_SECRET_LALAMOVE = 'secret-lalamove-test';
    const body = '{"orderId":"la-1"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      'x-lalamove-signature': signHmac(`${ts}.${body}`, 'secret-lalamove-test'),
      'x-lalamove-timestamp': ts,
    };
    expect(lalamove.verifyWebhook(body, headers)).toBe(true);
    delete process.env.WEBHOOK_SECRET_LALAMOVE;
  });
});
