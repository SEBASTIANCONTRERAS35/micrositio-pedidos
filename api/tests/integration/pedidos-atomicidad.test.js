const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Producto = require('../../models/producto');
const Negocio = require('../../models/negocio');
const productoRepo = require('../../infra/repositories/productoRepository');

let replset;

// Levanta un replica set en memoria y conecta mongoose antes de las pruebas.
beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
}, 60000);

// Desconecta mongoose y detiene el replica set al terminar las pruebas.
afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

describe('Atomicidad de stock bajo concurrencia', () => {
  // Verifica que 10 pedidos concurrentes del ultimo producto solo den 1 exito.
  it('10 pedidos concurrentes del ultimo producto: solo 1 success', async () => {
    const negocio = await Negocio.create({ slug: 'test-shop', nombre: 'Test Shop' });
    const producto = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Producto unico',
      precio: 100,
      stock: 1,
    });

    // Ejecuta una transaccion que descuenta stock usando el repositorio real.
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

    expect(exitos).toBe(1);
    const productoFinal = await Producto.findById(producto._id);
    expect(productoFinal.stock).toBe(0);
  }, 30000);
});
