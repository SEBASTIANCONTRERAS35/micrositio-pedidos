#!/usr/bin/env bash
# DEMO 1 EXPANDIDO — flujo completo cliente → dueño confirma → repartidor → entrega
# (4 min · 5 pts App funcional + impresión visual)
#
# Cobertura del literal de Daniel:
#   "Flujo completo de un pedido: cliente pide → repartidor asignado → entrega"
#
# Pre-req: bash demos/seed-data.sh (negocio + productos + usuario dueño)
set -uo pipefail

echo "═══ DEMO 1 EXPANDIDO — Pedido cliente→dueño→repartidor→entrega ═══"

APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)

# ── PASO 1: cliente entra al micrositio ──
echo ""
echo "[1] CLIENTE entra a la tienda → catálogo:"
open "https://zuyu.local/tienda/demo" 2>/dev/null || true
curl -ks --resolve zuyu.local:443:10.211.55.37 https://zuyu.local/tienda/demo \
  -o /dev/null -w "  HTTP %{http_code} (catálogo) en %{time_total}s\n"

# ── PASO 2: obtener productos DEL NEGOCIO demo ──
# (find({}) sin filtro agarraría productos de otros negocios → POST 404)
PROD_IDS=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'const n=db.negocios.findOne({slug:"demo"}); db.productos.find({negocioId:n._id},{_id:1}).limit(2).toArray().map(p => p._id.toString()).join(" ")' 2>/dev/null | tail -1)
PROD1=$(echo $PROD_IDS | awk '{print $1}')
PROD2=$(echo $PROD_IDS | awk '{print $2}')

# ── PASO 3: cliente crea pedido ──
echo ""
echo "[2] CLIENTE crea pedido (POST /api/pedidos):"
RESP=$(curl -ks --resolve zuyu.local:443:10.211.55.37 -X POST https://zuyu.local/api/pedidos \
  -H "Content-Type: application/json" \
  -d "{
    \"negocioSlug\": \"demo\",
    \"cliente\": {\"nombre\":\"Juan Pérez\",\"telefono\":\"+525555550100\",\"email\":\"juan@example.com\",\"direccion\":\"Av. Reforma 100, CDMX\"},
    \"productos\": [{\"id\":\"$PROD1\",\"cantidad\":2},{\"id\":\"$PROD2\",\"cantidad\":1}],
    \"metodoPago\": \"efectivo\"
  }")
PEDIDO_ID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("pedidoId",""))' 2>/dev/null)
TOTAL=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("total",""))' 2>/dev/null)
echo "    ✓ Pedido $PEDIDO_ID creado, total \$$TOTAL (estado: pendiente)"

# ── PASO 4: dueño hace login (panel) ──
echo ""
echo "[3] DUEÑO hace login (POST /api/auth/login):"
LOGIN_RESP=$(curl -ks --resolve zuyu.local:443:10.211.55.37 -X POST https://zuyu.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@zuyu.local","password":"Demo1234!"}')
JWT=$(echo "$LOGIN_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))' 2>/dev/null)
if [ -z "$JWT" ]; then
  echo "    ✗ Login falló (corre 'bash demos/seed-data.sh' primero):"
  echo "$LOGIN_RESP" | head -3
  exit 1
fi
echo "    ✓ JWT obtenido (${JWT:0:30}...)"

# ── PASO 5: dueño confirma pedido ──
echo ""
echo "[4] DUEÑO confirma el pedido (POST /api/pedidos/$PEDIDO_ID/confirmar con JWT):"
CONFIRM_RESP=$(curl -ks --resolve zuyu.local:443:10.211.55.37 -X POST "https://zuyu.local/api/pedidos/$PEDIDO_ID/confirmar" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json")
echo "    Response:"
echo "$CONFIRM_RESP" | python3 -m json.tool 2>&1 | head -8

# ── PASO 6: worker debería procesar job 'solicitar-repartidor' ──
echo ""
echo "[5] Worker procesa el job 'delivery' (esperando 5s)..."
sleep 5
echo "    Logs worker:"
kubectl logs -n micrositio deploy/worker --tail=10 2>/dev/null | grep -iE "delivery|repartidor|Procesando" | tail -3

# ── PASO 7: estado del pedido en BD ──
echo ""
echo "[6] Estado del pedido en MongoDB:"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
const p = db.pedidos.findOne({pedidoId: '$PEDIDO_ID'});
print('Estado: ' + p.estado);
if (p.delivery) {
  print('Carrier: ' + (p.delivery.proveedor || 'pendiente'));
  print('Tracking: ' + (p.delivery.trackingUrl || 'pendiente'));
}
" 2>&1 | tail -5

# ── PASO 8: simular webhook "entregado" CON HMAC firmado ──
echo ""
echo "[7] Simular webhook de iVoy 'entregado' (con HMAC firmado SHA256):"
# El webhook debe referenciar el deliveryId REAL asignado por el carrier:
# webhookDelivery.js busca el pedido por delivery.deliveryId (no por uno inventado).
DELIVERY_ID=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval "const p=db.pedidos.findOne({pedidoId:'$PEDIDO_ID'}); print(p && p.delivery ? p.delivery.deliveryId : '')" 2>/dev/null | tail -1 | tr -d '[:space:]')
WEBHOOK_SECRET=$(kubectl get secret api-env -n micrositio -o jsonpath='{.data.WEBHOOK_SECRET_IVOY}' | base64 -d)
TIMESTAMP=$(date +%s)
WEBHOOK_BODY="{\"orderId\":\"$DELIVERY_ID\",\"status\":\"delivered\",\"pedidoId\":\"$PEDIDO_ID\",\"timestamp\":$TIMESTAMP}"
SIG=$(printf '%s' "$WEBHOOK_BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $NF}')
echo "    Signature: sha256=${SIG:0:16}..."
curl -ks --resolve zuyu.local:443:10.211.55.37 \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: sha256=$SIG" \
  -H "x-ivoy-timestamp: $TIMESTAMP" \
  -d "$WEBHOOK_BODY" \
  -w "    HTTP %{http_code}\n" -o /dev/null

# ── PASO 9: ver estado final ──
sleep 3
echo ""
echo "[8] Estado FINAL en BD (después de webhook):"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
const p = db.pedidos.findOne({pedidoId: '$PEDIDO_ID'});
print('Estado: ' + p.estado);
print('Historial:');
(p.historial || []).forEach(h => print('  - ' + h.estado + ' @ ' + h.timestamp));
" 2>&1 | tail -8

echo ""
echo "═══ FIN DEMO 1 EXPANDIDO ═══"
echo "Cierre: 'Flujo completo: cliente HTTPS → MongoDB RS → dueño JWT → worker BullMQ → webhook → estado entregado.'"
