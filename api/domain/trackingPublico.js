// Devuelve la URL solo si usa protocolo http(s); evita XSS por javascript:/data:.
function urlTrackingSegura(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

// Indica si un pedido pertenece a un negocio (comparacion por ObjectId, anti-IDOR).
function perteneceANegocio(pedido, negocio) {
  if (!pedido || !negocio || !pedido.negocioId || !negocio._id) {
    return false;
  }
  return pedido.negocioId.toString() === negocio._id.toString();
}

// Proyecta el estado publico de un pedido para tracking (sin PII sensible del cliente ni del repartidor).
function proyectarEstadoPublico(pedido) {
  const d = pedido.delivery;
  const delivery = d
    ? {
        estado: d.estado || null,
        proveedor: d.proveedor || null,
        trackingUrl: urlTrackingSegura(d.trackingUrl),
        repartidor: d.repartidor ? { nombre: d.repartidor.nombre || null } : null,
      }
    : null;
  return {
    estado: pedido.estado,
    historial: (pedido.historial || []).map((h) => ({
      estado: h.estado,
      timestamp: h.timestamp,
      nota: h.nota,
    })),
    delivery,
  };
}

module.exports = { urlTrackingSegura, perteneceANegocio, proyectarEstadoPublico };
