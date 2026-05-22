# ADR-009: Autenticación del panel del dueño en el cliente (JWT en localStorage)

**Fecha:** 2026-05-21
**Estado:** Aceptado
**Decisores:** Sebastián Contreras

## Contexto

El panel del dueño (`/panel/pedidos`, `/panel/integracion`) muestra datos por
negocio. El JWT de sesión se obtiene en `POST /api/auth/login` y se guarda en
`localStorage`. Las páginas EJS se renderizan **estáticas** del lado del
servidor, y el JS del cliente (`panel-*.js`) las hidrata: hace `fetch` a
`/panel/api/*` con el header `Authorization: Bearer <jwt>`.

## Problema descubierto

El servidor renderiza la vista **sin saber quién es el usuario** — el JWT está
en `localStorage`, no en una cookie que el servidor pueda leer en el `GET` de
la vista. El código tenía un workaround:

```js
res.render('panel/pedidos', { negocio: { nombre: 'Mi Negocio' }, usuario: { email: '' } });
```

Ese placeholder falso (`'Mi Negocio'`) se mostraba un instante en el `<title>`
hasta que el JS lo reemplazaba. Es deuda: la vista finge tener datos que no
tiene.

## Decisión

Aceptar explícitamente el patrón **SPA-lite**: el render server-side NO recibe
datos de negocio/usuario. Las vistas del panel se renderizan auto-suficientes
(`<title>` estático) y el JS del cliente las hidrata al 100% vía `/panel/api/me`.
Se eliminó el placeholder falso de `panel.js`.

## Consecuencias

- ➕ **Simplicidad:** un solo flujo de auth (Bearer token en los `fetch`). El
  servidor no parsea cookies ni mantiene sesión para renderizar vistas.
- ➕ La vista es la única fuente de verdad client-side — sin estado duplicado.
- ➖ El JWT en `localStorage` es accesible a JavaScript → vulnerable si existe
  un XSS. **Mitigación:** CSP estricto sin `unsafe-inline` en `script-src` (por
  eso `tienda.js` y los `panel-*.js` están externalizados, no inline).
- ➖ No hay SSR de datos: una pantalla breve sin nombre de negocio hasta que el
  JS hidrata (~100 ms).

## Alternativa considerada

**Cookie `httpOnly` + auth server-side.** El token viviría en una cookie
`httpOnly` (inaccesible a JS → inmune a robo por XSS), un middleware lo leería
en cada `GET` de vista y renderizaría con los datos reales. Se descartó para
este alcance porque requiere: cambiar el login a `Set-Cookie`, un middleware de
sesión en todas las vistas, y **protección CSRF** (las cookies se envían
automáticamente). Es un refactor mayor. Para un panel de bajo volumen,
defendido por CSP, el patrón client-side es aceptable. Migración futura.
