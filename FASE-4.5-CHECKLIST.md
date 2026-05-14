# Fase 4.5 — Integración con ZUYU (BONUS) · Checklist

> Conecta el micrositio con el backend real de ZUYU para sincronizar inventario en tiempo real.
> Días 11–12 (vie 23 mayo – sáb 24 mayo). 1.5 días de trabajo.

---

## Por qué esta fase existe

El micrositio universitario funciona standalone (`ZUYU_MOCK=true`), pero queremos que en
**producción real** se sincronice con la base de ZUYU para que:

1. El catálogo refleje el inventario real (las ventas presenciales decrementan stock)
2. Los pedidos online aparezcan en la app Flutter del dueño
3. El stock se mantenga consistente entre canales

**Esto agrega una demo BONUS** que ningún otro grupo va a tener:

> "Cambio el stock en ZUYU desde mi celular → en 1 segundo aparece en el micrositio"

---

## Arquitectura

```
┌─────────────────────┐                ┌─────────────────────┐
│   ZUYU (producción) │                │  Micrositio (K8s)   │
│                     │                │                     │
│  Backend Node.js    │  GET /catalogo │  api/services/      │
│  MongoDB Atlas      │ ─────────────► │   zuyu.js           │
│  Multi-tenant       │ ◄───────────── │   (cliente HTTP)    │
│                     │                │                     │
│  Producto.save()    │ ─── webhook ──►│  /webhooks/zuyu     │
│  decrementa stock   │                │   ↓                 │
│                     │                │   sync-zuyu queue   │
│  POST /pedidos      │ ◄──────────────│   ↓                 │
│  (transacción)      │                │   syncZuyu job      │
│                     │                │   - update Mongo    │
│                     │                │   - invalida cache  │
└─────────────────────┘                └─────────────────────┘
```

---

## Lo que YO ya hice (código generado)

### En el micrositio

- [x] `api/services/zuyu.js` — Cliente HTTP del API público de ZUYU + modo MOCK
- [x] `api/routes/tienda.js` — Modificado para usar `zuyu.getCatalogo()` (toma de ZUYU si no es mock)
- [x] `api/services/pedidoService.js` — Si no es mock, delega creación de pedido a ZUYU vía `crearPedidoViaZuyu`
- [x] `api/routes/webhooks.js` — Nuevo endpoint `POST /webhooks/zuyu` con HMAC verification + idempotencia
- [x] `worker/jobs/syncZuyu.js` — Job que procesa eventos de inventario y actualiza Mongo local
- [x] `worker/index.js` — Registra cola `sync-zuyu`
- [x] `.env.example` — Variables `ZUYU_MOCK`, `ZUYU_BASE_URL`, `ZUYU_API_KEY`, `ZUYU_WEBHOOK_SECRET`

### Eventos de ZUYU soportados

| Evento                 | Cuándo se dispara                        | Qué hace el micrositio              |
| ---------------------- | ---------------------------------------- | ----------------------------------- |
| `stock_actualizado`    | Venta presencial, ajuste manual de stock | Actualiza solo `stock` del producto |
| `producto_actualizado` | Cambio de precio, nombre, imagen         | Refresca todos los campos           |
| `producto_creado`      | Nuevo producto en catálogo               | Inserta en Mongo local              |
| `producto_eliminado`   | Producto marcado como inactivo           | `activo: false`                     |

Cada evento invalida el cache del slug afectado → próximo render del catálogo trae datos frescos.

---

## Lo que TÚ tienes que hacer en ZUYU (backend Node.js existente)

### 1. Crear endpoints públicos en ZUYU

Crear archivo `ZUYU/backend/routes/publicMicrositio.js`:

```js
const express = require('express');
const router = express.Router();
const Business = require('../models/business');
// usa los modelos existentes de ZUYU

// Middleware: validar API key del micrositio
function validarApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.MICROSITIO_API_KEY) {
    return res.status(401).json({ error: 'API key invalida' });
  }
  next();
}

// GET catalogo publico
router.get('/tienda/:slug/catalogo', validarApiKey, async (req, res) => {
  const negocio = await Business.findOne({ webSlug: req.params.slug, webPublicada: true });
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' });

  // Conectar a tenant DB
  const tenantConn = require('../utils/tenantConnectionManager').getTenantConnection(
    negocio._id.toString(),
    negocio.dbName
  );
  const Producto = require('../utils/modelRegistry').getModel(tenantConn, 'Producto');

  const productos = await Producto.find({ activo: true }).lean();

  res.json({
    negocio: {
      slug: negocio.webSlug,
      nombre: negocio.businessName,
      tipo: negocio.businessType,
      telefono: negocio.contactPhone,
      direccion: negocio.address,
      horarios: negocio.operatingHours,
    },
    productos: productos.map((p) => ({
      id: p._id.toString(),
      nombre: p.NOMBRE,
      precio: p.PRECIO,
      stock: p.STOCK,
      categoria: p.categoriaNombre || 'General',
      imagen: p.imagenUrl,
    })),
  });
});

// POST crear pedido (transaccion atomica con stock)
router.post('/tienda/:slug/pedidos', validarApiKey, async (req, res) => {
  const { referenciaExterna, cliente, productos, metodoPago, canal } = req.body;
  // ... transaccion MongoDB que verifica/decrementa stock atomicamente
  // ... emite webhook al micrositio con stock_actualizado
  res.json({
    zuyuPedidoId: pedido._id.toString(),
    productos: snapshotConPrecios,
    subtotal,
    total,
    costoEnvio: 49,
  });
});

module.exports = router;
```

Registrar en `ZUYU/backend/server.js`:

```js
app.use('/api/public', require('./routes/publicMicrositio'));
```

### 2. Crear servicio de webhooks en ZUYU

Crear `ZUYU/backend/services/webhookEmitter.js`:

```js
const axios = require('axios');
const crypto = require('crypto');

const WEBHOOK_URL = process.env.MICROSITIO_WEBHOOK_URL; // https://zuyu.local/webhooks/zuyu
const WEBHOOK_SECRET = process.env.MICROSITIO_WEBHOOK_SECRET;

async function emitToMicrositio(event, negocioSlug, data) {
  if (!WEBHOOK_URL) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event, negocioSlug, data });
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  try {
    await axios.post(WEBHOOK_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Zuyu-Signature': signature,
        'X-Zuyu-Timestamp': String(timestamp),
      },
      timeout: 5000,
    });
  } catch (err) {
    console.error('[webhookEmitter] Failed:', err.message);
    // En produccion: meter en cola de retry con BullMQ
  }
}

module.exports = { emitToMicrositio };
```

### 3. Hook en el modelo Producto de ZUYU

En `ZUYU/backend/models/medicamentos.js` (o producto.js):

```js
const { emitToMicrositio } = require('../services/webhookEmitter');

productoSchema.post('save', async function (doc) {
  // Detectar slug del negocio (depende de la conexion tenant)
  const slug = await getNegocioSlugFromTenant(doc.constructor.db.name);
  if (!slug) return;

  await emitToMicrositio('stock_actualizado', slug, {
    productoId: doc._id.toString(),
    stock: doc.STOCK,
  });
});

productoSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;
  const slug = await getNegocioSlugFromTenant(doc.constructor.db.name);
  if (!slug) return;

  await emitToMicrositio('producto_actualizado', slug, {
    productoId: doc._id.toString(),
    nombre: doc.NOMBRE,
    precio: doc.PRECIO,
    stock: doc.STOCK,
    activo: doc.activo,
  });
});
```

### 4. Configurar variables de entorno en ZUYU

```bash
# En .env de ZUYU
MICROSITIO_API_KEY=$(openssl rand -hex 32)
MICROSITIO_WEBHOOK_URL=https://zuyu.local/webhooks/zuyu
MICROSITIO_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Estos mismos valores van en el `.env` del micrositio:

```bash
ZUYU_MOCK=false
ZUYU_API_KEY=<mismo MICROSITIO_API_KEY>
ZUYU_WEBHOOK_SECRET=<mismo MICROSITIO_WEBHOOK_SECRET>
```

---

## Lo que TÚ tienes que hacer en el micrositio

### 1. Activar el modo no-mock (cuando ZUYU esté listo)

```bash
# En .env del micrositio
ZUYU_MOCK=false
ZUYU_BASE_URL=https://api.zuyu.mx  # o ngrok si pruebas en local
ZUYU_API_KEY=<el mismo de ZUYU>
ZUYU_WEBHOOK_SECRET=<el mismo de ZUYU>

# Reiniciar
docker-compose restart api worker
```

### 2. Probar el ciclo completo end-to-end

```bash
# 1. Cambiar stock en ZUYU desde la app Flutter (o directo en MongoDB)
#    El producto X pasa de stock=50 a stock=5

# 2. ZUYU debe disparar webhook al micrositio
#    Ver logs del micrositio:
docker-compose logs api --tail=10 | grep "Webhook ZUYU"
# Esperado: "Webhook ZUYU recibido event=stock_actualizado"

# 3. Worker procesa el job
docker-compose logs worker --tail=10 | grep sync
# Esperado: "Procesando sync ZUYU" → "Cache invalidado"

# 4. Refrescar https://zuyu.local/tienda/demo
# El producto debe mostrar "Solo 5" badge (badge de stock bajo)
```

### 3. Probar creación de pedido vía ZUYU

```bash
# Hacer un pedido en el micrositio
# El pedido debe aparecer:
# (a) En el panel del micrositio
# (b) En ZUYU como "venta canal=micrositio"
# (c) El stock debe haber decrementado en ZUYU
```

### 4. Manejar caso de ZUYU caído

```bash
# Apagar temporalmente el endpoint de ZUYU
# Recargar https://zuyu.local/tienda/demo
# El cache debe seguir sirviendo el catalogo (1 hora de TTL)
# Solo cuando expira el cache, el micrositio mostraria error
```

---

## Smoke tests críticos

### Test 1: Cliente puede ver catálogo de ZUYU

```bash
ZUYU_MOCK=false docker-compose up -d
curl https://zuyu.local/tienda/demo
# Debe traer productos del API de ZUYU, no del mongo local
```

### Test 2: Webhook con firma inválida es rechazado

```bash
curl -X POST https://zuyu.local/webhooks/zuyu \
  -H "X-Zuyu-Signature: bad-signature-x" \
  -H "X-Zuyu-Timestamp: $(date +%s)" \
  -d '{"event":"stock_actualizado","negocioSlug":"demo","data":{"productoId":"xxx","stock":99}}'
# Esperado: 401 WEBHOOK_SIGNATURE_INVALID
```

### Test 3: Webhook duplicado no procesa dos veces

```bash
# Mandar el mismo webhook 2 veces con mismo timestamp
# El segundo debe ser ignorado por idempotencia (BullMQ jobId duplicado)
```

### Test 4: Pedido en micrositio decrementa stock en ZUYU

```bash
# Stock inicial en ZUYU: 50
# Hacer pedido de 3 unidades en el micrositio
# Verificar en ZUYU: stock ahora es 47
```

---

## Demo BONUS para la defensa (la #9)

> **Demo extra: Sincronización en vivo con backend de producción**

Tiempo: 90 segundos al final del Q&A.

```
1. Abrir https://zuyu.local/tienda/demo en pantalla principal
   → mostrar producto "Paracetamol" con stock 48

2. En el celular, abrir la app Flutter de ZUYU
   → cambiar stock manualmente a 5 (simulando una venta presencial)

3. Cambiar a la pantalla principal (browser)
   → en menos de 2 segundos, refrescar (o automáticamente si tienes Server-Sent Events)
   → el producto ahora muestra badge "Solo 5"

4. Mostrar logs en otra terminal:
   kubectl logs -n micrositio -l app=api --tail=5
   → ver "Webhook ZUYU recibido event=stock_actualizado"

   kubectl logs -n micrositio -l app=worker --tail=5
   → ver "Cache invalidado"
```

**Mensaje clave para Daniel:**

> "Esta demo prueba la arquitectura distribuida real: ZUYU es la fuente de verdad,
> el micrositio cachea local para performance, y los webhooks con HMAC + idempotencia
> mantienen ambos sincronizados sin acoplamiento de bases de datos."

---

## Por qué esto vale puntos extra

| Aspecto                        | Por qué impresiona                                                       |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Webhooks bidireccionales**   | ZUYU → micrositio (cambios) y micrositio → ZUYU (pedidos)                |
| **HMAC + replay protection**   | Misma seguridad que carriers, ahora aplicada a integración interna       |
| **Cache invalidation pattern** | Patrón correcto de Shopify/Stripe: cache largo + invalidación por evento |
| **Idempotencia BullMQ jobId**  | Webhook duplicado no causa daño                                          |
| **Modo MOCK toggleable**       | Demuestra arquitectura desacoplada (12-factor app, env-driven)           |
| **Tolerancia a caídas**        | Si ZUYU cae, el micrositio sirve del cache local                         |

---

## Checkpoint de Fase 4.5

✅ **PASA si**:

- En modo MOCK, el micrositio funciona como antes (Mongo local)
- En modo no-MOCK, el catálogo viene de ZUYU API
- Webhook con firma válida procesado correctamente
- Webhook con firma inválida rechazado con 401
- Cambiar stock en ZUYU se refleja en <2s en el micrositio
- Crear pedido en micrositio aparece en ZUYU como venta

🔴 **FALLA si**:

- El modo MOCK rompe (no debería, los cambios mantienen retrocompatibilidad)
- Webhook acepta firmas inválidas
- Cache no se invalida cuando ZUYU manda webhook

---

## Tiempo estimado total Fase 4.5

- **Mi parte: ya hecha** (código del micrositio listo)
- **Tu parte en ZUYU**: ~1 día (4–5 horas)
  - 2h endpoints públicos
  - 1h webhook emitter
  - 1h hooks en modelos
  - 1h pruebas
- **Tu parte en micrositio**: ~30 min (configurar env vars + probar)
- **Total**: 1.5 días, encajables entre Fase 4 (vie 23) y Fase 5 (sáb 24)
