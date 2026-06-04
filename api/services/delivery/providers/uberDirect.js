const { verifyHmacSignature } = require('../../../utils/hmac');
const { construirOrigenEnvio } = require('../../../domain/envio');

const IS_MOCK = process.env.UBER_MOCK !== 'false';
const BASE_URL = process.env.UBER_BASE_URL || 'https://api.uber.com/v1';

let tokenCacheado = null;
let tokenExpiraEn = 0;

// Obtiene y cachea el token OAuth de Uber, renovandolo al expirar.
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

// Solicita una entrega a Uber Direct para un pedido y negocio dados.
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
      pickup_phone_number: origen.phone || '+525555555555',
      dropoff_address: pedido.cliente.direccion,
      dropoff_name: pedido.cliente.nombre,
      dropoff_phone_number: pedido.cliente.telefono,
      manifest_items: pedido.productos.map((p) => ({
        name: p.nombre,
        quantity: p.cantidad,
        price: Math.round(p.precioUnitario * 100),
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

// Consulta el estado actual de una entrega por su deliveryId.
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

// Cancela una entrega de Uber Direct por su deliveryId.
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

// Verifica la firma HMAC del webhook entrante de Uber.
function verifyWebhook(body, headers) {
  const secret = process.env.WEBHOOK_SECRET_UBER;
  if (!secret) {
    return true;
  }
  const signature = headers['x-uber-signature'];
  return verifyHmacSignature(body, signature, secret);
}

// Normaliza el payload del webhook a la estructura interna de entrega.
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

// Mapea el estado de Uber al estado interno equivalente.
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
