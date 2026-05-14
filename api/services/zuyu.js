/**
 * Cliente HTTP del API publico de ZUYU (publicApi/v1).
 *
 * ZUYU es la fuente de verdad del catalogo + stock. Este cliente se usa para:
 *   - Leer catalogo del negocio       GET  /api/public/v1/catalog
 *   - Crear pedido en ZUYU            POST /api/public/v1/orders
 *   - Consultar estado de pedido      GET  /api/public/v1/orders/:ref
 *   - Healthcheck                     GET  /api/public/v1/health
 *
 * En modo MOCK (ZUYU_MOCK=true) usa el MongoDB local del micrositio, lo que
 * permite que el proyecto corra standalone. Con ZUYU_MOCK=false se integra
 * con ZUYU real via API key.
 *
 * Contrato (definido en ZUYU/backend/publicApi/v1/):
 *   - Auth: header  X-API-Key: zk_<env>_<...>
 *   - Catalogo:  { negocio, porCategoria, productos[], pagination }
 *   - Pedido in: { referenciaExterna, cliente, productos[], metodoPago, costoEnvio, notas }
 *   - Pedido out:{ referenciaExterna, zuyuVentaId, idVenta, subtotal, total, estado, fecha }
 */
const logger = require('../utils/logger');
const Producto = require('../models/producto');
const Negocio = require('../models/negocio');

const BASE_URL = process.env.ZUYU_BASE_URL || 'https://api.zuyu.mx';
const API_KEY = process.env.ZUYU_API_KEY;
const IS_MOCK = process.env.ZUYU_MOCK !== 'false';
const TIMEOUT_MS = parseInt(process.env.ZUYU_TIMEOUT_MS || '8000', 10);

/**
 * fetch con timeout + header de auth. Lanza Error con .status si la
 * respuesta no es OK.
 */
async function fetchZuyu(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/public/v1${path}`, {
      ...options,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      let body;
      try {
        body = await res.json();
      } catch {
        body = { message: await res.text() };
      }
      const err = new Error(body.message || `ZUYU API ${res.status}`);
      err.status = res.status;
      err.code = body.error || 'ZUYU_API_ERROR';
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Obtiene el catalogo de un negocio.
 * Devuelve { negocio, porCategoria, productos[] } — mismo shape que la
 * vista EJS espera.
 */
async function getCatalogo(slug) {
  if (IS_MOCK) {
    return getCatalogoMock(slug);
  }

  // En modo real, ZUYU resuelve el negocio desde el API key.
  const data = await fetchZuyu('/catalog');
  return {
    negocio: { ...data.negocio, slug: data.negocio.slug || slug },
    productos: data.productos,
    porCategoria: data.porCategoria,
    promociones: [],
  };
}

/**
 * Crea un pedido en ZUYU. ZUYU verifica/decrementa stock atomicamente y crea
 * una Venta real con canalVenta='micrositio'.
 *
 * @param {string} slug
 * @param {object} pedidoData - { referenciaExterna, cliente, productos[], metodoPago, costoEnvio, notas }
 * @returns {object} { referenciaExterna, zuyuVentaId, idVenta, subtotal, total, estado, fecha }
 */
async function crearPedido(slug, pedidoData) {
  if (IS_MOCK) {
    return null;
  } // en mock, pedidoService maneja stock localmente

  return fetchZuyu('/orders', {
    method: 'POST',
    body: JSON.stringify(pedidoData),
  });
}

/**
 * Consulta el estado de un pedido en ZUYU por su referencia.
 */
async function getEstadoPedido(referenciaExterna) {
  if (IS_MOCK) {
    return null;
  }
  return fetchZuyu(`/orders/${encodeURIComponent(referenciaExterna)}`);
}

/**
 * Healthcheck del API de ZUYU.
 */
async function ping() {
  if (IS_MOCK) {
    return { ok: true, mode: 'mock' };
  }
  try {
    const r = await fetchZuyu('/health');
    return { ok: r.status === 'ok', ...r };
  } catch (e) {
    logger.error({ err: e.message }, 'ZUYU ping failed');
    return { ok: false, error: e.message };
  }
}

// ── MODO MOCK: usa el MongoDB local del micrositio ─────────────────
async function getCatalogoMock(slug) {
  const negocio = await Negocio.findOne({ slug, activo: true }).lean();
  if (!negocio) {
    return null;
  }
  const productos = await Producto.find({ negocioId: negocio._id, activo: true })
    .select('nombre descripcion precio stock categoria imagen')
    .lean();

  const porCategoria = {};
  for (const p of productos) {
    const cat = p.categoria || 'General';
    if (!porCategoria[cat]) {
      porCategoria[cat] = [];
    }
    porCategoria[cat].push({ ...p, _id: p._id });
  }

  return {
    negocio: { ...negocio, slug },
    productos: productos.map((p) => ({
      _id: p._id,
      id: p._id.toString(),
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      stock: p.stock,
      categoria: p.categoria,
      imagen: p.imagen,
    })),
    porCategoria,
    promociones: [],
  };
}

module.exports = {
  getCatalogo,
  crearPedido,
  getEstadoPedido,
  ping,
  IS_MOCK,
};
