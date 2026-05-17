#!/usr/bin/env bash
# DEMO EXTRA — Webhook ZUYU (sincronización inventario desde ZUYU al micrositio)
# QUÉ DECIR: "ZUYU emite eventos cuando cambia el stock de un producto.
#   El micrositio los recibe en /webhooks/zuyu, valida firma estilo Stripe
#   (X-Zuyu-Signature: t=...,v1=...), encola en BullMQ, worker syncZuyu procesa.
#   Anti-replay con timestamp window + idempotencia con jobId."
set -uo pipefail

echo "═══ DEMO EXTRA — Webhook ZUYU (sync inventario) ═══"

# ── 1. Tomar el secret ZUYU del negocio demo (si está configurado) ──
echo ""
echo "[1] Verificar secret ZUYU del negocio demo:"
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
ZUYU_SECRET=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'const n = db.negocios.findOne({slug:"demo"}); print(n?.zuyuConfig?.webhookSecret || "NO_CONFIGURED");' 2>/dev/null | tail -1 | tr -d '[:space:]')

if [ "$ZUYU_SECRET" = "NO_CONFIGURED" ] || [ -z "$ZUYU_SECRET" ]; then
  echo "    Negocio demo no tiene webhookSecret ZUYU configurado."
  echo "    Configurándolo con un secret de prueba:"
  ZUYU_SECRET="demo-zuyu-webhook-secret-32chars-xxxxx"
  kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
    -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
db.negocios.updateOne({slug:'demo'}, {\$set: {zuyuConfig: {webhookSecret: '$ZUYU_SECRET'}}});
print('Secret configurado en negocio demo');
" 2>&1 | tail -2
fi
echo "    ✓ Secret: ${ZUYU_SECRET:0:16}..."

# ── 2. Armar payload ZUYU + firma estilo Stripe ──
echo ""
echo "[2] Armar evento 'stock_actualizado' + firma estilo Stripe:"
TIMESTAMP=$(date +%s)
EVENT_ID="zuyu-evt-$(date +%s)-$RANDOM"
BODY=$(cat <<EOF
{"eventId":"$EVENT_ID","eventType":"stock_actualizado","negocioSlug":"demo","data":{"productoId":"AVI-250","stockNuevo":42,"actualizadoEn":$TIMESTAMP}}
EOF
)
SIGNED_PAYLOAD="${TIMESTAMP}.${BODY}"
SIGNATURE=$(printf '%s' "$SIGNED_PAYLOAD" | openssl dgst -sha256 -hmac "$ZUYU_SECRET" -hex | awk '{print $NF}')
SIG_HEADER="t=$TIMESTAMP,v1=$SIGNATURE"

echo "    EventId:   $EVENT_ID"
echo "    Body:      $BODY"
echo "    Signature: $SIG_HEADER"

# ── 3. Enviar webhook firmado ──
echo ""
echo "[3] POST /webhooks/zuyu con firma válida:"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/zuyu" \
  -H "Content-Type: application/json" \
  -H "x-zuyu-signature: $SIG_HEADER" \
  -H "x-zuyu-event-id: $EVENT_ID" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code}\n"

# ── 4. Replay attack (mismo eventId) → idempotencia ──
echo ""
echo "[4] REPLAY (mismo eventId) → BullMQ rechaza duplicado:"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/zuyu" \
  -H "Content-Type: application/json" \
  -H "x-zuyu-signature: $SIG_HEADER" \
  -H "x-zuyu-event-id: $EVENT_ID" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code} (esperado 200 pero job dedupe en BullMQ)\n" -o /dev/null

# ── 5. Firma invalida ──
echo ""
echo "[5] Firma INVÁLIDA → 401:"
BAD_SIG="t=$TIMESTAMP,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/zuyu" \
  -H "Content-Type: application/json" \
  -H "x-zuyu-signature: $BAD_SIG" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code} (esperado 401)\n" -o /dev/null

# ── 6. Ver logs worker syncZuyu ──
echo ""
echo "[6] Logs del worker procesando el job sync:"
sleep 2
kubectl logs -n micrositio deploy/worker --tail=10 2>/dev/null | grep -iE "syncZuyu|sync.*zuyu|stock_actualizado" | tail -3

echo ""
echo "═══ FIN DEMO ZUYU WEBHOOK ═══"
echo "Cierre: 'Anti-Corruption Layer + Outbox + HMAC firmado estilo Stripe + idempotencia BullMQ.'"
