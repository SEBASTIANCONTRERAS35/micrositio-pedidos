/**
 * Tests de integracion de los repositorios refactorizados (F2-deep):
 *   - productoRepository: descontarStock (atomico/condicional), devolverStock,
 *     buscarActivosPorIds.
 *   - pedidoRepository: crear, crearEnSession, buscarPorId (tenant isolation).
 *
 * Usa MongoMemoryReplSet (mongodb-memory-server): un Replica Set real en
 * memoria — necesario para las transacciones multi-doc, sin la fragilidad
 * del port-mapping de testcontainers. Estos repos NO dependen de Redis.
 *
 * describe/it/expect/beforeAll/afterAll globales (vitest.integration.config.js).
 */
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Producto = require('../../models/producto');
const Negocio = require('../../models/negocio');
const productoRepo = require('../../infra/repositories/productoRepository');
const pedidoRepo = require('../../infra/repositories/pedidoRepository');

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

describe('productoRepository.descontarStock — atomicidad', () => {
  it('descuenta cuando hay stock suficiente y devuelve true', async () => {
    const negocio = await Negocio.create({ slug: 'shop-1', nombre: 'Shop 1' });
    const prod = await Producto.create({
      negocioId: negocio._id,
      nombre: 'X',
      precio: 100,
      stock: 10,
    });

    const session = await mongoose.startSession();
    let ok;
    try {
      await session.withTransaction(async () => {
        ok = await productoRepo.descontarStock([{ id: prod._id, cantidad: 3 }], session);
      });
    } finally {
      session.endSession();
    }
    expect(ok).toBe(true);
    expect((await Producto.findById(prod._id)).stock).toBe(7);
  });

  it('NO descuenta si falta stock y devuelve false (filtro $gte)', async () => {
    const negocio = await Negocio.create({ slug: 'shop-2', nombre: 'Shop 2' });
    const prod = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Y',
      precio: 100,
      stock: 2,
    });

    const session = await mongoose.startSession();
    let ok;
    try {
      await session.withTransaction(async () => {
        ok = await productoRepo.descontarStock([{ id: prod._id, cantidad: 5 }], session);
      });
    } finally {
      session.endSession();
    }
    expect(ok).toBe(false);
    expect((await Producto.findById(prod._id)).stock).toBe(2); // intacto
  });

  it('10 descuentos concurrentes del ultimo producto: solo 1 gana', async () => {
    const negocio = await Negocio.create({ slug: 'shop-3', nombre: 'Shop 3' });
    const prod = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Unico',
      precio: 100,
      stock: 1,
    });

    const intentos = Array.from({ length: 10 }).map(async () => {
      const session = await mongoose.startSession();
      try {
        let ganado = false;
        await session.withTransaction(async () => {
          ganado = await productoRepo.descontarStock([{ id: prod._id, cantidad: 1 }], session);
          if (!ganado) {
            throw new Error('sin stock');
          }
        });
        return ganado;
      } catch {
        return false;
      } finally {
        session.endSession();
      }
    });

    const exitos = (await Promise.all(intentos)).filter(Boolean).length;
    expect(exitos).toBe(1);
    expect((await Producto.findById(prod._id)).stock).toBe(0);
  }, 30000);
});

describe('productoRepository.devolverStock', () => {
  it('incrementa el stock de vuelta', async () => {
    const negocio = await Negocio.create({ slug: 'shop-4', nombre: 'Shop 4' });
    const prod = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Z',
      precio: 100,
      stock: 5,
    });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await productoRepo.devolverStock([{ id: prod._id, cantidad: 3 }], session);
      });
    } finally {
      session.endSession();
    }
    expect((await Producto.findById(prod._id)).stock).toBe(8);
  });
});

describe('productoRepository.buscarActivosPorIds', () => {
  it('solo trae productos activos del negocio indicado', async () => {
    const negA = await Negocio.create({ slug: 'shop-a', nombre: 'A' });
    const negB = await Negocio.create({ slug: 'shop-b', nombre: 'B' });
    const p1 = await Producto.create({ negocioId: negA._id, nombre: 'P1', precio: 10, stock: 1 });
    const p2 = await Producto.create({
      negocioId: negA._id,
      nombre: 'P2',
      precio: 10,
      stock: 1,
      activo: false,
    });
    const p3 = await Producto.create({ negocioId: negB._id, nombre: 'P3', precio: 10, stock: 1 });

    const encontrados = await productoRepo.buscarActivosPorIds(
      [p1._id.toString(), p2._id.toString(), p3._id.toString()],
      negA._id
    );
    // p2 inactivo y p3 de otro negocio quedan fuera
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]._id.toString()).toBe(p1._id.toString());
  });
});

describe('pedidoRepository — CRUD + tenant isolation', () => {
  it('crear + buscarPorId scoped al negocio', async () => {
    const negocio = await Negocio.create({ slug: 'shop-5', nombre: 'Shop 5' });
    const datos = {
      pedidoId: 'PED-TEST-0001',
      negocioId: negocio._id,
      cliente: {
        nombre: 'Ana',
        telefono: '+5215500000000',
        email: 'a@a.com',
        direccion: 'Calle Falsa 123',
      },
      productos: [
        { id: new mongoose.Types.ObjectId(), nombre: 'X', precioUnitario: 10, cantidad: 1 },
      ],
      subtotal: 10,
      total: 59,
    };
    await pedidoRepo.crear(datos);

    const hallado = await pedidoRepo.buscarPorId('PED-TEST-0001', negocio._id);
    expect(hallado).not.toBeNull();
    expect(hallado.pedidoId).toBe('PED-TEST-0001');
  });

  it('buscarPorId NO devuelve el pedido de otro negocio (anti-IDOR)', async () => {
    const negA = await Negocio.create({ slug: 'shop-6a', nombre: '6A' });
    const negB = await Negocio.create({ slug: 'shop-6b', nombre: '6B' });
    await pedidoRepo.crear({
      pedidoId: 'PED-TEST-0002',
      negocioId: negA._id,
      cliente: {
        nombre: 'Ana',
        telefono: '+5215500000000',
        email: 'a@a.com',
        direccion: 'Calle Falsa 123',
      },
      productos: [
        { id: new mongoose.Types.ObjectId(), nombre: 'X', precioUnitario: 10, cantidad: 1 },
      ],
      subtotal: 10,
      total: 59,
    });

    // El negocio B NO debe poder ver el pedido del negocio A
    const cruzado = await pedidoRepo.buscarPorId('PED-TEST-0002', negB._id);
    expect(cruzado).toBeNull();
  });
});
