/**
 * Rutas publicas del micrositio (basadas en patron de PaginaWeb pero single-tenant simple)
 * GET /tienda/:slug — catalogo del negocio
 * GET /tienda/:slug/checkout — formulario de checkout
 * GET /tienda/:slug/pedido/:pedidoId — confirmacion del pedido
 */
const express = require('express');
const Negocio = require('../models/negocio');
const Producto = require('../models/producto');
const Pedido = require('../models/pedido');
const { tiendaCache } = require('../services/cache');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;

  // Cache 30 min
  const cached = tiendaCache.get(slug);
  if (cached) return res.render('tienda/index', cached);

  const negocio = await Negocio.findOne({ slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  const productos = await Producto.find({ negocioId: negocio._id, activo: true })
    .select('nombre descripcion precio stock categoria imagen')
    .lean();

  // Agrupar por categoria
  const porCategoria = {};
  for (const p of productos) {
    const cat = p.categoria || 'General';
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  }

  const data = {
    negocio: { ...negocio, slug },
    porCategoria,
    promociones: [], // TODO: agregar modelo Promocion si hay tiempo
  };

  tiendaCache.set(slug, data);
  res.render('tienda/index', data);
});

router.get('/:slug/checkout', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  res.render('tienda/checkout', { negocio: { ...negocio, slug: req.params.slug } });
});

router.get('/:slug/pedido/:pedidoId', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });

  const pedido = await Pedido.findOne({ pedidoId: req.params.pedidoId }).lean();
  if (!pedido) return res.status(404).render('tienda/404', { mensaje: 'Pedido no encontrado' });

  // Solo mostrar pedidos del mismo negocio
  if (pedido.negocioId.toString() !== negocio._id.toString()) {
    return res.status(404).render('tienda/404', { mensaje: 'Pedido no encontrado' });
  }

  res.render('tienda/pedido-confirmacion', {
    negocio: { ...negocio, slug: req.params.slug },
    pedido,
  });
});

module.exports = router;
