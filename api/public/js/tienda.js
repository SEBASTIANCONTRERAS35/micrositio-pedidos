// Crea el store de Alpine del carrito persistido en localStorage por slug.
function cartStore(slug) {
  const STORAGE_KEY = 'cart_' + slug;
  let toastTimer = null;
  return {
    open: false,
    items: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
    toastMessage: '',
    // Devuelve la suma de cantidades de todos los items del carrito.
    get totalItems() {
      return this.items.reduce((s, i) => s + i.cantidad, 0);
    },
    // Devuelve el importe total (precio por cantidad) del carrito.
    get total() {
      return this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    },
    // Persiste los items del carrito en localStorage.
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    },
    // Muestra un toast temporal de producto agregado.
    showToast(nombre) {
      this.toastMessage = '✓ ' + nombre + ' agregado';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.toastMessage = '';
      }, 2000);
    },
    // Lee el producto del data-attribute del boton y lo agrega al carrito.
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
    // Agrega un producto al carrito respetando el stock disponible.
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
    // Incrementa la cantidad de un item sin exceder su stock.
    increment(id) {
      const item = this.items.find((i) => i.id === id);
      if (item && item.cantidad < item.stock) {
        item.cantidad += 1;
      }
      this.save();
    },
    // Decrementa la cantidad de un item y lo elimina si llega a cero.
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
    // Devuelve la cantidad actual de un item en el carrito.
    getQuantity(id) {
      const item = this.items.find((i) => i.id === id);
      return item ? item.cantidad : 0;
    },
  };
}

document
  .querySelectorAll('.ct-cat-pill[href^="#cat-"], .ct-cat-pill--all')
  // Registra el manejador de clic en cada pildora de categoria.
  .forEach(function (pill) {
    // Hace scroll suave hacia la categoria destino al hacer clic.
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
