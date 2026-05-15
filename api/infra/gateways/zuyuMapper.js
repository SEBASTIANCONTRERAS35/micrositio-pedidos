/**
 * Anti-Corruption Layer (mapper) del lado del micrositio.
 *
 * ZUYU y el Mongo local del micrositio devuelven el catalogo con SHAPES
 * distintos (ZUYU usa `id`, el mock usa `_id`; ZUYU ya agrupa, el mock no).
 * Este mapper normaliza ambos a UNA sola "vista de catalogo" que es lo unico
 * que ven las rutas y las plantillas EJS — asi, si ZUYU cambia su DTO, el
 * cambio se absorbe AQUI y no se propaga a las vistas.
 *
 * Vista de catalogo (contrato interno del micrositio):
 *   {
 *     negocio:      { slug, nombre, tipo, telefono, direccion, horarios },
 *     productos:    [{ _id, nombre, descripcion, precio, stock, categoria, imagen }],
 *     porCategoria: { [categoria]: [producto, ...] },
 *     promociones:  [],
 *   }
 */
'use strict';

/**
 * Normaliza un producto (venga de ZUYU o del Mongo local) a la vista interna.
 * `stock` se conserva tal cual: null = no trackeado (ilimitado) en ZUYU.
 */
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

/** Agrupa una lista de productos-vista por su categoria. */
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

/**
 * Convierte la respuesta cruda (de ZUYU o del mock) en la vista de catalogo.
 *
 * @param {object} fuente - { negocio, productos[] } crudo
 * @param {string} slug - slug del micrositio (la ruta publica)
 * @returns {object} vista de catalogo normalizada
 */
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
