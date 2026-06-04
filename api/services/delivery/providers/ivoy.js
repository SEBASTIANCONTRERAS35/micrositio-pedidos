const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');
const logger = require('../../../utils/logger');
const { construirOrigenEnvio } = require('../../../domain/envio');

const BASE_URL = process.env.IVOY_BASE_URL || 'https://sandbox.ivoy.mx/api';
const IS_MOCK = process.env.IVOY_MOCK === 'true';

// Crea una orden de envio en iVoy y devuelve datos del delivery.
async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    return mockResponse(pedido);
  }

  const autenticacion = Buffer.from(
    `${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`
  ).toString('base64');
  const origen = construirOrigenEnvio(negocio);

  const respuesta = await fetch(`${BASE_URL}/express/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${autenticacion}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup: {
        address: origen.address,
      },
      dropoff: {
        address: pedido.cliente.direccion,
        contact: {
          name: pedido.cliente.nombre,
          phone: pedido.cliente.telefono,
        },
      },
      reference: pedido.pedidoId,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`iVoy returned ${respuesta.status}: ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  return {
    deliveryId: datos.id || datos.orderId,
    trackingUrl: datos.trackingUrl,
    estado: 'pending',
    costoEnvio: datos.cost || 49,
  };
}

// Consulta el estado actual de una orden de envio en iVoy.
async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }

  const autenticacion = Buffer.from(
    `${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`
  ).toString('base64');

  const respuesta = await fetch(`${BASE_URL}/express/orders/${deliveryId}`, {
    headers: { Authorization: `Basic ${autenticacion}` },
  });

  if (!respuesta.ok) {
    throw new Error(`iVoy status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  return { estado: mapEstado(datos.status) };
}

// Cancela una orden de envio en iVoy y devuelve ok segun el status real.
async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const autenticacion = Buffer.from(
    `${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`
  ).toString('base64');
  const respuesta = await fetch(
    `${BASE_URL}/express/orders/${encodeURIComponent(deliveryId)}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${autenticacion}` },
    }
  );
  if (!respuesta.ok) {
    return { ok: false, reason: `iVoy cancel respondió ${respuesta.status}` };
  }
  return { ok: true };
}

// Verifica el webhook de iVoy mediante token/firma HMAC compartido.
function verifyWebhook(body, headers) {
  const secret = process.env.WEBHOOK_SECRET_IVOY;
  if (!secret) {
    logger.warn('WEBHOOK_SECRET_IVOY no configurado, webhooks no verificados');
    return true;
  }

  const signature = headers['x-ivoy-signature'];
  const timestamp = headers['x-ivoy-timestamp'];

  if (!isTimestampValid(timestamp)) {
    return false;
  }
  return verifyHmacSignature(body, signature, secret);
}

// Normaliza el cuerpo del webhook de iVoy a la forma interna del delivery.
function parseWebhook(body) {
  return {
    deliveryId: body.orderId || body.id,
    estado: mapEstado(body.status),
    repartidor: body.driver ? { nombre: body.driver.name, telefono: body.driver.phone } : null,
  };
}

// Mapea los estados de iVoy a los estados internos del sistema.
function mapEstado(ivoyStatus) {
  const map = {
    accepted: 'pending',
    picking_up: 'pickup',
    in_transit: 'pickup',
    delivered: 'delivered',
    cancelled: 'cancelled',
    failed: 'failed',
  };
  return map[ivoyStatus] || 'pending';
}

// Genera una respuesta simulada de delivery para el modo mock.
function mockResponse(pedido) {
  return {
    deliveryId: `ivoy-mock-${pedido.pedidoId}`,
    trackingUrl: `https://mock.ivoy.mx/track/${pedido.pedidoId}`,
    estado: 'pending',
    costoEnvio: 49,
  };
}

module.exports = {
  requestDelivery,
  getStatus,
  cancelDelivery,
  verifyWebhook,
  parseWebhook,
};
