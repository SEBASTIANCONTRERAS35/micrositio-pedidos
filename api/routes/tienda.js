/**
 * Rutas publicas del micrositio
 * GET /tienda/:slug — catalogo del negocio (fuente: ZUYU API o Mongo local segun ZUYU_MOCK)
 * GET /tienda/:slug/checkout — formulario de checkout
 * GET /tienda/:slug/pedido/:pedidoId — confirmacion del pedido
 */
const express = require('express');
const Negocio = require('../models/negocio');
const Pedido = require('../models/pedido');
const { tiendaCache } = require('../services/cache');
const zuyu = require('../services/zuyu');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;

  // Cache local (TTL largo: ZUYU manda webhooks para invalidar)
  const cached = tiendaCache.get(slug);
  if (cached) {
    return res.render('tienda/index', cached);
  }

  // Fuente de verdad: ZUYU (en mock = mongo local)
  const catalogo = await zuyu.getCatalogo(slug);
  if (!catalogo) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  // Convertir _id a id para template (compatibilidad con datos de ZUYU)
  const productos = catalogo.productos.map((p) => ({
    _id: p.id || p._id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    stock: p.stock,
    categoria: p.categoria,
    imagen: p.imagen,
  }));

  // Agrupar por categoria
  const porCategoria = {};
  for (const p of productos) {
    const cat = p.categoria || 'General';
    if (!porCategoria[cat]) {
      porCategoria[cat] = [];
    }
    porCategoria[cat].push(p);
  }

  const data = {
    negocio: { ...catalogo.negocio, slug },
    porCategoria,
    promociones: catalogo.promociones || [],
  };

  // Cache largo (1 hora). ZUYU manda webhook para invalidar antes si hay cambios.
  tiendaCache.set(slug, data, 60 * 60 * 1000);
  res.render('tienda/index', data);
});

router.get('/:slug/checkout', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }
  res.render('tienda/checkout', { negocio: { ...negocio, slug: req.params.slug } });
});

router.get('/:slug/pedido/:pedidoId', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  const pedido = await Pedido.findOne({ pedidoId: req.params.pedidoId }).lean();
  if (!pedido) {
    return res.status(404).render('tienda/404', { mensaje: 'Pedido no encontrado' });
  }

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
