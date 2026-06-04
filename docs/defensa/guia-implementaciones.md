# 📚 Guía de implementaciones — explicadas para la defensa

> Esta guía explica **cómo está construido el proyecto de verdad**, con tu código real,
> en dos capas: **palabras claras** primero y **tecnicismos** después. Pensada para que
> defiendas cada pieza con propiedad. Se va ampliando módulo por módulo.
>
> Convención: `archivo:línea` apunta a tu código. Los bloques `★ Insight` son los puntos
> que más impresionan en una defensa.

Índice:
1. [Frontend](#1-frontend) ✅
2. Tekton (CI) — *pendiente*
3. Loki (logs) — *pendiente*
4. Grafana (dashboards) — *pendiente*
5. (resto: MongoDB, NetworkPolicy, KEDA, ArgoCD, Rollouts…) — *pendiente*

---

# 1. Frontend

## 1.1 Son DOS frontends en uno

```
api/views/
├── tienda/   ← lo que ve el CLIENTE (público, sin login)
│   ├── index.ejs                catálogo del negocio
│   ├── producto.ejs             detalle de un producto
│   ├── checkout.ejs             formulario de pedido
│   ├── pedido-confirmacion.ejs  "tu pedido fue recibido"
│   └── 404.ejs
└── panel/    ← lo que ve el DUEÑO del negocio (con login JWT)
    ├── login.ejs
    ├── pedidos.ejs              bandeja de pedidos (confirmar/cancelar)
    └── integracion.ejs          conectar el negocio con ZUYU
```

## 1.2 El stack: EJS + Alpine.js (no React/Vue)

**Claro:** hay dos formas de servir una web. (A) Un **SPA** (React): el navegador descarga
un "robot de cocina" pesado (un bundle de JS) y **arma la página en el cliente** → tarda en
cargar y, si Google la mira antes de armarse, la ve vacía. (B) Lo tuyo, **SSR con EJS**: el
servidor manda el **"plato ya cocinado"** (HTML completo) → carga rápido y Google lo lee. Y
**Alpine.js** son los "cubiertos ligeros" (~15 KB) para la interactividad justa (carrito).

**Técnico:**
- **SSR (Server-Side Rendering):** EJS es un *motor de plantillas*; mezcla datos + HTML en el
  servidor y manda el HTML renderizado. Mejor *TTFB (time-to-first-byte)* y *SEO* (los
  crawlers leen contenido real, no un HTML vacío).
- **Alpine.js:** micro-framework que añade *reactividad* (la UI sigue al estado) sin *build
  step* (no webpack/vite). Footprint mínimo vs los cientos de KB de un SPA.

`★ Insight ─────────────────────────────────────`
Frase de defensa: *"Para un micrositio público de catálogo elegí SSR + Alpine en vez de un SPA
porque da mejor time-to-first-byte y SEO sin la complejidad de un build de React."*
`─────────────────────────────────────────────────`

### Contras de esta elección (saberlos = nivel arquitecto)
- **Full page reload:** cada navegación recarga la página (un SPA navega sin recargar).
- **Alpine no escala** para UI muy compleja/estado compartido grande (ahí React/Vue ganan).
- **Carga al servidor:** SSR renderiza en cada request (lo mitigas con caché).
- **Lógica duplicada:** validaciones que viven en cliente Y servidor (Zod).
- **Matiz:** el SEO ya no es exclusivo de SSR (Next.js hace SSR con React) — pero a costa de
  un build step y más complejidad.

> Frase madura: *"Asumí estos trade-offs a conciencia porque mi caso es un catálogo público
> mayormente de lectura. Si creciera a un panel muy interactivo, migraría esa parte a Next.js."*

## 1.3 El flujo de una visita (`api/routes/tienda.js`)

```
GET /tienda/:slug
  → tiendaCache.get(slug)        ¿nota vigente en caché?       (línea 21)
      sí → render directo                                       (línea 23)
      no → zuyu.getCatalogo(slug)  pide a ZUYU (o Mongo mock)   (línea 29)
           ├─ resolverConfig: ¿conectado a ZUYU o modo mock?
           ├─ trae datos crudos
           └─ toCatalogoVista()  ← la "aduana" (ACL): shape único
           → tiendaCache.set(slug, ..., 1h)                     (línea 35)
           → render('tienda/index', catalogo)                   (línea 36)
  (al crear un pedido → tiendaCache.delete(slug): el stock cambió)
```

## 1.4 El caché (`api/services/cache.js`)

**Claro (analogía del empleado y la nota pegada):** un cliente pregunta por el catálogo de un
negocio; en vez de ir a la "bodega" (ZUYU) cada vez, el empleado va **una vez**, apunta la
respuesta en una **nota pegada** y se la lee a los siguientes por 1 hora. Cada nota tiene
**fecha de caducidad**.

| Hora | Qué pasa | Empleado |
|------|----------|----------|
| 10:00 | Ana visita | No hay nota → va a la bodega → escribe nota "vence 11:00" |
| 10:05 | Beto visita | Lee la nota al instante (no va a la bodega) ✅ |
| 10:20 | Ana **compra** 2 | **Tira la nota** (el stock cambió) 🗑️ |
| 10:21 | Beto visita | No hay nota → va a la bodega → stock fresco |
| 11:15 | Dani visita | La nota venció → va de nuevo |

**Técnico:** `TTLCache` envuelve un `Map`. Cada entrada = `{ value, expiresAt }`.
- `get`: si no existe → null; si `Date.now() > expiresAt` → la borra y null; si vigente → la
  devuelve. (**Lazy expiration:** no hay timer; la entrada vieja solo se borra al leerla.)
- `set(key, value, ttlMs)`: guarda con `expiresAt = ahora + ttl`.
- `tiendaCache` = singleton, default 30 min; `tienda.js:35` pasa 1h (sobreescribe el default).
- **Invalidar** = borrar a propósito antes de que venza. La única invalidación real:
  `pedidoService.js:185` → `tiendaCache.delete(slug)` al crear un pedido (el stock cambió).

`★ Insight ─────────────────────────────────────`
**Límites reales del caché (gran material de defensa):**
1. Vive **en memoria del proceso API** → el **Worker** (otro proceso) **no puede invalidarlo**;
   por eso el webhook de ZUYU no borra esta nota.
2. Tienes **2 réplicas del API** → cada pod tiene **su propia libreta**; borrar en uno no borra
   en el otro.
3. **Buen Fin:** con muchas compras, cada pedido invalida → el caché rinde poco y puede haber
   *cache stampede* (50 visitas a la vez disparan 50 fetches idénticos).
- **Pero NO se rompe:** el caché es solo el "aparador"; la **transacción atómica** en ZUYU/Mongo
  al comprar es la "caja registradora" → nunca vendes de más.
- **Cómo escalarlo:** caché en **Redis** compartido + *update-in-place* (restar el stock en la
  nota en vez de tirarla) + *single-flight* (solo 1 fetch cuando falta la nota) + **KEDA**
  absorbe el pico de la cola.
`─────────────────────────────────────────────────`

## 1.5 El ACL mapper (`api/infra/gateways/zuyuMapper.js`)

**Claro:** una **aduana/traductor** entre ZUYU y tu micrositio. ZUYU usa el campo `id`, tu Mongo
local usa `_id`. En vez de que tus 8 vistas entiendan los dos idiomas, **todo pasa por la
aduana** que lo traduce a **un solo formato**. Las vistas nunca ven cómo es ZUYU por dentro.

**Técnico — 3 funciones:**
- `toProductoVista(p)`: normaliza un producto → `_id: String(p._id || p.id)`,
  `stock: p.stock === undefined ? null : p.stock` (null = no trackeado = ilimitado), defaults.
- `agruparPorCategoria(productos)`: arma `{ "Bebidas": [...], "Snacks": [...] }`.
- `toCatalogoVista(fuente, slug)`: junta `{ negocio, productos, porCategoria, promociones }`.
- Se usa en `zuyu.js:105 getCatalogo`: tanto modo **mock** como **conectado** pasan por
  `toCatalogoVista` → las rutas reciben **siempre el mismo shape**.

`★ Insight ─────────────────────────────────────`
**Patrón Anti-Corruption Layer (ACL)** de *Domain-Driven Design*: una capa que traduce el
"idioma" de un sistema externo para que **no contamine** tu dominio. Si ZUYU cambia su formato,
**solo tocas el mapper** — las vistas y rutas no se enteran. Una sola fuente de cambio.
`─────────────────────────────────────────────────`

## 1.6 El carrito (`api/public/js/tienda.js`)

**Claro:** un "store" de Alpine que vive en el navegador. Guarda los items en **localStorage**
(un cajoncito dentro del navegador) con la clave `cart_<slug>` → si recargas, tu carrito sigue.

**Técnico — reactividad:** `<body x-data="cartStore(slug)">` declara el estado. Es **reactivo**:
cuando cambia `items`, Alpine **re-pinta solo** las partes que lo usan (`x-text="totalItems"`,
el contador, etc.) — tú no escribes "actualiza el numerito".
- *Getters* `totalItems`/`total`: se recalculan solos.
- `addToCart`: dedup por `id`, respeta `stock`. `increment`/`decrement`/`getQuantity`: botones.
- Toggle elegante: `<template x-if="getQuantity(id) === 0">` muestra "+"; si ya está, muestra
  el control `− 3 +`. Reactivo.

## 1.7 Seguridad del frontend (lo que más impresiona)

**XSS (Cross-Site Scripting), claro:** un ataque donde el malo mete **JavaScript** en tu página
y se ejecuta en el navegador de tus usuarios. Vector: un dato que el malo controla (ej. el
**nombre de un producto**: `Coca <script>roba()</script>`) insertado sin limpiar.

**Cómo lo evitas (defensa en 3 capas):**

```
Capa 1: EJS escapa con <%= %>      → <,>,",& se vuelven inofensivos (texto muerto)
Capa 2: data-attribute + JSON.parse → el dato nunca se vuelve código
Capa 3: CSP sin 'unsafe-inline'     → aunque algo se colara, el navegador no corre inline
```

- **La línea clave** (`index.ejs:241`):
  ```html
  <button data-producto="<%= JSON.stringify({id, nombre, precio, stock}) %>"
          @click="addProduct($el)">
  ```
  El dato va a un **atributo HTML escapado**; `tienda.js` lo lee con
  `JSON.parse(el.dataset.producto)` → **dato, no código**. (Lo PELIGROSO sería interpolar
  `'<%= prod.nombre %>'` dentro de un string JS.)
- **CSP** (`api/middlewares/helmet.js`): `scriptSrc: ["'self'", "'unsafe-eval'"]` → solo
  ejecuta JS de **archivos de tu dominio**; **sin `'unsafe-inline'`** → el navegador **rechaza**
  cualquier `<script>` inline u `onclick=`. Pudiste quitar `unsafe-inline` porque **moviste todo
  el JS a archivos externos** (`public/js/*.js`).

`★ Insight ─────────────────────────────────────`
**Defense in depth (defensa en profundidad):** varias capas para que si una falla, otra detenga
el ataque. Frase: *"apliqué defensa en profundidad contra XSS: escape en plantilla, datos por
atributo en vez de interpolar en JS, y CSP sin unsafe-inline."*
`─────────────────────────────────────────────────`

### Deuda técnica documentada: `'unsafe-eval'`
Sigue permitido `'unsafe-eval'` porque el **build estándar de Alpine** evalúa sus expresiones
(`@click="..."`) con `Function()`. Quitarlo exige migrar al *build CSP de Alpine*, que **prohíbe
expresiones** → habría que reescribir **~58 expresiones** en 8 vistas + 6 JS (asignaciones,
comparaciones, concatenaciones, ternarios, métodos con argumentos). Es deuda técnica **conocida
y documentada** (comentada en `helmet.js`); se difiere por costo/beneficio (riesgo alto, ganancia
marginal: no hay input de usuario entrando a expresiones Alpine).

> Defensa: *"El único relajamiento es unsafe-eval, necesario para el Alpine estándar; los
> vectores de XSS están cerrados con escape + data-attributes + sin inline. La migración al
> build CSP está identificada como deuda técnica para post-entrega."*

## 1.8 Cómo demostrarlo / preguntas probables

- **Demo:** `https://zuyu.local/tienda/<slug>` → agregar productos → carrito (localStorage) →
  checkout → confirmación. (Es la demo-1, flujo de pedido.)
- **Preguntas:**
  - *"¿SSR o SPA?"* → SSR (EJS) + Alpine; razones y trade-offs (1.2).
  - *"¿Cómo evitas XSS?"* → defensa en 3 capas (1.7).
  - *"¿Cómo no saturas a ZUYU?"* → caché TTL + invalidación al pedir; límites conocidos (1.4).
  - *"¿Y el panel del dueño?"* → login JWT + bandeja (`panel/pedidos.ejs`) que llama a
    `/api/pedidos/:id/confirmar`.
