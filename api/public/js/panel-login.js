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
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Credenciales invalidas');
        }
        const { accessToken } = await res.json();
        localStorage.setItem('panel_token', accessToken);
        window.location.href = '/panel/pedidos';
      } catch (e) {
        this.error = e.message;
        this.submitting = false;
      }
    },
  };
}
