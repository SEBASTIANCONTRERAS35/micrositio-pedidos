/**
 * Test critico: 10 pedidos concurrentes del ultimo producto.
 * Solo 1 debe tener exito — valida la invariante de stock atomico que
 * F2-deep movio a productoRepository.descontarStock (filtro $gte condicional).
 *
 * Usa MongoMemoryReplSet (mongodb-memory-server): Replica Set real en memoria,
 * necesario para transacciones multi-doc.
 *
 * describe/it/expect/beforeAll/afterAll globales (vitest.integration.config.js
 * → globals: true). NO usar require('vitest') — Vitest 2.x lo rechaza.
 */
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Producto = require('../../models/producto');
const Negocio = require('../../models/negocio');
const productoRepo = require('../../infra/repositories/productoRepository');

let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

describe('Atomicidad de stock bajo concurrencia', () => {
  it('10 pedidos concurrentes del ultimo producto: solo 1 success', async () => {
    // Setup: negocio + producto con stock=1
    const negocio = await Negocio.create({ slug: 'test-shop', nombre: 'Test Shop' });
    const producto = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Producto unico',
      precio: 100,
      stock: 1,
    });

    // 10 transacciones concurrentes — cada una usa el repo REAL (no se
    // reimplementa la logica): asi el test cubre productoRepository.descontarStock.
    const intentos = Array.from({ length: 10 }).map(async () => {
      const session = await mongoose.startSession();
      try {
        let success = false;
        await session.withTransaction(async () => {
          success = await productoRepo.descontarStock([{ id: producto._id, cantidad: 1 }], session);
          if (!success) {
            throw new Error('Stock insuficiente');
          }
        });
        return success;
      } catch {
        return false;
      } finally {
        session.endSession();
      }
    });

    const results = await Promise.all(intentos);
    const exitos = results.filter((r) => r === true).length;

    expect(exitos).toBe(1); // SOLO 1 transaccion exitosa
    const productoFinal = await Producto.findById(producto._id);
    expect(productoFinal.stock).toBe(0); // Stock final correcto
  }, 30000);
});
