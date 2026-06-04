const {
  urlTrackingSegura,
  perteneceANegocio,
  proyectarEstadoPublico,
} = require('../../domain/trackingPublico');

// Agrupa las pruebas del saneamiento de URL de tracking (anti-XSS).
describe('urlTrackingSegura — anti-XSS por protocolo', () => {
  // Acepta URLs http y https.
  it('acepta http y https', () => {
    expect(urlTrackingSegura('https://track.ivoy.mx/abc')).toBe('https://track.ivoy.mx/abc');
    expect(urlTrackingSegura('http://x.test/1')).toBe('http://x.test/1');
  });

  // Rechaza protocolos peligrosos devolviendo null.
  it('rechaza javascript:, data: y vacios', () => {
    expect(urlTrackingSegura('javascript:alert(1)')).toBeNull();
    expect(urlTrackingSegura('data:text/html,<script>')).toBeNull();
    expect(urlTrackingSegura('')).toBeNull();
    expect(urlTrackingSegura(undefined)).toBeNull();
    expect(urlTrackingSegura(null)).toBeNull();
  });
});

// Agrupa las pruebas de pertenencia pedido-negocio (anti-IDOR).
describe('perteneceANegocio — anti-IDOR cross-tenant', () => {
  // Verdadero solo cuando el negocioId del pedido coincide con el del negocio.
  it('true si coinciden los ObjectId', () => {
    const id = { toString: () => 'abc123' };
    expect(perteneceANegocio({ negocioId: id }, { _id: id })).toBe(true);
  });

  // Falso si el pedido pertenece a otro negocio.
  it('false si pertenece a otro negocio', () => {
    expect(
      perteneceANegocio({ negocioId: { toString: () => 'a' } }, { _id: { toString: () => 'b' } })
    ).toBe(false);
  });

  // Falso ante datos faltantes (defensivo).
  it('false ante datos faltantes', () => {
    expect(perteneceANegocio(null, { _id: 'a' })).toBe(false);
    expect(perteneceANegocio({ negocioId: 'a' }, null)).toBe(false);
    expect(perteneceANegocio({}, {})).toBe(false);
  });
});

// Agrupa las pruebas de la proyeccion publica del estado del pedido.
describe('proyectarEstadoPublico — minimizacion de PII', () => {
  // No incluye el telefono del repartidor (PII de tercero), solo el nombre.
  it('omite el telefono del repartidor y conserva el nombre', () => {
    const out = proyectarEstadoPublico({
      estado: 'en_camino',
      historial: [],
      delivery: {
        proveedor: 'ivoy',
        estado: 'pickup',
        trackingUrl: 'https://t.test/1',
        repartidor: { nombre: 'Carlos', telefono: '+525500000000', foto: 'x.jpg' },
      },
    });
    expect(out.delivery.repartidor).toEqual({ nombre: 'Carlos' });
    expect(out.delivery.repartidor.telefono).toBeUndefined();
    expect(out.delivery.trackingUrl).toBe('https://t.test/1');
  });

  // Sanea el trackingUrl peligroso dentro de la proyeccion.
  it('sanea trackingUrl peligroso a null', () => {
    const out = proyectarEstadoPublico({
      estado: 'en_camino',
      delivery: { trackingUrl: 'javascript:alert(1)', repartidor: { nombre: 'A' } },
    });
    expect(out.delivery.trackingUrl).toBeNull();
  });

  // No expone datos del cliente y mapea el historial a campos seguros.
  it('expone solo estado/historial/delivery y mapea historial', () => {
    const out = proyectarEstadoPublico({
      estado: 'confirmado',
      cliente: { nombre: 'Secreto', telefono: '+520000000000', direccion: 'X' },
      historial: [{ estado: 'pendiente', timestamp: 123, nota: 'creado', extra: 'no' }],
      delivery: null,
    });
    expect(Object.keys(out).sort()).toEqual(['delivery', 'estado', 'historial']);
    expect(out.cliente).toBeUndefined();
    expect(out.delivery).toBeNull();
    expect(out.historial[0]).toEqual({ estado: 'pendiente', timestamp: 123, nota: 'creado' });
  });
});
