'use strict';

const COORDENADAS_FALLBACK = Object.freeze({ lat: 19.4326, lng: -99.1332 });

// Une los campos de una dirección estructurada en una línea legible.
function formatearDireccion(direccion) {
  if (!direccion || typeof direccion !== 'object') {
    return '';
  }
  return [direccion.calle, direccion.colonia, direccion.ciudad, direccion.estado, direccion.cp]
    .map((parte) => (typeof parte === 'string' ? parte.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

// Construye el origen del envío (pickup) que consumen los providers.
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
