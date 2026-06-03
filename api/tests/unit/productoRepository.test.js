/**
 * Tests del repositorio de Productos — validación de ObjectId.
 *
 * Regresión (bug del 500 al confirmar pedido): si el carrito traía un id que NO
 * es ObjectId de Mongo (ej. un SKU de ZUYU como 'AVI-250' tras cambiar de modo),
 * `new ObjectId(id)` lanzaba BSONError → 500. Ahora se descarta y el pedido
 * reporta "producto no encontrado" (404 limpio).
 *
 * describe/it/expect globales (vitest.config.js → globals: true).
 */
const {
  idsObjectIdValidos,
  buscarActivosPorIds,
} = require('../../infra/repositories/productoRepository');

const ID_VALIDO = '507f1f77bcf86cd799439011'; // 24 hex

describe('idsObjectIdValidos', () => {
  it('descarta ids que no son ObjectId válidos (SKU de ZUYU, basura)', () => {
    expect(idsObjectIdValidos(['AVI-250'])).toEqual([]);
    expect(idsObjectIdValidos(['no-es-id', '123', ''])).toEqual([]);
  });

  it('NO lanza BSONError con ids inválidos (la regresión del 500)', () => {
    expect(() => idsObjectIdValidos(['AVI-250', 'x', ''])).not.toThrow();
  });

  it('conserva los ids válidos de 24 hex', () => {
    const r = idsObjectIdValidos([ID_VALIDO]);
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe(ID_VALIDO);
  });

  it('en una lista mixta deja solo los válidos', () => {
    const r = idsObjectIdValidos(['AVI-250', ID_VALIDO, 'otro-sku']);
    expect(r).toHaveLength(1);
    expect(r[0].toString()).toBe(ID_VALIDO);
  });

  it('maneja null / undefined / [] sin tronar', () => {
    expect(idsObjectIdValidos(null)).toEqual([]);
    expect(idsObjectIdValidos(undefined)).toEqual([]);
    expect(idsObjectIdValidos([])).toEqual([]);
  });
});

describe('buscarActivosPorIds', () => {
  it('con TODOS los ids inválidos devuelve [] sin tocar la BD (no 500)', async () => {
    await expect(buscarActivosPorIds(['AVI-250', 'sku-2'], 'cualquier-negocio')).resolves.toEqual(
      []
    );
  });
});
