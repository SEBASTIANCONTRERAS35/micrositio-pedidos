const { verifyHmacSignature, isTimestampValid } = require('../../../utils/hmac');
const logger = require('../../../utils/logger');
const { construirOrigenEnvio } = require('../../../domain/envio');

const BASE_URL = process.env.IVOY_BASE_URL || 'https://sandbox.ivoy.mx/api';
const IS_MOCK = process.env.IVOY_MOCK === 'true';

// Crea una orden de envio en iVoy (o respuesta mock) y devuelve sus datos.
async function requestDelivery(pedido, negocio) {
  if (IS_MOCK) {
    logger.debug(
      { event: 'delivery.solicitado', provider: 'ivoy', pedidoId: pedido.pedidoId, mock: true },
      'iVoy en modo mock: respuesta simulada de repartidor'
    );
    return mockResponse(pedido);
  }

  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );
  const origen = construirOrigenEnvio(negocio);

  const inicio = Date.now();
  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}/express/orders`, {
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
  } catch (err) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'ivoy',
        pedidoId: pedido.pedidoId,
        durationMs: Date.now() - inicio,
        err: err.message,
      },
      'Fallo de red al solicitar repartidor a iVoy'
    );
    throw err;
  }
  const durationMs = Date.now() - inicio;

  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'ivoy',
        pedidoId: pedido.pedidoId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'iVoy rechazo la solicitud de repartidor'
    );
    throw new Error(`iVoy returned ${respuesta.status}: ${await respuesta.text()}`);
  }

  const datos = await respuesta.json();
  const deliveryId = datos.id || datos.orderId;
  logger.info(
    {
      event: 'delivery.solicitado',
      provider: 'ivoy',
      pedidoId: pedido.pedidoId,
      deliveryId,
      httpStatus: respuesta.status,
      durationMs,
    },
    'Repartidor solicitado a iVoy'
  );
  return {
    deliveryId,
    trackingUrl: datos.trackingUrl,
    estado: 'pending',
    costoEnvio: datos.cost || 49,
  };
}

// Consulta el estado de una orden de envio en iVoy por su id.
async function getStatus(deliveryId) {
  if (IS_MOCK) {
    return { estado: 'pickup' };
  }

  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );

  const inicio = Date.now();
  const respuesta = await fetch(`${BASE_URL}/express/orders/${deliveryId}`, {
    headers: { Authorization: `Basic ${credencial}` },
  });
  const durationMs = Date.now() - inicio;

  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'ivoy',
        deliveryId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'iVoy fallo al consultar estado del envio'
    );
    throw new Error(`iVoy status returned ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  logger.debug(
    {
      event: 'delivery.solicitado',
      provider: 'ivoy',
      deliveryId,
      httpStatus: respuesta.status,
      durationMs,
    },
    'Estado de envio consultado en iVoy'
  );
  return { estado: mapEstado(datos.status) };
}

// Cancela una orden de envio en iVoy; devuelve ok:false con el status real si falla.
async function cancelDelivery(deliveryId) {
  if (IS_MOCK) {
    return { ok: true };
  }
  const credencial = Buffer.from(`${process.env.IVOY_USER}:${process.env.IVOY_PASSWORD}`).toString(
    'base64'
  );
  const inicio = Date.now();
  const respuesta = await fetch(
    `${BASE_URL}/express/orders/${encodeURIComponent(deliveryId)}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${credencial}` },
    }
  );
  const durationMs = Date.now() - inicio;
  if (!respuesta.ok) {
    logger.error(
      {
        event: 'delivery.carrier.error',
        provider: 'ivoy',
        deliveryId,
        httpStatus: respuesta.status,
        durationMs,
      },
      'iVoy fallo al cancelar el envio'
    );
    return { ok: false, reason: `iVoy cancel respondió ${respuesta.status}` };
  }
  logger.info(
    {
      event: 'delivery.cancelado',
      provider: 'ivoy',
      deliveryId,
      httpStatus: respuesta.status,
      durationMs,
    },
    'Envio cancelado en iVoy'
  );
  return { ok: true };
}

// Verifica el webhook de iVoy mediante token/firma HMAC compartida.
function verifyWebhook(body, headers) {
  const secreto = process.env.WEBHOOK_SECRET_IVOY;
  if (!secreto) {
    logger.warn('WEBHOOK_SECRET_IVOY no configurado, webhooks no verificados');
    return true;
  }

  const firma = headers['x-ivoy-signature'];
  const marcaTiempo = headers['x-ivoy-timestamp'];

  if (!isTimestampValid(marcaTiempo)) {
    return false;
  }
  return verifyHmacSignature(body, firma, secreto);
}

// Normaliza el cuerpo del webhook de iVoy a la estructura interna.
function parseWebhook(body) {
  return {
    deliveryId: body.orderId || body.id,
    estado: mapEstado(body.status),
    repartidor: body.driver ? { nombre: body.driver.name, telefono: body.driver.phone } : null,
  };
}

// Mapea el estado de iVoy al estado interno del sistema.
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

// Genera una respuesta simulada de envio para el modo mock.
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
