const express = require('express');
const { z } = require('zod');
const { validate } = require('../middlewares/validation');
const idempotency = require('../middlewares/idempotency');
const requireAuth = require('../middlewares/auth');
const { publicLimiter } = require('../middlewares/rateLimit');
const Pedido = require('../models/pedido');
const Negocio = require('../models/negocio');
const { perteneceANegocio, proyectarEstadoPublico } = require('../domain/trackingPublico');
const { NotFoundError } = require('../utils/errors');
const {
  crearPedidoConStock,
  confirmarPedido,
  cancelarPedido,
} = require('../services/pedidoService');

const router = express.Router();

const EstadoParamsSchema = z.object({
  pedidoId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\w-]+$/, 'ID de pedido invalido'),
});

const PedidoSchema = z.object({
  negocioSlug: z.string().min(1).max(60),
  cliente: z.object({
    nombre: z.string().min(2).max(100),
    telefono: z.string().regex(/^\+52\d{10}$/, 'Formato esperado: +52 + 10 digitos'),
    email: z.string().email().max(150),
    direccion: z.string().min(10).max(300),
  }),
  productos: z
    .array(
      z.object({
        id: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[\w-]+$/, 'ID de producto invalido'),
        cantidad: z.number().int().positive().max(99),
      })
    )
    .min(1)
    .max(50),
  metodoPago: z.enum(['efectivo', 'tarjeta_entrega']).default('efectivo'),
  notas: z.string().max(500).optional(),
});

// Crea un pedido publico con stock, idempotencia y rate limit.
router.post('/', publicLimiter, idempotency, validate(PedidoSchema), async (req, res, next) => {
  try {
    const pedido = await crearPedidoConStock({
      ...req.body,
      idempotencyKey: req.headers['idempotency-key'] || null,
      requestId: req.id,
    });
    res.status(201).json({
      pedidoId: pedido.pedidoId,
      estado: pedido.estado,
      total: pedido.total,
    });
  } catch (e) {
    next(e);
  }
});

// Devuelve el estado publico de un pedido para tracking, scoped por negocio (anti-IDOR, sin PII sensible).
router.get(
  '/:pedidoId/estado',
  publicLimiter,
  validate(EstadoParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
      if (!slug || slug.length > 60) {
        throw new NotFoundError('Pedido no encontrado');
      }

      const negocio = await Negocio.findOne({ slug, activo: true }).select('_id').lean();
      if (!negocio) {
        throw new NotFoundError('Pedido no encontrado');
      }

      const pedido = await Pedido.findOne({ pedidoId: req.params.pedidoId })
        .select('estado historial delivery negocioId')
        .lean();
      if (!pedido) {
        throw new NotFoundError('Pedido no encontrado');
      }
      if (!perteneceANegocio(pedido, negocio)) {
        // El pedido existe pero NO pertenece al negocio del slug: intento de IDOR.
        req.log.warn(
          {
            event: 'pedido.tracking.idor',
            pedidoId: req.params.pedidoId,
            negocioSlug: slug,
            ip: req.ip,
          },
          'Tracking rechazado: el pedido no pertenece al negocio (posible IDOR)'
        );
        throw new NotFoundError('Pedido no encontrado');
      }

      req.log.debug(
        {
          event: 'pedido.tracking.consulta',
          pedidoId: req.params.pedidoId,
          negocioSlug: slug,
          estado: pedido.estado,
        },
        'Consulta publica de tracking de pedido'
      );
      res.json(proyectarEstadoPublico(pedido));
    } catch (e) {
      next(e);
    }
  }
);

// Confirma un pedido del negocio del dueno autenticado.
router.post('/:id/confirmar', requireAuth, async (req, res, next) => {
  try {
    const pedido = await confirmarPedido(req.params.id, req.user.id, req.user.negocioId, req.id);
    res.json({ pedidoId: pedido.pedidoId, estado: pedido.estado });
  } catch (e) {
    next(e);
  }
});

// Cancela un pedido del negocio del dueno autenticado.
router.post('/:id/cancelar', requireAuth, async (req, res, next) => {
  try {
    const pedido = await cancelarPedido(req.params.id, req.user.id, req.user.negocioId, req.id);
    res.json({ pedidoId: pedido.pedidoId, estado: pedido.estado });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
