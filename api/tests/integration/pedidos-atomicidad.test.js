/**
 * Test critico: 10 pedidos concurrentes del ultimo producto.
 * Solo 1 debe tener exito, 9 deben fallar con StockInsuficiente.
 *
 * Levanta MongoDB Replica Set real con Testcontainers.
 */
const { describe, it, expect, beforeAll, afterAll } = require('vitest');
const { GenericContainer, Wait } = require('testcontainers');
const mongoose = require('mongoose');

let mongoContainer;
let MONGO_URI;

beforeAll(async () => {
  mongoContainer = await new GenericContainer('mongo:7.0')
    .withCommand(['--replSet', 'rs0', '--bind_ip_all'])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage('Waiting for connections'))
    .withStartupTimeout(60000)
    .start();

  const port = mongoContainer.getMappedPort(27017);
  MONGO_URI = `mongodb://localhost:${port}/test?directConnection=true`;

  // Inicializar Replica Set
  const tempConn = await mongoose.createConnection(MONGO_URI).asPromise();
  await tempConn.db.admin().command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `localhost:${port}` }] } });
  await tempConn.close();

  // Esperar a que sea PRIMARY
  await new Promise((r) => setTimeout(r, 3000));

  await mongoose.connect(`mongodb://localhost:${port}/test?replicaSet=rs0&directConnection=true`);
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoContainer?.stop();
});

describe('Atomicidad de stock bajo concurrencia', () => {
  it('10 pedidos concurrentes del ultimo producto: solo 1 success', async () => {
    const Producto = require('../../models/producto');
    const Pedido = require('../../models/pedido');
    const Negocio = require('../../models/negocio');

    // Setup: negocio + producto con stock=1
    const negocio = await Negocio.create({ slug: 'test-shop', nombre: 'Test Shop' });
    const producto = await Producto.create({
      negocioId: negocio._id,
      nombre: 'Producto unico',
      precio: 100,
      stock: 1,
    });

    // 10 transacciones concurrentes intentando descontar stock
    const intentos = Array.from({ length: 10 }).map(async () => {
      const session = await mongoose.startSession();
      try {
        let success = false;
        await session.withTransaction(async () => {
          const r = await Producto.bulkWrite(
            [{ updateOne: { filter: { _id: producto._id, stock: { $gte: 1 } }, update: { $inc: { stock: -1 } } } }],
            { session }
          );
          if (r.modifiedCount !== 1) throw new Error('Stock insuficiente');
          success = true;
        });
        return success;
      } catch (e) {
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
