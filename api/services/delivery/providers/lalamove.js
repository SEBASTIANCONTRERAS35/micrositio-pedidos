/**
 * Lalamove provider — para CDMX/ZMVM
 * Por defecto en MOCK (LALAMOVE_MOCK=true)
 * En produccion: HMAC-SHA256 con timestamp
 * Doc: https://developers.lalamove.com/
 */
const crypto = require('crypto');
const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');

const IS_MOCK = process.env.LALAMOVE_MOCK !== 'false';
const BASE_URL = process.env.LALAMOVE_BASE_URL || 'https://rest.sandbox.lalamove.com/v3';

async function requestDelivery(pedido) {
  if (IS_MOCK) {
    return {
      deliveryId: `lalamove-mock-${pedido.pedidoId}`,
      trackingUrl: `https://mock.lalamove.com/track/${pedido.pedidoId}`,
      estado: 'pending',
      costoEnvio: 35,
    };
  }

  // Implementacion real con HMAC
  const timestamp = Date.now();
  const body = JSON.stringify({
    serviceType: 'MOTORCYCLE',
    stops: [
      { coordinates: { lat: 19.4326, lng: -99.1332 }, address: 'TODO: direccion del negocio' },
      { coordinates: { lat: 0, lng: 0 }, address: pedido.cliente.direccion },
    ],
    requesterContact: { name: pedido.cliente.nombre, phone: pedido.cliente.telefono },
    metadata: { pedidoId: pedido.pedidoId },
  });

  const rawSignature = `${timestamp}\r\nPOST\r\n/v3/orders\r\n\r\n${body}`;
  const signature = crypto
    .createHmac('sha256', process.env.LALAMOVE_API_SECRET)
    .update(rawSignature)
    .digest('hex');

  const res = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `hmac ${process.env.LALAMOVE_API_KEY}:${timestamp}:${signature}`,
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
  // TODO real
  return { estado: 'pending' };
}

async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  return { ok: false };
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
