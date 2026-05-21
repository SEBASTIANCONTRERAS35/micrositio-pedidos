/**
 * Cliente HTTP del API publico de ZUYU (publicApi/v1).
 *
 * ZUYU es la fuente de verdad del catalogo + stock. Este cliente se usa para:
 *   - Leer catalogo del negocio       GET  /api/public/v1/catalog
 *   - Crear pedido en ZUYU            POST /api/public/v1/orders
 *   - Consultar estado de pedido      GET  /api/public/v1/orders/:ref
 *   - Healthcheck                     GET  /api/public/v1/health
 *
 * CONFIG POR NEGOCIO: cada Negocio guarda su propia integracion en
 * `zuyuConfig` (apiKey, baseUrl, etc.) — el dueno la captura desde el panel.
 * Las variables de entorno ZUYU_* funcionan como FALLBACK para deployments
 * sin UI (12-factor). Si `zuyuConfig.conectado` es false y no hay override
 * por env, el cliente cae a modo MOCK (Mongo local del micrositio).
 */
const logger = require('../utils/logger');
const Producto = require('../models/producto');
const Negocio = require('../models/negocio');
const { decryptSecret } = require('../utils/crypto');
const { toCatalogoVista } = require('../infra/gateways/zuyuMapper');

const TIMEOUT_MS = parseInt(process.env.ZUYU_TIMEOUT_MS || '8000', 10);

/**
 * Resuelve la config de ZUYU para un negocio. DB primero, env como fallback.
 *
 * @param {string} [slug] - slug del negocio. Sin slug, solo aplica el fallback env.
 * @returns {Promise<{conectado:boolean, baseUrl:string, apiKey:?string,
 *   webhookSecret:?string, webhookSecretPrevio:?string}>}
 */
async function resolverConfig(slug) {
  let cfg = {};
  if (slug) {
    const negocio = await Negocio.findOne({ slug })
      .select('+zuyuConfig.apiKey +zuyuConfig.webhookSecret +zuyuConfig.webhookSecretPrevio')
      .lean();
    cfg = negocio?.zuyuConfig || {};
  }

  // Los secretos se guardan cifrados at-rest — decryptSecret los descifra
  // (y devuelve tal cual los valores legacy en claro). El env es fallback.
  const apiKey =
    (cfg.apiKey ? decryptSecret(cfg.apiKey) : null) || process.env.ZUYU_API_KEY || null;
  const baseUrl = cfg.baseUrl || process.env.ZUYU_BASE_URL || 'https://api.zuyu.mx';
  const webhookSecret =
    (cfg.webhookSecret ? decryptSecret(cfg.webhookSecret) : null) ||
    process.env.ZUYU_WEBHOOK_SECRET ||
    null;
  const webhookSecretPrevio =
    (cfg.webhookSecretPrevio ? decryptSecret(cfg.webhookSecretPrevio) : null) ||
    process.env.ZUYU_WEBHOOK_SECRET_PREVIO ||
    null;

  // Conectado si: el dueno lo activo en el panel (flagUI) O el deployment lo
  // fuerza por env (ZUYU_MOCK=false). En ambos casos hace falta un apiKey real.
  const flagUI = cfg.conectado === true;
  const flagEnv = process.env.ZUYU_MOCK === 'false';
  const conectado = (flagUI || flagEnv) && !!apiKey;

  return { conectado, baseUrl, apiKey, webhookSecret, webhookSecretPrevio };
}

/**
 * fetch con timeout + header de auth. Lanza Error con .status si la
 * respuesta no es OK.
 */
async function fetchZuyu(path, cfg, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/public/v1${path}`, {
      ...options,
      headers: {
        'X-API-Key': cfg.apiKey || '',
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
 * Obtiene el catalogo de un negocio como "vista de catalogo" normalizada
 * (ver infra/gateways/zuyuMapper.js). El mapper es el anti-corruption layer:
 * conectado o mock, las rutas reciben SIEMPRE el mismo shape.
 *
 * @returns {object|null} vista de catalogo, o null si el negocio no existe (mock)
 */
async function getCatalogo(slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return getCatalogoMock(slug);
  }

  // En modo real, ZUYU resuelve el negocio desde el API key. El mapper
  // absorbe el shape de ZUYU — las vistas nunca lo ven crudo.
  const data = await fetchZuyu('/catalog', cfg);
  return toCatalogoVista(data, slug);
}

/**
 * Crea un pedido en ZUYU. ZUYU verifica/decrementa stock atomicamente y crea
 * una Venta real con canalVenta='micrositio'.
 *
 * @param {string} slug
 * @param {object} pedidoData - { referenciaExterna, cliente, productos[], metodoPago, costoEnvio, notas }
 * @returns {object|null} respuesta de ZUYU, o null si el negocio esta en mock
 */
async function crearPedido(slug, pedidoData) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  } // en mock, pedidoService maneja stock localmente

  return fetchZuyu('/orders', cfg, {
    method: 'POST',
    body: JSON.stringify(pedidoData),
  });
}

/**
 * Consulta el estado de un pedido en ZUYU por su referencia.
 */
async function getEstadoPedido(referenciaExterna, slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  }
  return fetchZuyu(`/orders/${encodeURIComponent(referenciaExterna)}`, cfg);
}

/**
 * Cancela un pedido en ZUYU por su referencia. ZUYU marca la Venta como
 * CANCELADA, devuelve el stock reservado y emite el evento pedido_cancelado.
 * Es idempotente: cancelar dos veces no revierte el stock dos veces.
 *
 * @param {string} slug
 * @param {string} referenciaExterna
 * @param {string} [motivo] - motivo libre de la cancelacion (auditoria)
 * @returns {object|null} respuesta de ZUYU, o null si el negocio esta en mock
 */
async function cancelarPedido(slug, referenciaExterna, motivo) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  } // en mock, pedidoService maneja el stock localmente

  return fetchZuyu(`/orders/${encodeURIComponent(referenciaExterna)}/cancel`, cfg, {
    method: 'POST',
    body: JSON.stringify(motivo ? { motivo } : {}),
  });
}

/**
 * Healthcheck del API de ZUYU para un negocio.
 */
async function ping(slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return { ok: true, mode: 'mock' };
  }
  try {
    const r = await fetchZuyu('/health', cfg);
    return { ok: r.status === 'ok', ...r };
  } catch (e) {
    logger.error({ err: e.message }, 'ZUYU ping failed');
    return { ok: false, error: e.message };
  }
}

/**
 * True si el negocio esta conectado a ZUYU (no en modo mock).
 */
async function estaConectado(slug) {
  const cfg = await resolverConfig(slug);
  return cfg.conectado;
}

// ── MODO MOCK: usa el MongoDB local del micrositio ─────────────────
// Devuelve el mismo shape que el modo conectado — el mapper lo normaliza.
async function getCatalogoMock(slug) {
  const negocio = await Negocio.findOne({ slug, activo: true }).lean();
  if (!negocio) {
    return null;
  }
  const productos = await Producto.find({ negocioId: negocio._id, activo: true })
    .select('nombre descripcion precio stock categoria imagen')
    .lean();

  return toCatalogoVista({ negocio, productos }, slug);
}

module.exports = {
  resolverConfig,
  getCatalogo,
  crearPedido,
  getEstadoPedido,
  cancelarPedido,
  ping,
  estaConectado,
};
