// Tracking del cliente: consulta el estado del pedido cada 5s y actualiza el DOM.
(function () {
  const POLL_MS = 5000;
  const ESTADOS_FINALES = ['entregado', 'cancelado'];

  const ETAPAS = ['pendiente', 'confirmado', 'en_camino', 'entregado'];
  const ETIQUETAS = {
    pendiente: 'Pendiente',
    confirmado: 'Confirmado',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  const root = document.querySelector('[data-pedido-id]');
  if (!root) {
    return;
  }
  const pedidoId = root.dataset.pedidoId;
  if (!pedidoId) {
    return;
  }
  const negocioSlug = root.dataset.negocioSlug || '';

  let timer = null;

  // Traduce un codigo de estado a su etiqueta legible en espanol.
  function etiquetaEstado(estado) {
    return ETIQUETAS[estado] || estado;
  }

  // Formatea una fecha ISO a fecha y hora cortas en espanol (MX).
  function formatTime(iso) {
    if (!iso) {
      return '';
    }
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

  // Actualiza el badge de estado actual y su clase de color.
  function pintarEstado(estado) {
    const badge = document.querySelector('[data-tracking-estado]');
    if (!badge) {
      return;
    }
    badge.textContent = etiquetaEstado(estado);
    badge.className = 'tracking-badge tracking-badge--' + estado;
  }

  // Marca las etapas completadas/actual en la linea de tiempo.
  function pintarTimeline(estado) {
    const indiceActual = ETAPAS.indexOf(estado);
    const pasos = document.querySelectorAll('[data-tracking-step]');
    pasos.forEach((paso) => {
      const etapa = paso.dataset.trackingStep;
      const indice = ETAPAS.indexOf(etapa);
      paso.classList.remove('is-done', 'is-active', 'is-cancelled');
      if (estado === 'cancelado') {
        paso.classList.add('is-cancelled');
        return;
      }
      if (indice >= 0 && indice < indiceActual) {
        paso.classList.add('is-done');
      } else if (indice === indiceActual) {
        paso.classList.add('is-active');
      }
    });
  }

  // Renderiza el historial de cambios de estado del pedido.
  function pintarHistorial(historial) {
    const cont = document.querySelector('[data-tracking-historial]');
    if (!cont) {
      return;
    }
    cont.textContent = '';
    (historial || []).forEach((h) => {
      const li = document.createElement('li');
      li.className = 'tracking-historial__item';

      const estadoEl = document.createElement('span');
      estadoEl.className = 'tracking-historial__estado';
      estadoEl.textContent = etiquetaEstado(h.estado);
      li.appendChild(estadoEl);

      if (h.nota) {
        const notaEl = document.createElement('span');
        notaEl.className = 'tracking-historial__nota';
        notaEl.textContent = h.nota;
        li.appendChild(notaEl);
      }

      const fechaEl = document.createElement('time');
      fechaEl.className = 'tracking-historial__fecha';
      fechaEl.textContent = formatTime(h.timestamp);
      li.appendChild(fechaEl);

      cont.appendChild(li);
    });
  }

  // Muestra u oculta un elemento alternando la clase is-oculto.
  function toggleOculto(el, mostrar) {
    if (!el) {
      return;
    }
    el.classList.toggle('is-oculto', !mostrar);
  }

  // Muestra/actualiza el nombre del repartidor asignado.
  function pintarRepartidor(delivery) {
    const cont = document.querySelector('[data-tracking-delivery]');
    if (!cont) {
      return;
    }
    const repartidor = delivery && delivery.repartidor;
    const tieneRepartidor = repartidor && repartidor.nombre;

    if (!tieneRepartidor) {
      toggleOculto(cont, false);
      return;
    }
    toggleOculto(cont, true);

    const nombreEl = cont.querySelector('[data-tracking-repartidor-nombre]');
    if (nombreEl) {
      nombreEl.textContent = repartidor.nombre || 'Repartidor asignado';
    }
  }

  // Detiene el polling.
  function detener() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // Consulta el estado del pedido y refresca el DOM; se detiene si es final.
  async function consultar() {
    try {
      const url =
        '/api/pedidos/' +
        encodeURIComponent(pedidoId) +
        '/estado?slug=' +
        encodeURIComponent(negocioSlug);
      const respuesta = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!respuesta.ok) {
        return;
      }
      const datos = await respuesta.json();
      pintarEstado(datos.estado);
      pintarTimeline(datos.estado);
      pintarHistorial(datos.historial);
      pintarRepartidor(datos.delivery);

      if (ESTADOS_FINALES.includes(datos.estado)) {
        detener();
      }
    } catch (e) {
      // Reintenta en el siguiente ciclo de polling ante errores de red.
    }
  }

  // Arranca el ciclo de polling cada POLL_MS hasta llegar a un estado final.
  function iniciar() {
    consultar();
    const estadoInicial = root.dataset.pedidoEstado;
    if (estadoInicial && ESTADOS_FINALES.includes(estadoInicial)) {
      return;
    }
    timer = setInterval(consultar, POLL_MS);
  }

  iniciar();
})();
