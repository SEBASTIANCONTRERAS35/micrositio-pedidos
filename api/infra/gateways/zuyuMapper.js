'use strict';

// Normaliza un producto (venga de ZUYU o del Mongo local) a la vista interna.
function toProductoVista(p) {
  return {
    _id: String(p._id || p.id),
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    precio: p.precio,
    stock: p.stock === undefined ? null : p.stock,
    categoria: p.categoria || 'General',
    imagen: p.imagen || null,
  };
}

// Agrupa una lista de productos-vista por su categoria.
function agruparPorCategoria(productos) {
  const porCategoria = {};
  for (const p of productos) {
    const cat = p.categoria || 'General';
    if (!porCategoria[cat]) {
      porCategoria[cat] = [];
    }
    porCategoria[cat].push(p);
  }
  return porCategoria;
}

// Convierte la respuesta cruda (de ZUYU o del mock) en la vista de catalogo.
function toCatalogoVista(fuente, slug) {
  const productos = (fuente.productos || []).map(toProductoVista);
  return {
    negocio: {
      slug,
      nombre: fuente.negocio?.nombre || 'Negocio',
      tipo: fuente.negocio?.tipo || 'OTHER',
      telefono: fuente.negocio?.telefono || null,
      direccion: fuente.negocio?.direccion || null,
      horarios: fuente.negocio?.horarios || null,
    },
    productos,
    porCategoria: agruparPorCategoria(productos),
    promociones: fuente.promociones || [],
  };
}

module.exports = { toProductoVista, agruparPorCategoria, toCatalogoVista };
