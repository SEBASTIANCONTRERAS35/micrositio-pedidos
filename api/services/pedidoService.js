'use strict';

const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const redis = require('./redis');
const zuyu = require('./zuyu');
const delivery = require('./delivery');
const Negocio = require('../models/negocio');
const { tiendaCache } = require('./cache');
const { StockInsuficienteError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const estadoPedido = require('../domain/estadoPedido');
const {
  construirSnapshot,
  calcularTotales,
  COSTO_ENVIO_BASE,
} = require('../domain/pedidoCalculos');
const pedidoRepo = require('../infra/repositories/pedidoRepository');
const productoRepo = require('../infra/repositories/productoRepository');

const { ESTADOS } = estadoPedido;

const redisConn = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};
const defaultJobOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
const colaDelivery = new Queue('delivery', { connection: redisConn, defaultJobOptions });
const colaNotificaciones = new Queue('notificaciones', {
  connection: redisConn,
  defaultJobOptions,
});

// Encola la notificacion de "pedido creado" al cliente.
function notificarCreado(pedidoId) {
  return colaNotificaciones.add('confirmacion-cliente', {
    pedidoId,
    tipo: 'creado',
  });
}

// Genera un pedidoId humano-legible: PED-YYMM-NNNN
async function generarPedidoId() {
  const now = new Date();
  const ym = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const counterKey = `counter:pedido:${ym}`;
  const secuencia = await redis.incr(counterKey);
  await redis.expire(counterKey, 60 * 60 * 24 * 60);
  return `PED-${ym}-${String(secuencia).padStart(4, '0')}`;
}

// Crea un pedido con stock atomico; decide por negocio si delega a ZUYU o local.
async function crearPedidoConStock(input) {
  const negocio = await Negocio.findOne({
    slug: input.negocioSlug,
    activo: true,
  }).lean();
  if (!negocio) {
    throw new NotFoundError('Negocio no encontrado');
  }

  if (await zuyu.estaConectado(input.negocioSlug)) {
    return crearPedidoViaZuyu(negocio, input);
  }
  return crearPedidoLocal(negocio, input);
}

// Modo MOCK: descuenta stock y crea el pedido en una transaccion atomica.
async function crearPedidoLocal(negocio, input) {
  const idsProductos = input.productos.map((p) => p.id);
  const productosDb = await productoRepo.buscarActivosPorIds(idsProductos, negocio._id);

  const { snapshot, faltantes, noEncontrados } = construirSnapshot(input.productos, productosDb);
  if (noEncontrados.length > 0) {
    throw new NotFoundError('Algunos productos no existen');
  }
  if (faltantes.length > 0) {
    throw new StockInsuficienteError(faltantes[0].id);
  }

  const { subtotal, costoEnvio, total } = calcularTotales(snapshot);
  const pedidoId = await generarPedidoId();

  const session = await mongoose.startSession();
  try {
    let pedidoCreado;
    await session.withTransaction(async () => {
      const exito = await productoRepo.descontarStock(snapshot, session);
      if (!exito) {
        throw new StockInsuficienteError('alguno');
      }
      pedidoCreado = await pedidoRepo.crearEnSession(
        {
          pedidoId,
          negocioId: negocio._id,
          cliente: input.cliente,
          productos: snapshot,
          subtotal,
          costoEnvio,
          total,
          metodoPago: input.metodoPago || 'efectivo',
          estado: ESTADOS.PENDIENTE,
          notas: input.notas,
          historial: [{ estado: ESTADOS.PENDIENTE, nota: 'Pedido creado por cliente' }],
        },
        session
      );
    });

    logger.info({ pedidoId, negocioId: negocio._id }, 'Pedido creado (local)');
    await notificarCreado(pedidoCreado.pedidoId);
    return pedidoCreado.toObject();
  } finally {
    session.endSession();
  }
}

// Modo conectado: ZUYU maneja el stock y se guarda una copia local para tracking.
async function crearPedidoViaZuyu(negocio, input) {
  const pedidoId = await generarPedidoId();

  const referenciaExterna = input.idempotencyKey || pedidoId;

  const zuyuResp = await zuyu.crearPedido(input.negocioSlug, {
    referenciaExterna,
    cliente: input.cliente,
    productos: input.productos,
    metodoPago: input.metodoPago,
    canal: 'micrositio',
  });

  const pedido = await pedidoRepo.crear({
    pedidoId,
    referenciaExterna,
    negocioId: negocio._id,
    cliente: input.cliente,
    productos: zuyuResp.productos,
    subtotal: zuyuResp.subtotal,
    costoEnvio: zuyuResp.costoEnvio || COSTO_ENVIO_BASE,
    total: zuyuResp.total,
    metodoPago: input.metodoPago || 'efectivo',
    estado: ESTADOS.PENDIENTE,
    notas: input.notas,
    historial: [
      {
        estado: ESTADOS.PENDIENTE,
        nota: `Pedido creado via ZUYU id=${zuyuResp.zuyuPedidoId}`,
      },
    ],
  });

  tiendaCache.delete(input.negocioSlug);
  await notificarCreado(pedido.pedidoId);

  logger.info({ pedidoId, zuyuPedidoId: zuyuResp.zuyuPedidoId }, 'Pedido creado via ZUYU');
  return pedido.toObject();
}

// Confirma un pedido (dueno) y encola la solicitud de repartidor.
async function confirmarPedido(pedidoId, usuarioId, negocioId) {
  const pedido = await pedidoRepo.buscarPorId(pedidoId, negocioId, {
    populateNegocio: true,
  });
  if (!pedido) {
    throw new NotFoundError('Pedido no encontrado');
  }
  if (!estadoPedido.puedeConfirmar(pedido.estado)) {
    throw new Error('Solo se pueden confirmar pedidos pendientes');
  }

  pedido.estado = ESTADOS.CONFIRMADO;
  pedido.historial.push({
    estado: ESTADOS.CONFIRMADO,
    nota: `Confirmado por usuario ${usuarioId}`,
  });
  await pedido.save();

  await colaDelivery.add('solicitar-repartidor', {
    pedidoId: pedido.pedidoId,
    proveedor: delivery.selectProviderByCity(pedido.negocioId),
  });

  logger.info({ pedidoId }, 'Pedido confirmado');
  return pedido;
}

// Determina si el pedido pertenece a ZUYU (zuyuVentaId o id no-ObjectId).
function esPedidoZuyu(pedido) {
  if (pedido.zuyuVentaId) {
    return true;
  }
  return (pedido.productos || []).some((p) => !mongoose.Types.ObjectId.isValid(p.id));
}

// Encola la cancelacion del repartidor si el pedido ya tenia uno solicitado.
async function cancelarRepartidorSiAplica(pedido) {
  const deliveryId = pedido && pedido.delivery && pedido.delivery.deliveryId;
  if (!deliveryId) {
    return;
  }
  await colaDelivery.add('cancelar-repartidor', {
    deliveryId,
    proveedor: pedido.delivery.proveedor,
  });
}

// Cancela un pedido (dueno) y devuelve el stock (ZUYU o transaccion local).
async function cancelarPedido(pedidoId, usuarioId, negocioId) {
  const pedidoZuyu = await pedidoRepo.buscarPorId(pedidoId, negocioId, {
    populateNegocio: true,
  });
  if (!pedidoZuyu) {
    throw new NotFoundError('Pedido no encontrado');
  }
  if (!estadoPedido.puedeCancelar(pedidoZuyu.estado)) {
    throw new Error(`No se puede cancelar pedido ${pedidoZuyu.estado}`);
  }

  if (esPedidoZuyu(pedidoZuyu)) {
    const slug = pedidoZuyu.negocioId?.slug;
    const resultado = await zuyu.cancelarPedido(
      slug,
      pedidoZuyu.referenciaExterna || pedidoZuyu.pedidoId,
      `Cancelado por usuario ${usuarioId}`
    );
    if (!resultado) {
      logger.warn({ pedidoId }, 'Negocio sin conexion ZUYU — cancelacion solo local');
    }
    pedidoZuyu.estado = ESTADOS.CANCELADO;
    pedidoZuyu.historial.push({
      estado: ESTADOS.CANCELADO,
      nota: resultado
        ? `Cancelado por usuario ${usuarioId} (stock revertido en ZUYU)`
        : `Cancelado por usuario ${usuarioId}`,
    });
    await pedidoZuyu.save();
    await cancelarRepartidorSiAplica(pedidoZuyu);
    logger.info({ pedidoId, zuyuVentaId: pedidoZuyu.zuyuVentaId }, 'Pedido (ZUYU) cancelado');
    return pedidoZuyu;
  }

  const session = await mongoose.startSession();
  try {
    let pedidoCancelado;
    await session.withTransaction(async () => {
      const pedido = await pedidoRepo.buscarPorIdEnSession(pedidoId, negocioId, session);
      if (!pedido) {
        throw new NotFoundError('Pedido no encontrado');
      }
      if (!estadoPedido.puedeCancelar(pedido.estado)) {
        throw new Error(`No se puede cancelar pedido ${pedido.estado}`);
      }

      await productoRepo.devolverStock(pedido.productos, session);

      pedido.estado = ESTADOS.CANCELADO;
      pedido.historial.push({
        estado: ESTADOS.CANCELADO,
        nota: `Cancelado por usuario ${usuarioId}`,
      });
      await pedido.save({ session });
      pedidoCancelado = pedido;
    });

    await cancelarRepartidorSiAplica(pedidoCancelado);
    logger.info({ pedidoId }, 'Pedido cancelado');
    return pedidoCancelado;
  } finally {
    session.endSession();
  }
}

module.exports = {
  crearPedidoConStock,
  confirmarPedido,
  cancelarPedido,
  generarPedidoId,
};
