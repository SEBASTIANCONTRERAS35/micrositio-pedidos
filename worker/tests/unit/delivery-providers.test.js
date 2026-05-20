/**
 * Tests de los 3 providers de delivery (iVoy, Lalamove, Uber Direct).
 * Cubren el contrato común que la capa multi-carrier espera de cada uno:
 *   - parseWebhook: normaliza el body del carrier a { deliveryId, estado, repartidor }
 *   - requestDelivery (modo MOCK): forma de la respuesta
 *   - verifyWebhook: validación de firma HMAC
 */

// IVOY arranca en modo real salvo IVOY_MOCK=true → se fija ANTES del require.
// Lalamove y Uber Direct ya son mock por defecto.
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

describe('iVoy provider', () => {
  it('parseWebhook normaliza un evento de entrega', () => {
    const r = ivoy.parseWebhook({ orderId: 'iv-99', status: 'delivered' });
    expect(r).toEqual({ deliveryId: 'iv-99', estado: 'delivered', repartidor: null });
  });

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

  it('parseWebhook usa "pending" ante un status desconocido', () => {
    expect(ivoy.parseWebhook({ orderId: 'x', status: 'estado_inventado' }).estado).toBe('pending');
  });

  it('requestDelivery en MOCK devuelve un deliveryId con prefijo ivoy-mock', async () => {
    const r = await ivoy.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('ivoy-mock-PED-2605-0001');
    expect(r.estado).toBe('pending');
    expect(r.costoEnvio).toBe(49);
  });
});

describe('Lalamove provider', () => {
  it('parseWebhook mapea COMPLETED → delivered', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-1', status: 'COMPLETED' }).estado).toBe(
      'delivered'
    );
  });

  it('parseWebhook mapea ASSIGNING_DRIVER → pending', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-2', status: 'ASSIGNING_DRIVER' }).estado).toBe(
      'pending'
    );
  });

  it('parseWebhook mapea REJECTED → failed', () => {
    expect(lalamove.parseWebhook({ orderId: 'la-3', status: 'REJECTED' }).estado).toBe('failed');
  });

  it('requestDelivery en MOCK devuelve costoEnvio 35', async () => {
    const r = await lalamove.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('lalamove-mock-PED-2605-0001');
    expect(r.costoEnvio).toBe(35);
  });
});

describe('Uber Direct provider', () => {
  it('parseWebhook usa delivery_id cuando está presente', () => {
    const r = uberDirect.parseWebhook({ delivery_id: 'ub-1', status: 'delivered' });
    expect(r.deliveryId).toBe('ub-1');
    expect(r.estado).toBe('delivered');
  });

  it('parseWebhook cae a id cuando no hay delivery_id', () => {
    expect(uberDirect.parseWebhook({ id: 'ub-2', status: 'dropoff' }).deliveryId).toBe('ub-2');
  });

  it('parseWebhook mapea returned → failed', () => {
    expect(uberDirect.parseWebhook({ id: 'ub-3', status: 'returned' }).estado).toBe('failed');
  });

  it('requestDelivery en MOCK devuelve un deliveryId con prefijo uber-mock', async () => {
    const r = await uberDirect.requestDelivery(pedidoDemo);
    expect(r.deliveryId).toBe('uber-mock-PED-2605-0001');
  });
});

describe('verifyWebhook — validación de firma HMAC', () => {
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
