/**
 * Rutas publicas del micrositio
 * GET /tienda/:slug — catalogo del negocio (fuente: ZUYU API o Mongo local segun ZUYU_MOCK)
 * GET /tienda/:slug/checkout — formulario de checkout
 * GET /tienda/:slug/pedido/:pedidoId — confirmacion del pedido
 */
const express = require('express');
const mongoose = require('mongoose');
const Negocio = require('../models/negocio');
const Pedido = require('../models/pedido');
const Producto = require('../models/producto');
const { tiendaCache } = require('../services/cache');
const zuyu = require('../services/zuyu');

const router = express.Router();

router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;

  // Cache local (TTL largo: ZUYU manda webhooks para invalidar)
  const cacheado = tiendaCache.get(slug);
  if (cacheado) {
    return res.render('tienda/index', cacheado);
  }

  // Fuente de verdad: ZUYU (en mock = mongo local). getCatalogo ya devuelve
  // la "vista de catalogo" normalizada por el ACL mapper — la ruta NO
  // re-mapea ni re-agrupa: solo cachea y renderea.
  const catalogo = await zuyu.getCatalogo(slug);
  if (!catalogo) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  // Cache largo (1 hora). ZUYU manda webhook para invalidar antes si hay cambios.
  tiendaCache.set(slug, catalogo, 60 * 60 * 1000);
  res.render('tienda/index', catalogo);
});

// Detalle de un producto del catálogo
router.get('/:slug/producto/:productoId', async (req, res) => {
  const { slug, productoId } = req.params;
  const negocio = await Negocio.findOne({ slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }
  if (!mongoose.Types.ObjectId.isValid(productoId)) {
    return res.status(404).render('tienda/404', { mensaje: 'Producto no válido' });
  }
  const producto = await Producto.findOne({
    _id: productoId,
    negocioId: negocio._id,
    activo: true,
  }).lean();
  if (!producto) {
    return res.status(404).render('tienda/404', { mensaje: 'Producto no encontrado' });
  }
  res.render('tienda/producto', {
    negocio: { ...negocio, slug },
    producto,
  });
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
