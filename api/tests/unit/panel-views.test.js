const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../../views/panel');

// Verifica que las vistas del panel se rendericen sin datos server-side.
describe('vistas del panel — render sin datos server-side', () => {
  for (const vista of ['login.ejs', 'pedidos.ejs', 'integracion.ejs']) {
    // Comprueba que la vista renderiza con un contexto vacio sin lanzar.
    it(`${vista} renderiza con un contexto vacio`, () => {
      const tpl = fs.readFileSync(path.join(viewsDir, vista), 'utf8');
      expect(() =>
        ejs.render(tpl, {}, { views: [viewsDir], filename: path.join(viewsDir, vista) })
      ).not.toThrow();
    });
  }
});
