const crypto = require('crypto');
const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');
const { construirOrigenEnvio } = require('../../../domain/envio');

const IS_MOCK = process.env.LALAMOVE_MOCK !== 'false';
const BASE_URL = process.env.LALAMOVE_BASE_URL || 'https://rest.sandbox.lalamove.com/v3';

// Firma una request al API de Lalamove v3 con HMAC-SHA256.
function firmarLalamove(method, path, body = '') {
  const timestamp = Date.now();
  const firmaCruda = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const firma = crypto
    .createHmac('sha256', process.env.LALAMOVE_API_SECRET)
    .update(firmaCruda)
    .digest('hex');
  return {
    timestamp,
    header: `hmac ${process.env.LALAMOVE_API_KEY}:${timestamp}:${firma}`,
  };
}

// Solicita un envio a Lalamove (mock o real con HMAC) y devuelve sus datos.
async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    return {
      deliveryId: `lalamove-mock-${pedido.pedidoId}`,
      trackingUrl: `https://mock.lalamove.com/track/${pedido.pedidoId}`,
      estado: 'pending',
      costoEnvio: 35,
    };
  }

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
  const respuesta = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: header,
      'Content-Type': 'application/json',
      Market: 'MX',
    },
    body,
  });

  if (!respuesta.ok) {
    throw new Error(`Lalamove returned ${respuesta.status}: ${await respuesta.text()}`);
  }
  const datos = await respuesta.json();

  return {
    deliveryId: datos.orderId,
    trackingUrl: datos.shareLink,
    estado: 'pending',
    costoEnvio: parseFloat(datos.priceBreakdown?.total || '35'),
  };
}

// Consulta el estado de un envio en Lalamove por su deliveryId.
async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }
  const id = encodeURIComponent(deliveryId);
  const { header } = firmarLalamove('GET', `/v3/orders/${id}`);
  const respuesta = await fetch(`${BASE_URL}/orders/${id}`, {
    headers: { Authorization: header, Market: 'MX' },
  });
  if (!respuesta.ok) {
    throw new Error(`Lalamove status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  return { estado: mapEstado(datos.status || (datos.order && datos.order.status)) };
}

// Cancela un envio en Lalamove por su deliveryId.
async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const id = encodeURIComponent(deliveryId);
  const { header } = firmarLalamove('DELETE', `/v3/orders/${id}`);
  const respuesta = await fetch(`${BASE_URL}/orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: header, Market: 'MX' },
  });
  return { ok: respuesta.ok };
}

// Verifica la firma HMAC y timestamp de un webhook de Lalamove.
function verifyWebhook(body, headers) {
  const secret = process.env.WEBHOOK_SECRET_LALAMOVE;
  if (!secret) {
    return true;
  }
  const signature = headers['x-lalamove-signature'];
  const timestamp = headers['x-lalamove-timestamp'];
  if (!isTimestampValid(timestamp)) {
    return false;
  }
  return verifyHmacSignature(`${timestamp}.${body}`, signature, secret);
}

// Normaliza el payload de un webhook de Lalamove a la forma interna.
function parseWebhook(body) {
  return {
    deliveryId: body.orderId,
    estado: mapEstado(body.status),
    repartidor: body.driver
      ? { nombre: body.driver.name, telefono: body.driver.phone, foto: body.driver.photo }
      : null,
  };
}

// Mapea el estado de Lalamove al estado interno de envio.
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
