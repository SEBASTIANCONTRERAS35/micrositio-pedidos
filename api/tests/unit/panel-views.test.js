/**
 * Tests de las vistas del panel (ADR-009: panel SPA-lite).
 * Garantizan que las vistas se renderizan SIN datos server-side — si alguna
 * volviera a depender de `negocio`/`usuario` en un `<%= %>`, ejs.render({})
 * lanzaria y el test falla.
 */
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../../views/panel');

describe('vistas del panel — render sin datos server-side', () => {
  for (const vista of ['login.ejs', 'pedidos.ejs', 'integracion.ejs']) {
    it(`${vista} renderiza con un contexto vacio`, () => {
      const tpl = fs.readFileSync(path.join(viewsDir, vista), 'utf8');
      expect(() =>
        ejs.render(tpl, {}, { views: [viewsDir], filename: path.join(viewsDir, vista) })
      ).not.toThrow();
    });
  }
});
