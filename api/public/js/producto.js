/**
 * Lógica de la vista de detalle de producto (tienda/producto.ejs).
 * Agrega el producto al carrito (localStorage 'cart_<slug>', mismo formato
 * que tienda.js) respetando la cantidad elegida, y vuelve al catálogo.
 */
function productoView(slug) {
  const STORAGE_KEY = 'cart_' + slug;
  return {
    cantidad: 1,
    // Recibe el <button>: lee el producto del data-attribute (JSON escapado
    // por EJS) en vez de interpolar datos en un string JS — anti-XSS.
    agregar(el) {
      let prod;
      try {
        prod = JSON.parse(el.dataset.producto);
      } catch {
        return;
      }
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const qty = Math.max(1, Math.min(Number(this.cantidad) || 1, prod.stock));
      const existente = items.find((i) => i.id === prod.id);
      if (existente) {
        existente.cantidad = Math.min(existente.cantidad + qty, prod.stock);
      } else {
        items.push({ ...prod, cantidad: qty });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.location.href = '/tienda/' + slug;
    },
  };
}
