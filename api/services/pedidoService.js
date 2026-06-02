/**
 * Servicio de pedidos — ORQUESTACION de la logica critica del sistema.
 *
 * Tras el refactor (F2-deep) este modulo solo ORQUESTA: la logica pura vive
 * en domain/ (estadoPedido, pedidoCalculos) y el acceso a datos en
 * infra/repositories/. Aqui solo queda el "pegamento": decidir mock vs ZUYU,
 * coordinar la transaccion atomica y encolar jobs.
 *
 * crearPedidoConStock:
 *   - Modo MOCK: transaccion MongoDB para crear pedido + descontar stock
 *     atomicamente (requiere Replica Set).
 *   - Modo conectado a ZUYU: delega el stock a ZUYU (fuente de verdad) y
 *     guarda copia local para tracking + delivery + panel.
 */
'use strict';

const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const redis = require('./redis');
const zuyu = require('./zuyu');
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

// ── Colas BullMQ ───────────────────────────────────────────────────
const redisConn = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};
const colaDelivery = new Queue('delivery', { connection: redisConn });
const colaNotificaciones = new Queue('notificaciones', { connection: redisConn });

/** Encola la notificacion de "pedido creado" al cliente. */
function notificarCreado(pedidoId) {
  return colaNotificaciones.add('confirmacion-cliente', {
    pedidoId,
    tipo: 'creado',
  });
}

/**
 * Genera un pedidoId humano-legible: PED-YYMM-NNNN
 */
async function generarPedidoId() {
  const now = new Date();
  const ym = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const counterKey = `counter:pedido:${ym}`;
  const secuencia = await redis.incr(counterKey);
  await redis.expire(counterKey, 60 * 60 * 24 * 60); // 60 dias
  return `PED-${ym}-${String(secuencia).padStart(4, '0')}`;
}

/**
 * Crea un pedido con stock atomico. Decide POR NEGOCIO si delega a ZUYU o
 * lo resuelve localmente (segun zuyuConfig — ver zuyu.js).
 *
 * @param {object} input - { negocioSlug, cliente, productos, metodoPago, notas, idempotencyKey }
 * @returns {object} pedido creado
 */
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

/**
 * Modo MOCK: el micrositio es la fuente de verdad del stock. Descuenta
 * stock y crea el pedido en una transaccion atomica.
 */
async function crearPedidoLocal(negocio, input) {
  // 1. Cargar productos para el snapshot
  const idsProductos = input.productos.map((p) => p.id);
  const productosDb = await productoRepo.buscarActivosPorIds(idsProductos, negocio._id);

  // 2. Dominio puro: construir snapshot + detectar problemas
  const { snapshot, faltantes, noEncontrados } = construirSnapshot(input.productos, productosDb);
  if (noEncontrados.length > 0) {
    throw new NotFoundError('Algunos productos no existen');
  }
  if (faltantes.length > 0) {
    throw new StockInsuficienteError(faltantes[0].id);
  }

  const { subtotal, costoEnvio, total } = calcularTotales(snapshot);
  const pedidoId = await generarPedidoId();

  // 3. TRANSACCION: descontar stock (atomico/condicional) + crear pedido
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

/**
 * Modo conectado: ZUYU verifica/decrementa stock atomicamente del lado de su
 * Replica Set. El micrositio guarda una copia local para tracking + panel.
 */
async function crearPedidoViaZuyu(negocio, input) {
  const pedidoId = await generarPedidoId();

  // referenciaExterna ESTABLE: si el cliente mando Idempotency-Key, esa es la
  // referencia que ve ZUYU. Un reintento llega con la MISMA ref y la
  // idempotencia de ZUYU devuelve la Venta existente (no crea una segunda).
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
    productos: zuyuResp.productos, // snapshot autoritativo de ZUYU
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

  // El stock cambio en ZUYU — invalidar el cache del catalogo.
  tiendaCache.delete(input.negocioSlug);
  await notificarCreado(pedido.pedidoId);

  logger.info({ pedidoId, zuyuPedidoId: zuyuResp.zuyuPedidoId }, 'Pedido creado via ZUYU');
  return pedido.toObject();
}

/**
 * Confirma un pedido (dueno) — encola la solicitud de repartidor.
 * negocioId del JWT: el pedido DEBE pertenecer a su negocio (tenant isolation).
 */
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
    proveedor: pedido.negocioId.deliveryProvider,
  });

  logger.info({ pedidoId }, 'Pedido confirmado');
  return pedido;
}

/**
 * Cancela un pedido (dueno) y devuelve el stock en una transaccion atomica.
 * negocioId del JWT: tenant isolation (evita IDOR entre negocios).
 */
// Pedido viene de ZUYU si tiene zuyuVentaId (set por syncZuyu en
// pedido_confirmado) O si algun product.id no es un ObjectId valido
// (SKU de ZUYU como "AVI-250"). En cualquiera de los dos casos, el stock
// vive en ZUYU — no debemos devolver stock en el Mongo local.
function esPedidoZuyu(pedido) {
  if (pedido.zuyuVentaId) {
    return true;
  }
  return (pedido.productos || []).some((p) => !mongoose.Types.ObjectId.isValid(p.id));
}

/**
 * Si el pedido ya tenia un repartidor solicitado, encola la cancelacion del
 * delivery en el carrier. Fire-and-forget: no bloquea la cancelacion del
 * pedido y el worker reintenta si el carrier falla. Se llama SIEMPRE fuera de
 * la transaccion Mongo (es I/O a Redis).
 */
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

async function cancelarPedido(pedidoId, usuarioId, negocioId) {
  // Lectura + validacion previa (fuera de transaccion). populateNegocio
  // para tener el slug que necesita el cliente de ZUYU.
  const pedidoZuyu = await pedidoRepo.buscarPorId(pedidoId, negocioId, {
    populateNegocio: true,
  });
  if (!pedidoZuyu) {
    throw new NotFoundError('Pedido no encontrado');
  }
  if (!estadoPedido.puedeCancelar(pedidoZuyu.estado)) {
    throw new Error(`No se puede cancelar pedido ${pedidoZuyu.estado}`);
  }

  // ── Pedido de ZUYU: ZUYU es source-of-truth del stock ──────────────
  // La cancelacion en ZUYU es una llamada HTTP — va FUERA de toda
  // transaccion Mongo (nunca mantener una transaccion abierta durante I/O
  // de red). ZUYU revierte el stock y es idempotente; solo si responde OK
  // marcamos el pedido local como cancelado.
  if (esPedidoZuyu(pedidoZuyu)) {
    const slug = pedidoZuyu.negocioId?.slug;
    const resultado = await zuyu.cancelarPedido(
      slug,
      pedidoZuyu.referenciaExterna || pedidoZuyu.pedidoId,
      `Cancelado por usuario ${usuarioId}`
    );
    if (!resultado) {
      // El negocio se desconecto de ZUYU despues de crear el pedido —
      // no podemos revertir el stock remoto. Marcamos local y avisamos.
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

  // ── Pedido local (mock): transaccion atomica devolver stock + marcar ──
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
