const express = require('express');
const mongoose = require('mongoose');
const Negocio = require('../models/negocio');
const Pedido = require('../models/pedido');
const Producto = require('../models/producto');
const { tiendaCache } = require('../services/cache');
const zuyu = require('../services/zuyu');

const router = express.Router();

// Renderiza el catalogo del negocio usando cache local o ZUYU
router.get('/:slug', async (req, res) => {
  const slug = req.params.slug;

  const cacheado = tiendaCache.get(slug);
  if (cacheado) {
    return res.render('tienda/index', cacheado);
  }

  const catalogo = await zuyu.getCatalogo(slug);
  if (!catalogo) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  tiendaCache.set(slug, catalogo, 60 * 60 * 1000);
  res.render('tienda/index', catalogo);
});

// Muestra el detalle de un producto del catalogo
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

// Renderiza el formulario de checkout del negocio
router.get('/:slug/checkout', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }
  res.render('tienda/checkout', { negocio: { ...negocio, slug: req.params.slug } });
});

// Muestra la confirmacion de un pedido validando que sea del negocio
router.get('/:slug/pedido/:pedidoId', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }

  const pedido = await Pedido.findOne({ pedidoId: req.params.pedidoId }).lean();
  if (!pedido) {
    return res.status(404).render('tienda/404', { mensaje: 'Pedido no encontrado' });
  }

  if (pedido.negocioId.toString() !== negocio._id.toString()) {
    return res.status(404).render('tienda/404', { mensaje: 'Pedido no encontrado' });
  }

  res.render('tienda/pedido-confirmacion', {
    negocio: { ...negocio, slug: req.params.slug },
    pedido,
  });
});

// Lista "Mis pedidos" del cliente (se rellena en el navegador desde localStorage)
router.get('/:slug/mis-pedidos', async (req, res) => {
  const negocio = await Negocio.findOne({ slug: req.params.slug, activo: true }).lean();
  if (!negocio) {
    return res.status(404).render('tienda/404', { mensaje: 'Negocio no encontrado' });
  }
  res.render('tienda/mis-pedidos', { negocio: { ...negocio, slug: req.params.slug } });
});

module.exports = router;
