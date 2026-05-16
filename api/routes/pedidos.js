/**
 * API REST de pedidos
 */
const express = require('express');
const { z } = require('zod');
const { validate } = require('../middlewares/validation');
const idempotency = require('../middlewares/idempotency');
const requireAuth = require('../middlewares/auth');
const { publicLimiter } = require('../middlewares/rateLimit');
const {
  crearPedidoConStock,
  confirmarPedido,
  cancelarPedido,
} = require('../services/pedidoService');

const router = express.Router();

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
        // Acepta ObjectId hex (mock: 24 chars [a-f0-9]) Y SKU de ZUYU
        // (e.g. "AVI-250") — mismo patron que usa publicApi de ZUYU
        // (publicApi/shared/validation/schemas.js).
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

// POST /api/pedidos — publico, con idempotencia y rate limit
router.post('/', publicLimiter, idempotency, validate(PedidoSchema), async (req, res, next) => {
  try {
    // El Idempotency-Key (header) se pasa al service para usarlo como
    // referenciaExterna estable hacia ZUYU (ver crearPedidoViaZuyu).
    const pedido = await crearPedidoConStock({
      ...req.body,
      idempotencyKey: req.headers['idempotency-key'] || null,
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

// POST /api/pedidos/:id/confirmar — solo dueno (scoped a su negocio)
router.post('/:id/confirmar', requireAuth, async (req, res, next) => {
  try {
    const pedido = await confirmarPedido(req.params.id, req.user.id, req.user.negocioId);
    res.json({ pedidoId: pedido.pedidoId, estado: pedido.estado });
  } catch (e) {
    next(e);
  }
});

// POST /api/pedidos/:id/cancelar — solo dueno (scoped a su negocio)
router.post('/:id/cancelar', requireAuth, async (req, res, next) => {
  try {
    const pedido = await cancelarPedido(req.params.id, req.user.id, req.user.negocioId);
    res.json({ pedidoId: pedido.pedidoId, estado: pedido.estado });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
