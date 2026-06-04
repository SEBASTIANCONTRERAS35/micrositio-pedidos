// Pantalla de integracion con ZUYU (componente Alpine del panel).
function integracionZuyu() {
  return {
    loading: true,
    saving: false,
    msg: '',
    msgOk: false,
    negocio: { nombre: '' },
    usuario: { email: '' },
    estado: {
      conectado: false,
      apiKeyConfigurada: false,
      apiKeyPrefix: '',
      webhookSecretConfigurado: false,
    },
    form: { baseUrl: '', apiKey: '', webhookSecret: '', conectado: false },

    // Devuelve el token de sesion guardado en localStorage.
    token() {
      return localStorage.getItem('panel_token');
    },

    // Carga datos del usuario/negocio y el estado de la integracion.
    async load() {
      const t = this.token();
      if (!t) {
        window.location.href = '/panel/login';
        return;
      }
      try {
        const meRes = await fetch('/panel/api/me', {
          headers: { Authorization: 'Bearer ' + t },
        });
        if (meRes.status === 401) {
          window.location.href = '/panel/login';
          return;
        }
        if (meRes.ok) {
          const me = await meRes.json();
          this.negocio = me.negocio || this.negocio;
          this.usuario = me.usuario || this.usuario;
        }

        const respuesta = await fetch('/panel/api/integracion', {
          headers: { Authorization: 'Bearer ' + t },
        });
        if (respuesta.ok) {
          const datos = await respuesta.json();
          this.estado = datos;
          this.form.baseUrl = datos.baseUrl || '';
          this.form.conectado = datos.conectado || false;
        }
      } catch (e) {
        this.msg = 'No se pudo cargar la configuración.';
        this.msgOk = false;
      } finally {
        this.loading = false;
      }
    },

    // Guarda la configuracion de integracion y refresca el estado.
    async guardar() {
      this.saving = true;
      this.msg = '';
      try {
        const payload = {
          baseUrl: this.form.baseUrl.trim(),
          conectado: this.form.conectado,
        };
        if (this.form.apiKey.trim()) {
          payload.apiKey = this.form.apiKey.trim();
        }
        if (this.form.webhookSecret.trim()) {
          payload.webhookSecret = this.form.webhookSecret.trim();
        }

        const respuesta = await fetch('/panel/api/integracion', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.token(),
          },
          body: JSON.stringify(payload),
        });
        const datos = await respuesta.json();
        if (!respuesta.ok) {
          throw new Error(datos.message || 'No se pudo guardar');
        }
        this.estado = datos;
        this.form.baseUrl = datos.baseUrl || '';
        this.form.conectado = datos.conectado || false;
        this.form.apiKey = '';
        this.form.webhookSecret = '';
        this.msg = datos.conectado
          ? 'Guardado. El micrositio está conectado a ZUYU.'
          : 'Guardado. El micrositio está en modo demo.';
        this.msgOk = true;
      } catch (e) {
        this.msg = e.message;
        this.msgOk = false;
      } finally {
        this.saving = false;
      }
    },

    // Cierra la sesion y redirige al login del panel.
    logout() {
      localStorage.removeItem('panel_token');
      window.location.href = '/panel/login';
    },
  };
}
