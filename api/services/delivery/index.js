/**
 * Capa de abstraccion multi-carrier
 * Daniel acepta mocks; en produccion ZUYU usaria los providers reales
 */
const ivoy = require('./providers/ivoy');
const lalamove = require('./providers/lalamove');
const uberDirect = require('./providers/uberDirect');
const logger = require('../../utils/logger');

const providers = { ivoy, lalamove, uberDirect };

function getProvider(name) {
  const proveedor = providers[name];
  if (!proveedor) {
    throw new Error(`Provider de delivery desconocido: ${name}`);
  }
  return proveedor;
}

/**
 * Selecciona el carrier óptimo según la ciudad del negocio (bonus multi-carrier).
 * Reglas:
 *   - CDMX / EdoMex        → iVoy (cobertura local, tarifa baja)
 *   - Guadalajara/Monterrey → Lalamove (mejor cobertura ZMM)
 *   - Otras (nacional)     → Uber Direct (68 ciudades)
 * Si el negocio tiene `deliveryProvider` explícito en BD, ese gana (override).
 */
function selectProviderByCity(negocio) {
  if (negocio?.deliveryProvider) {
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

/**
 * Solicita un repartidor al carrier indicado
 * @param {string} providerName - 'ivoy' | 'lalamove' | 'uberDirect'
 * @param {object} pedido - documento del pedido
 * @returns {object} { deliveryId, trackingUrl, estado, costoEnvio }
 */
async function requestDelivery(providerName, pedido) {
  const proveedor = getProvider(providerName);
  logger.info({ pedidoId: pedido.pedidoId, providerName }, 'Solicitando repartidor');
  return proveedor.requestDelivery(pedido);
}

async function getStatus(providerName, deliveryId) {
  return getProvider(providerName).getStatus(deliveryId);
}

async function cancelDelivery(providerName, deliveryId) {
  return getProvider(providerName).cancelDelivery(deliveryId);
}

/**
 * Verifica firma de un webhook entrante segun el provider
 */
function verifyWebhook(providerName, body, headers) {
  return getProvider(providerName).verifyWebhook(body, headers);
}

/**
 * Parsea webhook entrante a formato comun: { deliveryId, estado, repartidor }
 */
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
