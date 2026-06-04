process.env.IVOY_MOCK = 'true';

const delivery = require('../../services/delivery');

const pedidoDemo = {
  pedidoId: 'PED-2605-0042',
  cliente: { nombre: 'Cliente', telefono: '+525500000000', direccion: 'Calle 2' },
  productos: [{ nombre: 'Ibuprofeno', cantidad: 1, precioUnitario: 75 }],
};

describe('delivery — enrutamiento de parseWebhook', () => {
  it('enruta a iVoy', () => {
    const r = delivery.parseWebhook('ivoy', { orderId: 'iv-1', status: 'delivered' });
    expect(r).toEqual({ deliveryId: 'iv-1', estado: 'delivered', repartidor: null });
  });

  it('enruta a Lalamove', () => {
    expect(delivery.parseWebhook('lalamove', { orderId: 'la-1', status: 'COMPLETED' }).estado).toBe(
      'delivered'
    );
  });

  it('enruta a Uber Direct', () => {
    expect(
      delivery.parseWebhook('uberDirect', { delivery_id: 'ub-1', status: 'delivered' }).deliveryId
    ).toBe('ub-1');
  });
});

describe('delivery — requestDelivery', () => {
  it('solicita repartidor por el provider indicado (mock)', async () => {
    const r = await delivery.requestDelivery('lalamove', pedidoDemo);
    expect(r.deliveryId).toBe('lalamove-mock-PED-2605-0042');
  });

  it('getStatus y cancelDelivery delegan al provider (mock)', async () => {
    expect((await delivery.getStatus('lalamove', 'la-1')).estado).toBe('pickup');
    expect((await delivery.cancelDelivery('lalamove', 'la-1')).ok).toBe(true);
  });
});

describe('delivery — provider desconocido', () => {
  it('requestDelivery rechaza con error explícito', async () => {
    await expect(delivery.requestDelivery('rappi', pedidoDemo)).rejects.toThrow(
      /Provider de delivery desconocido/
    );
  });

  it('parseWebhook lanza error explícito (no devuelve undefined)', () => {
    expect(() => delivery.parseWebhook('didi', {})).toThrow(/Provider de delivery desconocido/);
  });
});
