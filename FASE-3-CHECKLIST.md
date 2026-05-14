# Fase 3 — Lógica de Pedidos · Checklist

> Validar que la lógica de pedidos funciona correctamente bajo concurrencia.
> Día 7 (lun 19 mayo).

## Lo que YO ya hice (incluido en Fase 2)

- [x] `api/models/pedido.js` con schema completo (cliente snapshot, productos snapshot, estado, delivery, historial)
- [x] `api/services/pedidoService.js`:
  - [x] `crearPedidoConStock` con transacción MongoDB atómica
  - [x] `confirmarPedido` (encola job al worker)
  - [x] `cancelarPedido` (devuelve stock atómicamente)
  - [x] `generarPedidoId` con counter Redis (PED-YYMM-NNNN)
- [x] `api/routes/pedidos.js` con Idempotency-Key + rate limit + Zod validation
- [x] Test crítico: `tests/integration/pedidos-atomicidad.test.js` (10 concurrentes → 1 success)
- [x] TTL automático MongoDB: pedidos cancelados se borran a los 90 días

## Lo que TÚ tienes que hacer

### 1. Probar el flujo completo en local
```bash
docker-compose up
node scripts/seed-data.js
# Abrir http://localhost:3000/tienda/demo
# Crear pedido → verificar que aparece en panel
```

### 2. Correr el test de atomicidad
```bash
cd api
npm run test:integration
```

✅ **PASA si**: el test "10 pedidos concurrentes del último producto" pasa con stock final = 0 y solo 1 success.

### 3. Verificar idempotencia
```bash
# Hacer 2 POST iguales con el mismo Idempotency-Key
KEY=$(uuidgen)
curl -X POST http://localhost:3000/api/pedidos \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"negocioSlug":"demo","cliente":{"nombre":"Test","telefono":"+525555555555","email":"t@test.com","direccion":"Calle 1, Centro, CDMX, 10000"},"productos":[{"id":"<id-real>","cantidad":1}]}'

# Repetir el mismo curl → debe regresar el MISMO pedidoId (cached)
```

## Checkpoint
✅ Test de atomicidad pasa
✅ Idempotency-Key funciona
✅ Pedido cancelado devuelve stock
✅ pedidoId tiene formato PED-YYMM-NNNN
