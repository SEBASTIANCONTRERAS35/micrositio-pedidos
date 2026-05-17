#!/usr/bin/env bash
# DEMO EXTRA — Webhook iVoy con HMAC firmado correctamente
# QUÉ DECIR: "Los webhooks de delivery se firman con HMAC SHA256 + timestamp.
#   El endpoint /webhooks/delivery rechaza cualquier request sin firma válida o
#   con timestamp viejo (>5 min). Demo: enviar webhook bien firmado → 200 + estado cambia."
set -uo pipefail

echo "═══ DEMO EXTRA — Webhook con HMAC firmado ═══"

PEDIDO_ID="${1:-PED-2605-0001}"
DELIVERY_ID="${DELIVERY_ID:-iv-sim-$(date +%s)}"

# ── Paso 1: obtener WEBHOOK_SECRET_IVOY del cluster ──
echo ""
echo "[1] Obtener WEBHOOK_SECRET_IVOY del Secret api-env:"
SECRET=$(kubectl get secret api-env -n micrositio -o jsonpath='{.data.WEBHOOK_SECRET_IVOY}' | base64 -d)
echo "    ✓ Secret cargado (${SECRET:0:8}...)"

# ── Paso 2: armar payload + timestamp + firma HMAC ──
echo ""
echo "[2] Armar payload + firmar HMAC SHA256:"
TIMESTAMP=$(date +%s)
BODY=$(cat <<EOF
{"orderId":"$DELIVERY_ID","status":"delivered","pedidoId":"$PEDIDO_ID","driver":{"name":"Pedro Demo","phone":"+525555550999"},"timestamp":$TIMESTAMP}
EOF
)
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
echo "    Body: $BODY"
echo "    Timestamp: $TIMESTAMP"
echo "    Signature: sha256=$SIGNATURE"

# ── Paso 3: enviar webhook BIEN firmado → debe ser 200 ──
echo ""
echo "[3] POST /webhooks/delivery?provider=ivoy con firma válida:"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: sha256=$SIGNATURE" \
  -H "x-ivoy-timestamp: $TIMESTAMP" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code} en %{time_total}s\n"

# ── Paso 4: mostrar que SIN firma es rechazado ──
echo ""
echo "[4] Mismo body PERO sin x-ivoy-signature → rechazado:"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code} (esperado 400/401 — sin firma)\n" -o /dev/null

# ── Paso 5: mismo body PERO con firma incorrecta → rechazado ──
echo ""
echo "[5] Body con firma INVÁLIDA → rechazado:"
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" \
  -H "x-ivoy-timestamp: $TIMESTAMP" \
  -d "$BODY" \
  -w "\n    HTTP %{http_code} (esperado 400/401 — firma inválida)\n" -o /dev/null

# ── Paso 6: timestamp viejo (replay attack) → rechazado ──
echo ""
echo "[6] Body con timestamp de hace 1 día → rechazado (anti-replay):"
OLD_TS=$((TIMESTAMP - 86400))
OLD_BODY="${BODY/\"timestamp\":$TIMESTAMP/\"timestamp\":$OLD_TS}"
OLD_SIG=$(printf '%s' "$OLD_BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: sha256=$OLD_SIG" \
  -H "x-ivoy-timestamp: $OLD_TS" \
  -d "$OLD_BODY" \
  -w "\n    HTTP %{http_code} (esperado 400/401 — replay attack)\n" -o /dev/null

# ── Paso 7: estado del pedido cambió ──
echo ""
echo "[7] Estado del pedido $PEDIDO_ID después del webhook válido:"
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
const p = db.pedidos.findOne({pedidoId: '$PEDIDO_ID'});
if (!p) { print('Pedido no encontrado — corre demo-1 primero'); } else {
  print('Estado: ' + p.estado);
  if (p.delivery) {
    print('Delivery: ' + JSON.stringify(p.delivery, null, 2));
  }
}
" 2>&1 | tail -10

echo ""
echo "═══ FIN DEMO EXTRA WEBHOOK HMAC ═══"
echo "Cierre: 'Webhooks firmados HMAC + timestamp window = sin spoofeo + sin replay attack.'"
