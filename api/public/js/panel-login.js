/**
 * Login del panel del dueno (panel/login.ejs).
 * Externalizado del EJS para poder quitar 'unsafe-inline' del CSP de scripts.
 */
function loginForm() {
  return {
    email: '',
    password: '',
    submitting: false,
    error: '',
    async submit() {
      this.submitting = true;
      this.error = '';
      try {
        const respuesta = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        if (!respuesta.ok) {
          const error = await respuesta.json();
          throw new Error(error.message || 'Credenciales invalidas');
        }
        const { accessToken } = await respuesta.json();
        localStorage.setItem('panel_token', accessToken);
        window.location.href = '/panel/pedidos';
      } catch (e) {
        this.error = e.message;
        this.submitting = false;
      }
    },
  };
}
