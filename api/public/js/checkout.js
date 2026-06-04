// Componente Alpine del checkout: estado del carrito, totales y envio del pedido.
function checkoutForm(slug) {
  const STORAGE_KEY = 'cart_' + slug;
  return {
    items: [],
    form: {
      nombre: '',
      telefono: '',
      email: '',
      direccion: '',
      notas: '',
      metodoPago: 'efectivo',
    },
    submitting: false,
    error: '',
    // Calcula el subtotal sumando precio por cantidad de cada item.
    get subtotal() {
      return this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    },
    // Devuelve el costo de envio fijo si hay items en el carrito.
    get costoEnvio() {
      return this.items.length > 0 ? 49 : 0;
    },
    // Suma subtotal y costo de envio para obtener el total.
    get total() {
      return this.subtotal + this.costoEnvio;
    },
    // Carga el carrito desde localStorage.
    loadCart() {
      this.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    },
    // Envia el pedido al API y redirige a la pagina de confirmacion.
    async submit() {
      this.submitting = true;
      this.error = '';
      try {
        const idempotencyKey = crypto.randomUUID();
        const respuesta = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({
            negocioSlug: slug,
            cliente: {
              nombre: this.form.nombre,
              telefono: '+52' + this.form.telefono,
              email: this.form.email,
              direccion: this.form.direccion,
            },
            productos: this.items.map((i) => ({ id: i.id, cantidad: i.cantidad })),
            metodoPago: this.form.metodoPago,
            notas: this.form.notas || undefined,
          }),
        });
        if (!respuesta.ok) {
          const error = await respuesta.json();
          throw new Error(error.message || 'Error al crear pedido');
        }
        const pedido = await respuesta.json();
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = '/tienda/' + slug + '/pedido/' + pedido.pedidoId;
      } catch (e) {
        this.error = e.message;
        this.submitting = false;
      }
    },
  };
}
