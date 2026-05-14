/**
 * Cliente HTTP del API publico de ZUYU.
 *
 * ZUYU es la fuente de verdad del catalogo + stock.
 * Este cliente se usa para:
 *   - Leer catalogo del negocio (con cache local)
 *   - Crear pedido en ZUYU (que decrementa stock atomicamente alla)
 *
 * En modo MOCK (ZUYU_MOCK=true) regresa datos del MongoDB local del micrositio.
 * Eso permite que el proyecto universitario corra standalone para la demo,
 * y se puede activar la integracion real cambiando una env var.
 */
const logger = require('../utils/logger');
const Producto = require('../models/producto');
const Negocio = require('../models/negocio');

const BASE_URL = process.env.ZUYU_BASE_URL || 'https://api.zuyu.mx';
const API_KEY = process.env.ZUYU_API_KEY;
const IS_MOCK = process.env.ZUYU_MOCK !== 'false';

async function fetchZuyu(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZUYU API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Obtiene el catalogo completo de un negocio.
 * Devuelve { negocio, productos: [{id, nombre, precio, stock, categoria, imagen}] }
 */
async function getCatalogo(slug) {
  if (IS_MOCK) {
    const negocio = await Negocio.findOne({ slug, activo: true }).lean();
    if (!negocio) {
      return null;
    }
    const productos = await Producto.find({ negocioId: negocio._id, activo: true })
      .select('nombre descripcion precio stock categoria imagen')
      .lean();
    return {
      negocio: { ...negocio, slug },
      productos: productos.map((p) => ({
        id: p._id.toString(),
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        stock: p.stock,
        categoria: p.categoria,
        imagen: p.imagen,
      })),
    };
  }
  return fetchZuyu(`/api/public/tienda/${slug}/catalogo`);
}

/**
 * Crea un pedido en ZUYU. ZUYU verifica stock y decrementa atomicamente.
 * Si el stock es insuficiente, ZUYU regresa 409 y tiramos StockInsuficienteError.
 *
 * Devuelve { zuyuPedidoId, total, productos } con los snapshots autoritativos.
 */
async function crearPedido(slug, pedidoData) {
  if (IS_MOCK) {
    // En mock, el pedidoService local maneja stock localmente
    return null;
  }
  return fetchZuyu(`/api/public/tienda/${slug}/pedidos`, {
    method: 'POST',
    body: JSON.stringify(pedidoData),
  });
}

/**
 * Healthcheck del API de ZUYU
 */
async function ping() {
  if (IS_MOCK) {
    return { ok: true, mode: 'mock' };
  }
  try {
    const r = await fetchZuyu('/api/public/health');
    return { ok: true, ...r };
  } catch (e) {
    logger.error({ err: e }, 'ZUYU ping failed');
    return { ok: false, error: e.message };
  }
}

module.exports = { getCatalogo, crearPedido, ping, IS_MOCK };
