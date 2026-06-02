/**
 * Uber Direct provider — cobertura nacional MX (68 ciudades)
 * Por defecto en MOCK
 * Doc: https://developer.uber.com/docs/deliveries/overview
 */
const { verifyHmacSignature } = require('../../../utils/hmac');
const { construirOrigenEnvio } = require('../../../domain/envio');

const IS_MOCK = process.env.UBER_MOCK !== 'false';
const BASE_URL = process.env.UBER_BASE_URL || 'https://api.uber.com/v1';

let tokenCacheado = null;
let tokenExpiraEn = 0;

async function getAccessToken() {
  if (tokenCacheado && Date.now() < tokenExpiraEn) {
    return tokenCacheado;
  }

  const respuesta = await fetch('https://login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.UBER_CLIENT_ID,
      client_secret: process.env.UBER_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries',
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Uber OAuth returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  tokenCacheado = datos.access_token;
  tokenExpiraEn = Date.now() + (datos.expires_in - 60) * 1000;
  return tokenCacheado;
}

async function requestDelivery(pedido, negocio) {
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
  const origen = construirOrigenEnvio(negocio);

  const respuesta = await fetch(`${BASE_URL}/customers/${customerId}/deliveries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_address: origen.address,
      pickup_name: origen.name,
      // Uber exige un telefono de pickup; fallback si el negocio no lo tiene.
      pickup_phone_number: origen.phone || '+525555555555',
      dropoff_address: pedido.cliente.direccion,
      dropoff_name: pedido.cliente.nombre,
      dropoff_phone_number: pedido.cliente.telefono,
      manifest_items: pedido.productos.map((producto) => ({
        name: producto.nombre,
        quantity: producto.cantidad,
        price: Math.round(producto.precioUnitario * 100), // centavos
      })),
      external_id: pedido.pedidoId,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Uber Direct returned ${respuesta.status}: ${await respuesta.text()}`);
  }
  const datos = await respuesta.json();

  return {
    deliveryId: datos.id,
    trackingUrl: datos.tracking_url,
    estado: 'pending',
    costoEnvio: (datos.fee || 4900) / 100,
  };
}

async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const respuesta = await fetch(`${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error(`Uber status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  return { estado: mapEstado(datos.status) };
}

async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const respuesta = await fetch(
    `${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return { ok: respuesta.ok };
}

function verifyWebhook(body, headers) {
  const secreto = process.env.WEBHOOK_SECRET_UBER;
  if (!secreto) {
    return true;
  } // dev only
  const firma = headers['x-uber-signature'];
  // Uber no envia timestamp explicito, depende del header X-Uber-Date
  return verifyHmacSignature(body, firma, secreto);
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
  const mapa = {
    pending: 'pending',
    pickup: 'pickup',
    pickup_complete: 'pickup',
    dropoff: 'dropoff',
    delivered: 'delivered',
    canceled: 'cancelled',
    returned: 'failed',
  };
  return mapa[s] || 'pending';
}

module.exports = { requestDelivery, getStatus, cancelDelivery, verifyWebhook, parseWebhook };
