/**
 * Pantalla de integracion con ZUYU (panel/integracion.ejs).
 * Externalizado del EJS para poder quitar 'unsafe-inline' del CSP de scripts.
 */
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

    token() {
      return localStorage.getItem('panel_token');
    },

    async load() {
      const t = this.token();
      if (!t) {
        window.location.href = '/panel/login';
        return;
      }
      try {
        // Datos del usuario/negocio para el header
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

        // Estado de la integracion
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

    async guardar() {
      this.saving = true;
      this.msg = '';
      try {
        // Solo mandamos apiKey/webhookSecret si el usuario escribió algo —
        // vacío significa "no cambiar".
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
        // Refrescar estado y limpiar los campos de secreto
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

    logout() {
      localStorage.removeItem('panel_token');
      window.location.href = '/panel/login';
    },
  };
}
