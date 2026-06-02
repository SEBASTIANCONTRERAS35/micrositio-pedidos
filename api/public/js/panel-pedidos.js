/**
 * Panel del dueno — lista y gestion de pedidos (panel/pedidos.ejs).
 * Externalizado del EJS para poder quitar 'unsafe-inline' del CSP de scripts.
 */
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
    get filtered() {
      if (this.filter === 'todos') {
        return this.pedidos;
      }
      return this.pedidos.filter((p) => p.estado === this.filter);
    },
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
    countByStatus(status) {
      if (status === 'todos') {
        return this.pedidos.length;
      }
      return this.pedidos.filter((p) => p.estado === status).length;
    },
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
    openDetalle(pedido) {
      this.selected = pedido;
    },
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
          // pequeno feedback no bloqueante
          console.info(mensaje);
        }
      } catch (e) {
        alert('Error de red al ' + accion + ' el pedido: ' + e.message);
      }
    },
    async confirmar(id) {
      await this._accion(id, 'confirmar', 'Pedido confirmado');
    },
    async cancelar(id) {
      if (!confirm('Cancelar este pedido? El stock se devolvera.')) {
        return;
      }
      await this._accion(id, 'cancelar', 'Pedido cancelado');
    },
    logout() {
      localStorage.removeItem('panel_token');
      window.location.href = '/panel/login';
    },
  };
}
