const {
  construirSnapshot,
  calcularTotales,
  COSTO_ENVIO_BASE,
} = require('../../domain/pedidoCalculos');

const productosDb = [
  { _id: 'prod-a', nombre: 'Cafe', precio: 50, stock: 10 },
  { _id: 'prod-b', nombre: 'Pan', precio: 30, stock: 2 },
];

describe('construirSnapshot', () => {
  it('happy path: arma el snapshot, sin faltantes ni no-encontrados', () => {
    const { snapshot, faltantes, noEncontrados } = construirSnapshot(
      [
        { id: 'prod-a', cantidad: 3 },
        { id: 'prod-b', cantidad: 1 },
      ],
      productosDb
    );
    expect(faltantes).toEqual([]);
    expect(noEncontrados).toEqual([]);
    expect(snapshot).toEqual([
      { id: 'prod-a', nombre: 'Cafe', precioUnitario: 50, cantidad: 3 },
      { id: 'prod-b', nombre: 'Pan', precioUnitario: 30, cantidad: 1 },
    ]);
  });

  it('detecta faltante cuando la cantidad pedida supera el stock', () => {
    const { faltantes } = construirSnapshot(
      [{ id: 'prod-b', cantidad: 5 }],
      productosDb
    );
    expect(faltantes).toEqual([{ id: 'prod-b', pedido: 5, disponible: 2 }]);
  });

  it('detecta productos que no existen en la BD', () => {
    const { snapshot, noEncontrados } = construirSnapshot(
      [
        { id: 'prod-a', cantidad: 1 },
        { id: 'prod-fantasma', cantidad: 1 },
      ],
      productosDb
    );
    expect(noEncontrados).toEqual(['prod-fantasma']);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe('prod-a');
  });

  it('no lanza — solo reporta (la decision la toma el caller)', () => {
    expect(() =>
      construirSnapshot([{ id: 'prod-fantasma', cantidad: 99 }], productosDb)
    ).not.toThrow();
  });
});

describe('calcularTotales', () => {
  it('subtotal = suma de precioUnitario * cantidad; total suma el envio', () => {
    const snapshot = [
      { precioUnitario: 50, cantidad: 3 },
      { precioUnitario: 30, cantidad: 2 },
    ];
    const { subtotal, costoEnvio, total } = calcularTotales(snapshot);
    expect(subtotal).toBe(210);
    expect(costoEnvio).toBe(COSTO_ENVIO_BASE);
    expect(total).toBe(210 + COSTO_ENVIO_BASE);
  });

  it('acepta un costoEnvio explicito', () => {
    const { total } = calcularTotales([{ precioUnitario: 100, cantidad: 1 }], 0);
    expect(total).toBe(100);
  });

  it('snapshot vacio -> subtotal 0', () => {
    expect(calcularTotales([]).subtotal).toBe(0);
  });
});
