const { verifyHmacSignature } = require('../../../utils/hmac');
const logger = require('../../../utils/logger');
const { construirOrigenEnvio } = require('../../../domain/envio');

const IS_MOCK = process.env.UBER_MOCK !== 'false';
const BASE_URL = process.env.UBER_BASE_URL || 'https://api.uber.com/v1';

let tokenCacheado = null;
let tokenExpiraEn = 0;

// Obtiene y cachea el token OAuth de Uber hasta su expiracion.
async function getAccessToken() {
  if (tokenCacheado && Date.now() < tokenExpiraEn) {
    return tokenCacheado;
  }

  const inicio = Date.now();
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
  const durationMs = Date.now() - inicio;

  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'uberDirect',
        operacion: 'oauth',
        httpStatus: respuesta.status,
        durationMs,
      },
      'Uber Direct fallo al renovar el token OAuth'
    );
    throw new Error(`Uber OAuth returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  tokenCacheado = datos.access_token;
  tokenExpiraEn = Date.now() + (datos.expires_in - 60) * 1000;
  logger.debug(
    {
      event: 'delivery.solicitado',
      provider: 'uberDirect',
      operacion: 'oauth',
      httpStatus: respuesta.status,
      durationMs,
      expiresIn: datos.expires_in,
    },
    'Token OAuth de Uber Direct renovado'
  );
  return tokenCacheado;
}

// Crea una entrega en Uber Direct para el pedido del negocio.
async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    logger.debug(
      {
        event: 'delivery.solicitado',
        provider: 'uberDirect',
        pedidoId: pedido.pedidoId,
        mock: true,
      },
      'Uber Direct en modo mock: respuesta simulada de repartidor'
    );
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

  const inicio = Date.now();
  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}/customers/${customerId}/deliveries`, {
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
        manifest_items: pedido.productos.map((producto) => ({
          name: producto.nombre,
          quantity: producto.cantidad,
          price: Math.round(producto.precioUnitario * 100),
        })),
        external_id: pedido.pedidoId,
      }),
    });
  } catch (err) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'uberDirect',
        pedidoId: pedido.pedidoId,
        durationMs: Date.now() - inicio,
        err: err.message,
      },
      'Fallo de red al solicitar repartidor a Uber Direct'
    );
    throw err;
  }
  const durationMs = Date.now() - inicio;

  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'uberDirect',
        pedidoId: pedido.pedidoId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'Uber Direct rechazo la solicitud de repartidor'
    );
    throw new Error(`Uber Direct returned ${respuesta.status}: ${await respuesta.text()}`);
  }
  const datos = await respuesta.json();

  logger.info(
    {
      event: 'delivery.solicitado',
      provider: 'uberDirect',
      pedidoId: pedido.pedidoId,
      deliveryId: datos.id,
      httpStatus: respuesta.status,
      durationMs,
    },
    'Repartidor solicitado a Uber Direct'
  );
  return {
    deliveryId: datos.id,
    trackingUrl: datos.tracking_url,
    estado: 'pending',
    costoEnvio: (datos.fee || 4900) / 100,
  };
}

// Consulta el estado actual de una entrega por su ID.
async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const inicio = Date.now();
  const respuesta = await fetch(`${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const durationMs = Date.now() - inicio;
  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'uberDirect',
        deliveryId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'Uber Direct fallo al consultar estado del envio'
    );
    throw new Error(`Uber status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  logger.debug(
    {
      event: 'delivery.solicitado',
      provider: 'uberDirect',
      deliveryId,
      httpStatus: respuesta.status,
      durationMs,
    },
    'Estado de envio consultado en Uber Direct'
  );
  return { estado: mapEstado(datos.status) };
}

// Cancela una entrega existente por su ID.
async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const token = await getAccessToken();
  const customerId = process.env.UBER_CUSTOMER_ID;
  const inicio = Date.now();
  const respuesta = await fetch(
    `${BASE_URL}/customers/${customerId}/deliveries/${deliveryId}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const durationMs = Date.now() - inicio;
  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'uberDirect',
        deliveryId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'Uber Direct fallo al cancelar el envio'
    );
  } else {
    logger.info(
      {
        event: 'delivery.cancelado',
        provider: 'uberDirect',
        deliveryId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'Envio cancelado en Uber Direct'
    );
  }
  return { ok: respuesta.ok };
}

// Verifica la firma HMAC del webhook entrante de Uber.
function verifyWebhook(body, headers) {
  const secreto = process.env.WEBHOOK_SECRET_UBER;
  if (!secreto) {
    return true;
  }
  const firma = headers['x-uber-signature'];
  return verifyHmacSignature(body, firma, secreto);
}

// Normaliza el cuerpo del webhook de Uber a un formato interno.
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

// Mapea el estado de Uber al estado interno del sistema.
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
