// Estado y logica Alpine del panel de pedidos del dueno.
function panelPedidos() {
  return {
    pedidos: [],
    usuario: { email: '' },
    negocio: { nombre: '' },
    selected: null,
    filter: 'todos',
    tabs: [
      { value: 'todos', label: 'Todos' },
      { value: 'pendiente', label: 'Pendientes' },
      { value: 'confirmado', label: 'Confirmados' },
      { value: 'en_camino', label: 'En camino' },
      { value: 'entregado', label: 'Entregados' },
    ],
    // Devuelve los pedidos filtrados segun la pestana activa.
    get filtered() {
      if (this.filter === 'todos') {
        return this.pedidos;
      }
      return this.pedidos.filter((p) => p.estado === this.filter);
    },
    // Calcula contadores y totales de pedidos del dia.
    get stats() {
      const today = new Date().toDateString();
      return {
        pendientes: this.pedidos.filter((p) => p.estado === 'pendiente').length,
        enCamino: this.pedidos.filter((p) => p.estado === 'en_camino').length,
        entregadosHoy: this.pedidos.filter(
          (p) => p.estado === 'entregado' && new Date(p.creadoEn).toDateString() === today
        ).length,
        totalHoy: this.pedidos
          .filter((p) => new Date(p.creadoEn).toDateString() === today)
          .reduce((s, p) => s + p.total, 0),
      };
    },
    // Cuenta los pedidos que tienen el estado indicado.
    countByStatus(status) {
      if (status === 'todos') {
        return this.pedidos.length;
      }
      return this.pedidos.filter((p) => p.estado === status).length;
    },
    // Traduce el codigo de estado a su etiqueta legible.
    estadoLabel(estado) {
      const map = {
        pendiente: 'Pendiente',
        confirmado: 'Confirmado',
        en_camino: 'En camino',
        entregado: 'Entregado',
        cancelado: 'Cancelado',
      };
      return map[estado] || estado;
    },
    // Traduce el codigo del proveedor de envio a su nombre legible.
    carrierLabel(proveedor) {
      const map = {
        ivoy: 'iVoy',
        lalamove: 'Lalamove',
        uberDirect: 'Uber Direct',
        propio: 'Repartidor propio',
      };
      return map[proveedor] || proveedor;
    },
    // Devuelve la URL de tracking solo si usa http(s); evita XSS por javascript:.
    trackUrlSeguro(url) {
      return url && /^https?:\/\//i.test(url) ? url : '#';
    },
    // Formatea una fecha ISO a hora o fecha corta en espanol.
    formatTime(iso) {
      const d = new Date(iso);
      const today = new Date().toDateString();
      if (d.toDateString() === today) {
        return 'Hoy ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    // Carga pedidos y datos del usuario/negocio desde la API del panel.
    async loadPedidos() {
      const token = localStorage.getItem('panel_token');
      if (!token) {
        window.location.href = '/panel/login';
        return;
      }
      try {
        const [pedidosRes, meRes] = await Promise.all([
          fetch('/panel/api/pedidos', { headers: { Authorization: 'Bearer ' + token } }),
          fetch('/panel/api/me', { headers: { Authorization: 'Bearer ' + token } }),
        ]);
        if (pedidosRes.status === 401 || meRes.status === 401) {
          localStorage.removeItem('panel_token');
          window.location.href = '/panel/login';
          return;
        }
        this.pedidos = await pedidosRes.json();
        const me = await meRes.json();
        this.usuario = me.usuario;
        this.negocio = me.negocio;
      } catch (e) {
        console.error(e);
      }
    },
    // Selecciona un pedido para mostrar su detalle.
    openDetalle(pedido) {
      this.selected = pedido;
    },
    // Ejecuta una accion POST sobre un pedido y recarga la lista.
    async _accion(id, accion, mensaje) {
      const token = localStorage.getItem('panel_token');
      try {
        const respuesta = await fetch('/api/pedidos/' + id + '/' + accion, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!respuesta.ok) {
          let detalle = respuesta.status + '';
          try {
            const cuerpo = await respuesta.json();
            detalle = cuerpo.message || cuerpo.error || detalle;
          } catch (_) {}
          alert('No se pudo ' + accion + ' el pedido: ' + detalle);
          return;
        }
        await this.loadPedidos();
        this.selected = null;
        if (mensaje) {
          console.info(mensaje);
        }
      } catch (e) {
        alert('Error de red al ' + accion + ' el pedido: ' + e.message);
      }
    },
    // Confirma un pedido por su id.
    async confirmar(id) {
      await this._accion(id, 'confirmar', 'Pedido confirmado');
    },
    // Cancela un pedido tras confirmacion y devuelve el stock.
    async cancelar(id) {
      if (!confirm('Cancelar este pedido? El stock se devolvera.')) {
        return;
      }
      await this._accion(id, 'cancelar', 'Pedido cancelado');
    },
    // Cierra la sesion y redirige al login del panel.
    logout() {
      localStorage.removeItem('panel_token');
      window.location.href = '/panel/login';
    },
  };
}
