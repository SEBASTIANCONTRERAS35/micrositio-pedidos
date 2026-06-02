/**
 * iVoy provider
 * Sandbox publico: usuario integracion-express@ivoy.mx / pass sandbox
 * Doc: http://docs.ivoy.mx/express/
 */
const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');
const logger = require('../../../utils/logger');
const { construirOrigenEnvio } = require('../../../domain/envio');

const BASE_URL = process.env.IVOY_BASE_URL || 'https://sandbox.ivoy.mx/api';
const IS_MOCK = process.env.IVOY_MOCK === 'true';

async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    return mockResponse(pedido);
  }

  // Llamada real al sandbox de iVoy
  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );
  const origen = construirOrigenEnvio(negocio);

  const respuesta = await fetch(`${BASE_URL}/express/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credencial}`,
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

async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }

  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );

  const respuesta = await fetch(`${BASE_URL}/express/orders/${deliveryId}`, {
    headers: { Authorization: `Basic ${credencial}` },
  });

  if (!respuesta.ok) {
    throw new Error(`iVoy status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  return { estado: mapEstado(datos.status) };
}

async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  // iVoy Express: cancelación de una orden. Si el sandbox no expone el
  // endpoint (404/405/501), devolvemos ok:false con el status real — el
  // caller decide, sin asumir éxito ciego. encodeURIComponent: defensa de path.
  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );
  const respuesta = await fetch(
    `${BASE_URL}/express/orders/${encodeURIComponent(deliveryId)}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${credencial}` },
    }
  );
  if (!respuesta.ok) {
    return { ok: false, reason: `iVoy cancel respondió ${respuesta.status}` };
  }
  return { ok: true };
}

/**
 * iVoy no documenta firma HMAC publica.
 * Para el proyecto universitario aceptamos un token compartido en header.
 */
function verifyWebhook(body, headers) {
  const secreto = process.env.WEBHOOK_SECRET_IVOY;
  if (!secreto) {
    logger.warn('WEBHOOK_SECRET_IVOY no configurado, webhooks no verificados');
    return true; // dev only
  }

  const firma = headers['x-ivoy-signature'];
  const marcaTiempo = headers['x-ivoy-timestamp'];

  if (!isTimestampValid(marcaTiempo)) {
    return false;
  }
  return verifyHmacSignature(body, firma, secreto);
}

function parseWebhook(body) {
  return {
    deliveryId: body.orderId || body.id,
    estado: mapEstado(body.status),
    repartidor: body.driver ? { nombre: body.driver.name, telefono: body.driver.phone } : null,
  };
}

function mapEstado(ivoyStatus) {
  const mapa = {
    accepted: 'pending',
    picking_up: 'pickup',
    in_transit: 'pickup',
    delivered: 'delivered',
    cancelled: 'cancelled',
    failed: 'failed',
  };
  return mapa[ivoyStatus] || 'pending';
}

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
