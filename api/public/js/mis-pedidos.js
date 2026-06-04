// "Mis pedidos" del cliente: lista los folios guardados en localStorage para este
// negocio y consulta el estado actual de cada uno en vivo.
(function () {
  const root = document.querySelector('[data-negocio-slug]');
  if (!root) {
    return;
  }
  const slug = root.dataset.negocioSlug;
  const cont = document.querySelector('[data-mis-pedidos]');
  const vacio = document.querySelector('[data-mis-pedidos-vacio]');

  const ETIQUETAS = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  let pedidos = [];
  try {
    pedidos = JSON.parse(localStorage.getItem('mis_pedidos_' + slug) || '[]');
  } catch (e) {
    pedidos = [];
  }

  if (!Array.isArray(pedidos) || pedidos.length === 0) {
    if (vacio) {
      vacio.classList.remove('is-oculto');
    }
    return;
  }

  // Formatea una fecha ISO a fecha y hora cortas en espanol (MX).
  function fmt(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Pinta una fila de pedido (folio + total + fecha) con badge de estado en vivo.
  function render(p) {
    if (!p || !p.pedidoId) {
      return;
    }
    const a = document.createElement('a');
    a.className = 'mp-item';
    a.href = '/tienda/' + slug + '/pedido/' + encodeURIComponent(p.pedidoId);

    const izq = document.createElement('div');
    const id = document.createElement('div');
    id.className = 'mp-item__id';
    id.textContent = p.pedidoId;
    const meta = document.createElement('div');
    meta.className = 'mp-item__meta';
    const totalTxt = typeof p.total === 'number' ? '$' + p.total.toFixed(2) + ' · ' : '';
    meta.textContent = totalTxt + fmt(p.fecha);
    izq.appendChild(id);
    izq.appendChild(meta);

    const badge = document.createElement('span');
    badge.className = 'mp-badge';
    badge.textContent = '…';

    a.appendChild(izq);
    a.appendChild(badge);
    cont.appendChild(a);

    // Estado actual en vivo (mismo endpoint que el tracking, scoped por negocio).
    fetch(
      '/api/pedidos/' + encodeURIComponent(p.pedidoId) + '/estado?slug=' + encodeURIComponent(slug),
      { headers: { Accept: 'application/json' } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        badge.textContent = d ? ETIQUETAS[d.estado] || d.estado : 'No disponible';
      })
      .catch(() => {
        badge.textContent = '';
      });
  }

  pedidos.forEach(render);
})();
