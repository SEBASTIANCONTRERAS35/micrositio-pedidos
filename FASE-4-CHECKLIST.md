# Fase 4 — Multi-Carrier Delivery · Checklist

> Validar la integración con los 3 carriers (iVoy real + Lalamove/Uber mocks).
> Días 10–11 (jue 22 mayo – vie 23 mayo).

## Lo que YO ya hice

- [x] `api/services/delivery/index.js` con interfaz común multi-carrier
- [x] `api/services/delivery/providers/ivoy.js` (sandbox real con credenciales públicas)
- [x] `api/services/delivery/providers/lalamove.js` (mock por defecto, código real preparado para HMAC)
- [x] `api/services/delivery/providers/uberDirect.js` (mock por defecto, código real preparado para OAuth2)
- [x] `worker/jobs/delivery.js` que llama al provider correcto según el negocio
- [x] `worker/jobs/webhookDelivery.js` que procesa actualizaciones de carriers
- [x] `api/routes/webhooks.js` con HMAC verification + idempotencia
- [x] `api/utils/hmac.js` con timingSafeEqual + replay attack prevention
- [x] Tests unitarios de HMAC

## Lo que TÚ tienes que hacer

### 1. Activar iVoy real (opcional, +5 pts bonus)
```bash
# En .env del docker-compose
IVOY_MOCK=false
IVOY_USER=integracion-express@ivoy.mx
IVOY_PASSWORD=sandbox

# Confirmar pedido en panel y ver logs
docker-compose logs worker | grep ivoy
# Esperado: "Repartidor solicitado" con deliveryId real de iVoy sandbox
```

### 2. Probar webhooks con curl
```bash
# Webhook con firma VÁLIDA
SECRET="test-secret"
BODY='{"orderId":"test-123","status":"delivered"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST "http://localhost:3000/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: $SIG" \
  -H "x-ivoy-timestamp: $(date +%s)" \
  -d "$BODY"
# Esperado: 200 { ok: true }

# Webhook con firma INVÁLIDA → 401
# Webhook con timestamp viejo (>5min) → 401
# Webhook duplicado (mismo deliveryId+estado) → procesado solo 1 vez
```

### 3. Verificar conmutación entre carriers
```bash
# Cambiar el deliveryProvider del negocio en MongoDB
docker-compose exec mongodb mongosh micrositio --eval "
  db.negocios.updateOne({slug:'demo'}, {\$set: {deliveryProvider:'lalamove'}})
"
# Confirmar pedido nuevo
# Verificar logs: "Solicitando repartidor providerName=lalamove"
```

## Checkpoint
✅ iVoy sandbox responde con deliveryId real
✅ Lalamove y Uber Direct responden con mock
✅ Webhook con firma válida procesado, con inválida rechazado
✅ Webhook duplicado no procesado dos veces (idempotencia BullMQ jobId)
✅ Cambio de deliveryProvider en negocio cambia el carrier usado
