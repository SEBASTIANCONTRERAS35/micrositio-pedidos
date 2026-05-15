/**
 * Checkout de la tienda publica (tienda/checkout.ejs).
 * Externalizado del EJS para poder quitar 'unsafe-inline' del CSP de scripts.
 */
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
    get subtotal() {
      return this.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    },
    get costoEnvio() {
      return this.items.length > 0 ? 49 : 0;
    },
    get total() {
      return this.subtotal + this.costoEnvio;
    },
    loadCart() {
      this.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    },
    async submit() {
      this.submitting = true;
      this.error = '';
      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await fetch('/api/pedidos', {
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
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Error al crear pedido');
        }
        const pedido = await res.json();
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = '/tienda/' + slug + '/pedido/' + pedido.pedidoId;
      } catch (e) {
        this.error = e.message;
        this.submitting = false;
      }
    },
  };
}
