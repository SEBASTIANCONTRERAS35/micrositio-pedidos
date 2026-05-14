/**
 * Panel del dueno del negocio (vistas + endpoints JSON)
 */
const express = require('express');
const Pedido = require('../models/pedido');
const Negocio = require('../models/negocio');
const Usuario = require('../models/usuario');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

// Vistas EJS
router.get('/login', (req, res) => res.render('panel/login'));

router.get('/pedidos', async (req, res) => {
  // Renderea la vista, los datos se cargan via JS con el JWT del localStorage
  // Pero necesitamos saber el negocio para el header — usar middleware optional
  // Por ahora pasamos un negocio vacio si no hay JWT
  res.render('panel/pedidos', {
    negocio: { nombre: 'Mi Negocio' },
    usuario: { email: '' },
  });
});

// API JSON (autenticada)
router.get('/api/pedidos', requireAuth, async (req, res, next) => {
  try {
    const pedidos = await Pedido.find({ negocioId: req.user.negocioId })
      .sort({ creadoEn: -1 })
      .limit(100)
      .lean();
    res.json(pedidos);
  } catch (e) {
    next(e);
  }
});

router.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const [usuario, negocio] = await Promise.all([
      Usuario.findById(req.user.id).lean(),
      Negocio.findById(req.user.negocioId).lean(),
    ]);
    res.json({ usuario, negocio });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
