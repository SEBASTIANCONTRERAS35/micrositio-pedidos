/**
 * Lalamove provider — para CDMX/ZMVM
 * Por defecto en MOCK (LALAMOVE_MOCK=true)
 * En produccion: HMAC-SHA256 con timestamp
 * Doc: https://developers.lalamove.com/
 */
const crypto = require('crypto');
const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');
const { construirOrigenEnvio } = require('../../../domain/envio');

const IS_MOCK = process.env.LALAMOVE_MOCK !== 'false';
const BASE_URL = process.env.LALAMOVE_BASE_URL || 'https://rest.sandbox.lalamove.com/v3';

/**
 * Firma una request al API de Lalamove v3 (HMAC-SHA256). Centraliza el
 * esquema de firma para que requestDelivery y getStatus no lo dupliquen.
 * @param {string} method - 'GET' | 'POST'
 * @param {string} path - ruta firmada, ej. '/v3/orders' o '/v3/orders/123'
 * @param {string} [body] - body crudo (vacío en GET)
 * @returns {{ timestamp: number, header: string }}
 */
function firmarLalamove(method, path, body = '') {
  const timestamp = Date.now();
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = crypto
    .createHmac('sha256', process.env.LALAMOVE_API_SECRET)
    .update(rawSignature)
    .digest('hex');
  return {
    timestamp,
    header: `hmac ${process.env.LALAMOVE_API_KEY}:${timestamp}:${signature}`,
  };
}

async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    return {
      deliveryId: `lalamove-mock-${pedido.pedidoId}`,
      trackingUrl: `https://mock.lalamove.com/track/${pedido.pedidoId}`,
      estado: 'pending',
      costoEnvio: 35,
    };
  }

  // Implementacion real con HMAC. El origen (pickup) sale del negocio:
  // Lalamove cotiza por distancia, asi que necesita coordenadas reales.
  const origen = construirOrigenEnvio(negocio);
  const body = JSON.stringify({
    serviceType: 'MOTORCYCLE',
    stops: [
      { coordinates: origen.coordinates, address: origen.address },
      { coordinates: { lat: 0, lng: 0 }, address: pedido.cliente.direccion },
    ],
    requesterContact: { name: origen.name, phone: origen.phone },
    metadata: { pedidoId: pedido.pedidoId },
  });

  const { header } = firmarLalamove('POST', '/v3/orders', body);
  const res = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: header,
      'Content-Type': 'application/json',
      Market: 'MX',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Lalamove returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  return {
    deliveryId: data.orderId,
    trackingUrl: data.shareLink,
    estado: 'pending',
    costoEnvio: parseFloat(data.priceBreakdown?.total || '35'),
  };
}

async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }
  // GET /v3/orders/:id — mismo esquema HMAC que requestDelivery (sin body).
  // encodeURIComponent: el deliveryId va en la URL — defensa de path.
  const id = encodeURIComponent(deliveryId);
  const { header } = firmarLalamove('GET', `/v3/orders/${id}`);
  const res = await fetch(`${BASE_URL}/orders/${id}`, {
    headers: { Authorization: header, Market: 'MX' },
  });
  if (!res.ok) {
    throw new Error(`Lalamove status returned ${res.status}`);
  }
  const data = await res.json();
  return { estado: mapEstado(data.status || (data.order && data.order.status)) };
}

async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  // DELETE /v3/orders/:id — mismo esquema HMAC que requestDelivery.
  const id = encodeURIComponent(deliveryId);
  const { header } = firmarLalamove('DELETE', `/v3/orders/${id}`);
  const res = await fetch(`${BASE_URL}/orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: header, Market: 'MX' },
  });
  return { ok: res.ok };
}

function verifyWebhook(body, headers) {
  const secret = process.env.WEBHOOK_SECRET_LALAMOVE;
  if (!secret) {
    return true;
  } // dev only
  const signature = headers['x-lalamove-signature'];
  const timestamp = headers['x-lalamove-timestamp'];
  if (!isTimestampValid(timestamp)) {
    return false;
  }
  return verifyHmacSignature(`${timestamp}.${body}`, signature, secret);
}

function parseWebhook(body) {
  return {
    deliveryId: body.orderId,
    estado: mapEstado(body.status),
    repartidor: body.driver
      ? { nombre: body.driver.name, telefono: body.driver.phone, foto: body.driver.photo }
      : null,
  };
}

function mapEstado(s) {
  const map = {
    ASSIGNING_DRIVER: 'pending',
    ON_GOING: 'pickup',
    PICKED_UP: 'pickup',
    COMPLETED: 'delivered',
    CANCELED: 'cancelled',
    REJECTED: 'failed',
    EXPIRED: 'failed',
  };
  return map[s] || 'pending';
}

module.exports = { requestDelivery, getStatus, cancelDelivery, verifyWebhook, parseWebhook };
