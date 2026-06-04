const ivoy = require('./providers/ivoy');
const lalamove = require('./providers/lalamove');
const uberDirect = require('./providers/uberDirect');
const logger = require('../../utils/logger');

const providers = { ivoy, lalamove, uberDirect };

// Obtiene el provider de delivery por nombre o lanza error si no existe
function getProvider(name) {
  const proveedor = providers[name];
  if (!proveedor) {
    throw new Error(`Provider de delivery desconocido: ${name}`);
  }
  return proveedor;
}

// Selecciona el carrier optimo: override explicito del negocio o por ciudad
function selectProviderByCity(negocio) {
  // Override por campo: si el negocio fija un carrier (no "auto"), se respeta.
  if (negocio?.deliveryProvider && negocio.deliveryProvider !== 'auto') {
    return negocio.deliveryProvider;
  }
  const ciudad = (negocio?.direccion?.ciudad || '').toLowerCase();
  if (ciudad.includes('cdmx') || ciudad.includes('mexico') || ciudad.includes('méxico')) {
    return 'ivoy';
  }
  if (ciudad.includes('guadalajara') || ciudad.includes('monterrey')) {
    return 'lalamove';
  }
  return 'uberDirect';
}

// Solicita un repartidor al carrier indicado
async function requestDelivery(providerName, pedido) {
  const proveedor = getProvider(providerName);
  logger.info({ pedidoId: pedido.pedidoId, providerName }, 'Solicitando repartidor');
  return proveedor.requestDelivery(pedido);
}

// Consulta el estado de un delivery en el carrier indicado
async function getStatus(providerName, deliveryId) {
  return getProvider(providerName).getStatus(deliveryId);
}

// Cancela un delivery en el carrier indicado
async function cancelDelivery(providerName, deliveryId) {
  return getProvider(providerName).cancelDelivery(deliveryId);
}

// Verifica firma de un webhook entrante segun el provider
function verifyWebhook(providerName, body, headers) {
  return getProvider(providerName).verifyWebhook(body, headers);
}

// Parsea webhook entrante a formato comun
function parseWebhook(providerName, body) {
  return getProvider(providerName).parseWebhook(body);
}

module.exports = {
  requestDelivery,
  getStatus,
  cancelDelivery,
  verifyWebhook,
  parseWebhook,
  selectProviderByCity,
};
