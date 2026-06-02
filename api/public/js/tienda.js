/**
 * Lógica del catálogo público (tienda/index.ejs).
 * Externalizado del EJS para poder quitar 'unsafe-inline' del CSP de scripts.
 *
 * cartStore(slug): store de Alpine para el carrito (persistido en localStorage).
 */
function cartStore(slug) {
  const STORAGE_KEY = 'cart_' + slug;
  let toastTimer = null;
  return {
    open: false,
    items: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
    toastMessage: '',
    get totalItems() {
      return this.items.reduce((s, i) => s + i.cantidad, 0);
    },
    get total() {
      return this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    },
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    },
    showToast(nombre) {
      this.toastMessage = '✓ ' + nombre + ' agregado';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.toastMessage = '';
      }, 2000);
    },
    // Recibe el <button>: lee el producto del data-attribute (JSON seguro,
    // escapado por EJS) en vez de interpolar datos en un string JS — anti-XSS.
    addProduct(el) {
      let prod;
      try {
        prod = JSON.parse(el.dataset.producto);
      } catch {
        return;
      }
      this.addToCart(prod);
      this.showToast(prod.nombre);
    },
    addToCart(prod) {
      const existente = this.items.find((i) => i.id === prod.id);
      if (existente) {
        if (existente.cantidad < prod.stock) {
          existente.cantidad += 1;
        }
      } else {
        this.items.push({ ...prod, cantidad: 1 });
      }
      this.save();
    },
    increment(id) {
      const item = this.items.find((i) => i.id === id);
      if (item && item.cantidad < item.stock) {
        item.cantidad += 1;
      }
      this.save();
    },
    decrement(id) {
      const item = this.items.find((i) => i.id === id);
      if (item) {
        item.cantidad -= 1;
        if (item.cantidad <= 0) {
          this.items = this.items.filter((i) => i.id !== id);
        }
      }
      this.save();
    },
    getQuantity(id) {
      const item = this.items.find((i) => i.id === id);
      return item ? item.cantidad : 0;
    },
  };
}

// Smooth scroll a categorias
document
  .querySelectorAll('.ct-cat-pill[href^="#cat-"], .ct-cat-pill--all')
  .forEach(function (pill) {
    pill.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 124;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
