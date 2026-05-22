/**
 * Dominio puro — origen del envío (punto de recolección / pickup).
 *
 * Sin I/O: recibe el documento Negocio (o un objeto plano) y devuelve el DTO
 * que los providers de delivery necesitan para el pickup. Aísla a los
 * providers de la forma del modelo Negocio (anti-corruption).
 */
'use strict';

// Fallback de coordenadas: centro de CDMX. Lalamove exige lat/lng; si el
// negocio aún no las tiene configuradas, usamos este punto por defecto.
const COORDENADAS_FALLBACK = Object.freeze({ lat: 19.4326, lng: -99.1332 });

/**
 * Une los campos de una dirección estructurada en una línea legible.
 * @param {object} [direccion] - { calle, colonia, ciudad, estado, cp }
 * @returns {string} dirección en una línea, o '' si no hay datos
 */
function formatearDireccion(direccion) {
  if (!direccion || typeof direccion !== 'object') {
    return '';
  }
  return [direccion.calle, direccion.colonia, direccion.ciudad, direccion.estado, direccion.cp]
    .map((parte) => (typeof parte === 'string' ? parte.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/**
 * Construye el origen del envío (pickup) que consumen los providers.
 * @param {object} [negocio] - doc Negocio: { nombre, telefono, direccion, ubicacion }
 * @returns {{ address: string, name: string, phone: string,
 *   coordinates: { lat: number, lng: number } }}
 */
function construirOrigenEnvio(negocio) {
  const n = negocio || {};
  const direccion = formatearDireccion(n.direccion);
  const ubic = n.ubicacion || {};
  const tieneCoords = Number.isFinite(ubic.lat) && Number.isFinite(ubic.lng);
  return {
    address: direccion || 'Dirección del negocio no configurada',
    name: (typeof n.nombre === 'string' && n.nombre.trim()) || 'Negocio',
    phone: (typeof n.telefono === 'string' && n.telefono.trim()) || '',
    coordinates: tieneCoords ? { lat: ubic.lat, lng: ubic.lng } : { ...COORDENADAS_FALLBACK },
  };
}

module.exports = { formatearDireccion, construirOrigenEnvio, COORDENADAS_FALLBACK };
