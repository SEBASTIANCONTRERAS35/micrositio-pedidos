const {
  idsObjectIdValidos,
  buscarActivosPorIds,
} = require('../../infra/repositories/productoRepository');

const ID_VALIDO = '507f1f77bcf86cd799439011';

// Suite de pruebas de idsObjectIdValidos.
describe('idsObjectIdValidos', () => {
  // Verifica que se descarten ids que no son ObjectId válidos.
  it('descarta ids que no son ObjectId válidos (SKU de ZUYU, basura)', () => {
    expect(idsObjectIdValidos(['AVI-250'])).toEqual([]);
    expect(idsObjectIdValidos(['no-es-id', '123', ''])).toEqual([]);
  });

  // Verifica que no lance BSONError con ids inválidos.
  it('NO lanza BSONError con ids inválidos (la regresión del 500)', () => {
    expect(() => idsObjectIdValidos(['AVI-250', 'x', ''])).not.toThrow();
  });

  // Verifica que se conserven los ids válidos de 24 hex.
  it('conserva los ids válidos de 24 hex', () => {
    const r = idsObjectIdValidos([ID_VALIDO]);
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe(ID_VALIDO);
  });

  // Verifica que en una lista mixta solo queden los válidos.
  it('en una lista mixta deja solo los válidos', () => {
    const r = idsObjectIdValidos(['AVI-250', ID_VALIDO, 'otro-sku']);
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe(ID_VALIDO);
  });

  // Verifica que maneje null, undefined y [] sin tronar.
  it('maneja null / undefined / [] sin tronar', () => {
    expect(idsObjectIdValidos(null)).toEqual([]);
    expect(idsObjectIdValidos(undefined)).toEqual([]);
    expect(idsObjectIdValidos([])).toEqual([]);
  });
});

// Suite de pruebas de buscarActivosPorIds.
describe('buscarActivosPorIds', () => {
  // Verifica que con todos los ids inválidos devuelva [] sin tocar la BD.
  it('con TODOS los ids inválidos devuelve [] sin tocar la BD (no 500)', async () => {
    await expect(buscarActivosPorIds(['AVI-250', 'sku-2'], 'cualquier-negocio')).resolves.toEqual(
      []
    );
  });
});
