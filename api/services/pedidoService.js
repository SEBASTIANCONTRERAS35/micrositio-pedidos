/**
 * Servicio de pedidos — la logica critica del sistema
 *
 * crearPedidoConStock:
 *   - Transaccion MongoDB para crear pedido y descontar stock atomicamente
 *   - Si stock insuficiente, abort de la transaccion (nada se persiste)
 *   - Encola job para solicitar repartidor (via Redis BullMQ)
 *
 * Esta operacion REQUIERE Replica Set (transacciones multi-doc)
 */
const mongoose = require('mongoose');
const Producto = require('../models/producto');
const Pedido = require('../models/pedido');
const Negocio = require('../models/negocio');
const { Queue } = require('bullmq');
const redis = require('./redis');
const zuyu = require('./zuyu');
const { tiendaCache } = require('./cache');
const { StockInsuficienteError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

// Cola para el worker
const colaDelivery = new Queue('delivery', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

const colaNotificaciones = new Queue('notificaciones', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

/**
 * Genera un pedidoId humano-legible: PED-YYMM-NNNN
 */
async function generarPedidoId() {
  const now = new Date();
  const ym = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const counterKey = `counter:pedido:${ym}`;
  const seq = await redis.incr(counterKey);
  await redis.expire(counterKey, 60 * 60 * 24 * 60); // 60 dias
  return `PED-${ym}-${String(seq).padStart(4, '0')}`;
}

/**
 * Crea un pedido con stock atomico
 *
 * En modo MOCK (ZUYU_MOCK=true): descuenta stock localmente con transaccion MongoDB
 * En modo PROD (ZUYU_MOCK=false): delega a ZUYU API que es la fuente de verdad,
 *   y ademas guarda copia local del pedido para tracking + delivery
 *
 * @param {object} input - { negocioSlug, cliente, productos, metodoPago, notas }
 * @returns {object} pedido creado
 */
async function crearPedidoConStock(input) {
  // 1. Buscar negocio
  const negocio = await Negocio.findOne({ slug: input.negocioSlug, activo: true }).lean();
  if (!negocio) {
    throw new NotFoundError('Negocio no encontrado');
  }

  // Si NO esta en modo mock: delegar a ZUYU para que descuente stock
  if (!zuyu.IS_MOCK) {
    return crearPedidoViaZuyu(negocio, input);
  }

  // 2. Buscar productos para snapshot
  const productosIds = input.productos.map((p) => new mongoose.Types.ObjectId(p.id));
  const productosDb = await Producto.find({
    _id: { $in: productosIds },
    negocioId: negocio._id,
    activo: true,
  }).lean();

  if (productosDb.length !== input.productos.length) {
    throw new NotFoundError('Algunos productos no existen');
  }

  // 3. Construir snapshot y validar stock preliminar
  const productosSnapshot = input.productos.map((req) => {
    const db = productosDb.find((p) => p._id.toString() === req.id);
    if (db.stock < req.cantidad) {
      throw new StockInsuficienteError(req.id);
    }
    return {
      id: db._id,
      nombre: db.nombre,
      precioUnitario: db.precio,
      cantidad: req.cantidad,
    };
  });

  const subtotal = productosSnapshot.reduce((s, p) => s + p.precioUnitario * p.cantidad, 0);
  const costoEnvio = 49; // Estimado base, el provider de delivery lo ajusta
  const total = subtotal + costoEnvio;

  // 4. Generar id humano
  const pedidoId = await generarPedidoId();

  // 5. TRANSACCION: descontar stock + crear pedido
  const session = await mongoose.startSession();
  try {
    let pedidoCreado;
    await session.withTransaction(async () => {
      // 5a. Descontar stock condicional (atomic check)
      const bulkResult = await Producto.bulkWrite(
        productosSnapshot.map((p) => ({
          updateOne: {
            filter: { _id: p.id, stock: { $gte: p.cantidad } },
            update: { $inc: { stock: -p.cantidad } },
          },
        })),
        { session }
      );

      if (bulkResult.modifiedCount !== productosSnapshot.length) {
        throw new StockInsuficienteError('alguno');
      }

      // 5b. Crear pedido
      const [pedido] = await Pedido.create(
        [
          {
            pedidoId,
            negocioId: negocio._id,
            cliente: input.cliente,
            productos: productosSnapshot,
            subtotal,
            costoEnvio,
            total,
            metodoPago: input.metodoPago || 'efectivo',
            estado: 'pendiente',
            notas: input.notas,
            historial: [{ estado: 'pendiente', nota: 'Pedido creado por cliente' }],
          },
        ],
        { session }
      );

      pedidoCreado = pedido;
    });

    logger.info({ pedidoId, negocioId: negocio._id }, 'Pedido creado');

    // 6. Encolar notificacion al cliente (fuera de transaccion)
    await colaNotificaciones.add('confirmacion-cliente', {
      pedidoId: pedidoCreado.pedidoId,
      tipo: 'creado',
    });

    return pedidoCreado.toObject();
  } finally {
    session.endSession();
  }
}

/**
 * Confirma un pedido (dueno) - encola solicitud de repartidor
 */
async function confirmarPedido(pedidoId, usuarioId) {
  const pedido = await Pedido.findOne({ pedidoId }).populate('negocioId');
  if (!pedido) {
    throw new NotFoundError('Pedido no encontrado');
  }
  if (pedido.estado !== 'pendiente') {
    throw new Error('Solo se pueden confirmar pedidos pendientes');
  }

  pedido.estado = 'confirmado';
  pedido.historial.push({ estado: 'confirmado', nota: `Confirmado por usuario ${usuarioId}` });
  await pedido.save();

  // Encolar solicitud de repartidor
  await colaDelivery.add('solicitar-repartidor', {
    pedidoId: pedido.pedidoId,
    proveedor: pedido.negocioId.deliveryProvider,
  });

  logger.info({ pedidoId }, 'Pedido confirmado');
  return pedido;
}

async function cancelarPedido(pedidoId, usuarioId) {
  const session = await mongoose.startSession();
  try {
    let pedidoCancelado;
    await session.withTransaction(async () => {
      const pedido = await Pedido.findOne({ pedidoId }).session(session);
      if (!pedido) {
        throw new NotFoundError('Pedido no encontrado');
      }
      if (['entregado', 'cancelado'].includes(pedido.estado)) {
        throw new Error(`No se puede cancelar pedido ${pedido.estado}`);
      }

      // Devolver stock
      await Producto.bulkWrite(
        pedido.productos.map((p) => ({
          updateOne: {
            filter: { _id: p.id },
            update: { $inc: { stock: p.cantidad } },
          },
        })),
        { session }
      );

      pedido.estado = 'cancelado';
      pedido.historial.push({ estado: 'cancelado', nota: `Cancelado por usuario ${usuarioId}` });
      await pedido.save({ session });
      pedidoCancelado = pedido;
    });

    logger.info({ pedidoId }, 'Pedido cancelado y stock devuelto');
    return pedidoCancelado;
  } finally {
    session.endSession();
  }
}

/**
 * Crea pedido via ZUYU API (modo produccion)
 * ZUYU verifica/decrementa stock atomicamente del lado de su Replica Set
 */
async function crearPedidoViaZuyu(negocio, input) {
  const pedidoId = await generarPedidoId();

  // 1. Pedir a ZUYU que reserve y descuente stock atomicamente
  const zuyuResp = await zuyu.crearPedido(input.negocioSlug, {
    referenciaExterna: pedidoId,
    cliente: input.cliente,
    productos: input.productos,
    metodoPago: input.metodoPago,
    canal: 'micrositio',
  });

  // 2. Guardar copia local para tracking + delivery + panel
  const pedido = await Pedido.create({
    pedidoId,
    negocioId: negocio._id,
    cliente: input.cliente,
    productos: zuyuResp.productos, // snapshot autoritativo de ZUYU
    subtotal: zuyuResp.subtotal,
    costoEnvio: zuyuResp.costoEnvio || 49,
    total: zuyuResp.total,
    metodoPago: input.metodoPago || 'efectivo',
    estado: 'pendiente',
    notas: input.notas,
    historial: [
      { estado: 'pendiente', nota: `Pedido creado via ZUYU id=${zuyuResp.zuyuPedidoId}` },
    ],
  });

  // 3. Invalidar cache del catalogo (el stock cambio)
  tiendaCache.delete(input.negocioSlug);

  // 4. Encolar notificacion
  await colaNotificaciones.add('confirmacion-cliente', { pedidoId: pedido.pedidoId });

  logger.info({ pedidoId, zuyuPedidoId: zuyuResp.zuyuPedidoId }, 'Pedido creado via ZUYU');
  return pedido.toObject();
}

module.exports = {
  crearPedidoConStock,
  confirmarPedido,
  cancelarPedido,
  generarPedidoId,
};
