const logger = require('../utils/logger');
const Producto = require('../models/producto');
const Negocio = require('../models/negocio');
const { decryptSecret } = require('../utils/crypto');
const { toCatalogoVista } = require('../infra/gateways/zuyuMapper');

const TIMEOUT_MS = parseInt(process.env.ZUYU_TIMEOUT_MS || '8000', 10);

// Resuelve la config de ZUYU para un negocio. DB primero, env como fallback.
async function resolverConfig(slug) {
  let cfg = {};
  if (slug) {
    const negocio = await Negocio.findOne({ slug })
      .select('+zuyuConfig.apiKey +zuyuConfig.webhookSecret +zuyuConfig.webhookSecretPrevio')
      .lean();
    cfg = negocio?.zuyuConfig || {};
  }

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

  const flagUI = cfg.conectado === true;
  const flagEnv = process.env.ZUYU_MOCK === 'false';
  const conectado = (flagUI || flagEnv) && !!apiKey;

  return { conectado, baseUrl, apiKey, webhookSecret, webhookSecretPrevio };
}

// fetch con timeout + header de auth; lanza Error con .status si no es OK.
// Punto central de salida a ZUYU: aqui se loguea TODO fallo (zuyu.api.error)
// con status/code/timeout, sin exponer nunca el apiKey ni el cuerpo con PII.
async function fetchZuyu(path, cfg, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const inicio = Date.now();
  try {
    let res;
    try {
      res = await fetch(`${cfg.baseUrl}/api/public/v1${path}`, {
        ...options,
        headers: {
          'X-API-Key': cfg.apiKey || '',
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError = timeout; cualquier otro = fallo de red.
      const esTimeout = err.name === 'AbortError';
      logger.error(
        {
          event: 'zuyu.api.error',
          path,
          method: options.method || 'GET',
          code: esTimeout ? 'ZUYU_TIMEOUT' : 'ZUYU_NETWORK_ERROR',
          timeout: esTimeout,
          timeoutMs: esTimeout ? TIMEOUT_MS : undefined,
          durationMs: Date.now() - inicio,
        },
        esTimeout ? 'Timeout llamando a la API de ZUYU' : 'Fallo de red llamando a la API de ZUYU'
      );
      throw err;
    }
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
      logger.error(
        {
          event: 'zuyu.api.error',
          path,
          method: options.method || 'GET',
          status: res.status,
          code: err.code,
          timeout: false,
          durationMs: Date.now() - inicio,
        },
        'La API de ZUYU respondio con error'
      );
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Obtiene el catalogo de un negocio como vista normalizada (o mock).
async function getCatalogo(slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    logger.debug(
      { event: 'zuyu.mock', negocioSlug: slug, fuente: 'local' },
      'Catalogo servido en modo mock (negocio no conectado a ZUYU)'
    );
    return getCatalogoMock(slug);
  }

  logger.debug(
    { event: 'zuyu.conectado', negocioSlug: slug, baseUrl: cfg.baseUrl },
    'Catalogo servido desde la API de ZUYU'
  );
  const data = await fetchZuyu('/catalog', cfg);
  return toCatalogoVista(data, slug);
}

// Crea un pedido en ZUYU (verifica/decrementa stock y crea Venta real).
async function crearPedido(slug, pedidoData) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  }

  return fetchZuyu('/orders', cfg, {
    method: 'POST',
    body: JSON.stringify(pedidoData),
  });
}

// Consulta el estado de un pedido en ZUYU por su referencia.
async function getEstadoPedido(referenciaExterna, slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  }
  return fetchZuyu(`/orders/${encodeURIComponent(referenciaExterna)}`, cfg);
}

// Cancela un pedido en ZUYU por su referencia (idempotente, devuelve stock).
async function cancelarPedido(slug, referenciaExterna, motivo) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    return null;
  }

  return fetchZuyu(`/orders/${encodeURIComponent(referenciaExterna)}/cancel`, cfg, {
    method: 'POST',
    body: JSON.stringify(motivo ? { motivo } : {}),
  });
}

// Healthcheck del API de ZUYU para un negocio.
async function ping(slug) {
  const cfg = await resolverConfig(slug);
  if (!cfg.conectado) {
    logger.debug(
      { event: 'zuyu.mock', negocioSlug: slug },
      'Ping a ZUYU omitido (negocio en modo mock)'
    );
    return { ok: true, mode: 'mock' };
  }
  try {
    const r = await fetchZuyu('/health', cfg);
    const ok = r.status === 'ok';
    logger.info(
      { event: ok ? 'zuyu.ping.ok' : 'zuyu.ping.fail', negocioSlug: slug, status: r.status },
      ok ? 'ZUYU respondio al healthcheck' : 'ZUYU respondio degradado al healthcheck'
    );
    return { ok, ...r };
  } catch (e) {
    // fetchZuyu ya emitio zuyu.api.error con el detalle; aqui solo el resultado.
    logger.warn({ event: 'zuyu.ping.fail', negocioSlug: slug }, 'Healthcheck de ZUYU fallido');
    return { ok: false, error: e.message };
  }
}

// Auditoria de cambio de la integracion ZUYU de un negocio. Loguea SOLO flags
// (que se roto/conecto), nunca apiKey/webhookSecret. Lo usa el panel del dueno.
function logIntegracionActualizada({
  negocioId,
  negocioSlug,
  usuarioId,
  conectado,
  baseUrl,
  apiKeyRotada,
  webhookSecretRotado,
} = {}) {
  logger.info(
    {
      event: 'integracion.actualizada',
      negocioId: negocioId ? String(negocioId) : undefined,
      negocioSlug,
      usuarioId: usuarioId ? String(usuarioId) : undefined,
      conectado,
      baseUrl,
      apiKeyRotada: !!apiKeyRotada,
      webhookSecretRotado: !!webhookSecretRotado,
    },
    'Integracion ZUYU del negocio actualizada'
  );
}

// True si el negocio esta conectado a ZUYU (no en modo mock).
async function estaConectado(slug) {
  const cfg = await resolverConfig(slug);
  return cfg.conectado;
}

// Devuelve el catalogo desde el MongoDB local del micrositio (modo mock).
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
  logIntegracionActualizada,
};
