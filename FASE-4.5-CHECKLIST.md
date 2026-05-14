# Fase 4.5 — Integración ZUYU ↔ Micrositio · Checklist

> Integración completa: API REST + Webhooks con Outbox Pattern, Anti-Corruption
> Layer y Saga orchestration. Arquitectura Vertical Slice.
> **Estado: CÓDIGO COMPLETO — falta probar.**

---

## Arquitectura implementada

```
ZUYU (backend)                      Micrositio (K8s)
  publicApi/v1/                       api/services/zuyu.js
   catalog   <----GET /catalog------  (cliente HTTP)
   orders    <----POST /orders------
   webhooks
  Producto.save()
   -> outboxHook
      -> MicrositioOutbox  --webhook-->  POST /webhooks/zuyu
         -> webhookWorker                  -> verify HMAC
            (HMAC + circuit breaker)        -> sync-zuyu queue
                                              -> syncZuyu job (idempotente)
```

---

## Lo que YA está implementado — EN ZUYU (ZUYU/backend/)

### Modelos y datos (4.5.1)

- [x] models/micrositioOutbox.js — modelo TENANT, Outbox Pattern (claimPending, markDelivered, markFailed con backoff)
- [x] models/business.js — micrositioConfig (apiKeyHash, slug, webhookUrl, webhookSecret cifrado, sucursalDefaultId, ipAllowlist) + 2 indices
- [x] models/venta.js — canalVenta='micrositio' + referenciaExterna
- [x] models/auditoria.js — categoria MICROSITIO
- [x] constants/audit*types.js — 10 eventos MICROSITIO*\*
- [x] utils/modelRegistry.js — registrado MicrositioOutbox
- [x] scripts/migrate-add-micrositio-config.js — migracion idempotente

### Seguridad / Auth (4.5.2)

- [x] publicApi/shared/auth/apiKeyService.js — generar/hash SHA-256/verify timing-safe
- [x] publicApi/shared/auth/apiKeyMiddleware.js — auth (10 validaciones, inyecta tenantConnection)
- [x] publicApi/shared/auth/hmacSigner.js — firma estilo Stripe + dual-secret
- [x] publicApi/shared/errors/PublicApiError.js + errorHandler.js

### Shared / ACL (4.5.3)

- [x] publicApi/shared/acl/stockResolver.js — stock multi-sucursal
- [x] publicApi/shared/acl/productMapper.js — Producto -> ProductoPublico (oculta COSTO)
- [x] publicApi/shared/acl/orderMapper.js — pedido -> Venta interna
- [x] publicApi/shared/validation/schemas.js + validate.js — Zod + stripDangerousKeys
- [x] publicApi/shared/ssrf/webhookUrlValidator.js — SSRF guard
- [x] publicApi/shared/ratelimit/keyedLimiter.js — 3 limiters
- [x] publicApi/shared/logging/auditLogger.js — AuditService + Pino redaccion PII
- [x] publicApi/shared/outbox/outboxRecorder.js

### Slice catalog (4.5.4)

- [x] publicApi/v1/catalog/ — cache.js + queries.js + controller.js + routes.js

### Slice orders / Saga (4.5.5)

- [x] publicApi/v1/orders/ — createOrder.steps.js + compensations.js + command.js + controller + routes

### Webhooks + workers (4.5.6)

- [x] queues/micrositioWebhookQueue.js — cola BullMQ
- [x] workers/micrositioWebhookWorker.js — worker HMAC + circuit breaker opossum
- [x] publicApi/shared/outbox/outboxPublisher.js — publisher post-commit
- [x] workers/micrositioOutboxScanner.js — cron de recuperacion (30s)
- [x] publicApi/v1/webhooks/ — subscriptions.controller.js + routes.js

### Router + admin

- [x] publicApi/v1/\_middlewareStack.js + \_router.js + health.routes.js
- [x] publicApi/admin/apiKeyManagement.js + micrositioAdmin.routes.js
- [x] server.js — montado /api/public/v1 + /api/micrositio-admin + 2 workers

### Hooks de Producto (4.5.7)

- [x] publicApi/shared/hooks/productOutboxHook.js
- [x] models/productos.js — hooks attacheados

### Tests (4.5.9)

- [x] test/unit/publicApi/apiKeyService.test.js
- [x] test/unit/publicApi/hmacSigner.test.js — replay attack + dual-secret
- [x] test/unit/publicApi/webhookUrlValidator.test.js — SSRF
- [x] test/unit/publicApi/productMapper.test.js — ACL no filtra COSTO
- [x] test/unit/publicApi/schemas.test.js — NoSQL injection
- [x] test/unit/publicApi/orderMapper.test.js
- [x] test/integration/publicApi/createOrderConcurrency.test.js — 20 pedidos -> 10 exitosos

### Documentacion (4.5.10)

- [x] publicApi/v1/\_openapi.yaml — spec OpenAPI 3.1
- [x] publicApi/README.md

### Verificacion

- [x] 37 archivos JS pasan node --check
- [x] 7 archivos modificados de ZUYU pasan node --check

---

## Lo que YA está implementado — EN EL MICROSITIO

- [x] api/services/zuyu.js — cliente HTTP adaptado a /api/public/v1/
- [x] api/utils/hmac.js — verifyZuyuSignature (formato Stripe t=,v1=)
- [x] api/routes/webhooks.js — /webhooks/zuyu con HMAC dual-secret + idempotencia
- [x] api/models/producto.js — campo zuyuProductoId + indice
- [x] worker/jobs/syncZuyu.js — idempotencia Redis SET NX + 5 eventos
- [x] .env.example — variables ZUYU\_\* actualizadas

---

## Lo que TÚ tienes que hacer (cuando pruebes)

### 1. Migracion en ZUYU

```
cd ZUYU/backend
node scripts/migrate-add-micrositio-config.js
```

### 2. Correr tests

```
cd ZUYU/backend
npm test -- publicApi
```

### 3. Arrancar ZUYU

```
npm run dev
# Logs esperados: [MicrositioWebhookWorker] Started + [MicrositioOutboxScanner] Started
curl http://localhost:3000/api/public/v1/health
```

### 4. Generar API key (como dueño de un negocio)

```
TOKEN="<jwt-del-dueño>"
curl -X PUT http://localhost:3000/api/micrositio-admin/config \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"activo":true,"slug":"negocio-demo","webhookUrl":"https://zuyu.local/webhooks/zuyu"}'
curl -X POST http://localhost:3000/api/micrositio-admin/api-key/generate -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3000/api/micrositio-admin/webhook-secret/rotate -H "Authorization: Bearer $TOKEN"
```

### 5. Activar en el micrositio

```
# .env del micrositio:
ZUYU_MOCK=false
ZUYU_BASE_URL=http://<host-zuyu>:3000
ZUYU_API_KEY=<el apiKey>
ZUYU_WEBHOOK_SECRET=<el webhookSecret>
docker-compose restart api worker
```

---

## Smoke tests de seguridad

| Test                                        | Esperado                |
| ------------------------------------------- | ----------------------- |
| API key invalida                            | 401                     |
| Sin API key                                 | 401                     |
| Micrositio no activo                        | 403                     |
| Webhook firma invalida                      | 401                     |
| Webhook timestamp viejo (>5min)             | 401                     |
| Webhook duplicado (mismo eventId)           | procesado 1 vez         |
| SSRF: webhook URL a 10.0.0.1                | 400                     |
| NoSQL injection: id="$ne"                   | 400 VALIDATION_ERROR    |
| 20 pedidos concurrentes del ultimo producto | 10 exitosos, 10 con 409 |

---

## Checkpoint

PASA si:

- npm test -- publicApi pasa
- ZUYU arranca con los 2 workers en logs
- /api/public/v1/health responde 200
- Catalogo viene de ZUYU (ZUYU_MOCK=false)
- Webhook firma invalida -> 401; valida -> 200
- Cambio de stock en ZUYU se refleja en el micrositio
- Pedido del micrositio crea Venta con canalVenta='micrositio'
- Test concurrencia: 20 pedidos -> exactamente 10 exitosos

---

## Notas de arquitectura (para la defensa)

- Vertical Slice en vez de Clean Architecture canonica: para ~4 endpoints,
  las 4 capas de Clean Arch serian 40 archivos triviales.
- Anti-Corruption Layer: publicApi nunca expone modelos Mongoose crudos.
- Outbox Pattern: el webhook se persiste en la misma transaccion que la Venta.
- Saga orchestration: createOrder ejecuta pasos dentro de withTransaction.
- El modulo es aislado: 1 linea en server.js. Si falla, ZUYU sigue operativo.
