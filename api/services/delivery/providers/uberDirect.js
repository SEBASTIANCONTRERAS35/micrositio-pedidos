/**
 * Uber Direct provider — cobertura nacional MX (68 ciudades)
 * Por defecto en MOCK
 * Doc: https://developer.uber.com/docs/deliveries/overview
 */
const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');

const IS_MOCK = process.env.UBER_MOCK !== 'false';
const BASE_URL = process.env.UBER_BASE_URL || 'https://api.uber.com/v1';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch('https://login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.UBER_CLIENT_ID,
      client_secret: process.env.UBER_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries',
    }),
  });

  if (!res.ok) {
    throw new Error(`Uber OAuth returned ${res.status}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function requestDelivery(pedido) {
  if (IS_MOCK) {
    return {
      deliveryId: `uber-mock-${pedido.pedidoId}`,
      trackingUrl: `https://mock.uber.com/track/${pedido.pedidoId}`,
      estado: 'pending',
      costoEnvio: 49,
    };
  }

  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;

  const res = await fetch(`${BASE_URL}/customers/${customerId}/deliveries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_address: 'TODO: direccion del negocio',
      pickup_name: 'Negocio',
      pickup_phone_number: '+525555555555',
      dropoff_address: pedido.cliente.direccion,
      dropoff_name: pedido.cliente.nombre,
      dropoff_phone_number: pedido.cliente.telefono,
      manifest_items: pedido.productos.map((p) => ({
        name: p.nombre,
        quantity: p.cantidad,
        price: Math.round(p.precioUnitario * 100), // centavos
      })),
      external_id: pedido.pedidoId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Uber Direct returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  return {
    deliveryId: data.id,
    trackingUrl: data.tracking_url,
    estado: 'pending',
    costoEnvio: (data.fee || 4900) / 100,
  };
}

async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const res = await fetch(`${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Uber status returned ${res.status}`);
  }
  const data = await res.json();
  return { estado: mapEstado(data.status) };
}

async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const res = await fetch(`${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok };
}

function verifyWebhook(body, headers) {
  const secret = process.env.WEBHOOK_SECRET_UBER;
  if (!secret) {
    return true;
  } // dev only
  const signature = headers['x-uber-signature'];
  // Uber no envia timestamp explicito, depende del header X-Uber-Date
  return verifyHmacSignature(body, signature, secret);
}

function parseWebhook(body) {
  return {
    deliveryId: body.delivery_id || body.id,
    estado: mapEstado(body.status),
    repartidor: body.courier
      ? {
          nombre: body.courier.name,
          telefono: body.courier.phone_number,
          foto: body.courier.img_href,
        }
      : null,
  };
}

function mapEstado(s) {
  const map = {
    pending: 'pending',
    pickup: 'pickup',
    pickup_complete: 'pickup',
    dropoff: 'dropoff',
    delivered: 'delivered',
    canceled: 'cancelled',
    returned: 'failed',
  };
  return map[s] || 'pending';
}

module.exports = { requestDelivery, getStatus, cancelDelivery, verifyWebhook, parseWebhook };
