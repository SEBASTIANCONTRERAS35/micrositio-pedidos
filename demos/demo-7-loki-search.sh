#!/usr/bin/env bash
# DEMO 7 — Búsqueda de pedido por pedidoId en Loki (2 min · 10 pts Observabilidad)
# QUÉ DECIR: "Cada log de la app emite JSON con un campo 'pedidoId'.
#   Grafana Alloy lo extrae como label y lo envía a Loki. Puedo buscar TODA la historia
#   de un pedido en segundos."
set -uo pipefail

echo "═══ DEMO 7 — Búsqueda en Loki por pedidoId ═══"

# ── Paso 1: pre-generar pedidos para tener data ──
echo ""
echo "[1] Pre-generar 3 pedidos para tener data en Loki:"
# ID de producto REAL del negocio demo (IDs inventados → 400 en validación)
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
PROD_ID=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'const n=db.negocios.findOne({slug:"demo"}); print(db.productos.findOne({negocioId:n._id})._id.toString())' 2>/dev/null | tail -1 | tr -dc 'a-f0-9')
for i in 1 2 3; do
  curl -k --resolve zuyu.local:443:10.211.55.37 -s -X POST https://zuyu.local/api/pedidos \
    -H "Content-Type: application/json" \
    -d "{
      \"negocioSlug\":\"demo\",
      \"cliente\":{\"nombre\":\"Cliente $i\",\"telefono\":\"+52555555010$i\",\"email\":\"cliente$i@x.mx\",\"direccion\":\"Calle $i 100, CDMX\"},
      \"productos\":[{\"id\":\"$PROD_ID\",\"cantidad\":1}],
      \"metodoPago\":\"efectivo\"
    }" -o /dev/null -w "  Pedido $i: HTTP %{http_code}\n"
done

# ── Paso 2: dar tiempo a que Loki indexe ──
echo ""
echo "[2] Esperando 10s para que Alloy → Loki indexe..."
sleep 10

# ── Paso 3: abrir Grafana en browser ──
echo ""
echo "[3] Abrir Grafana en browser: https://grafana.zuyu.local"
echo "    Usuario: admin / Password: admin123"
open "https://grafana.zuyu.local/explore" 2>/dev/null || true

# ── Paso 4: query Loki desde CLI (sin Grafana UI) ──
echo ""
echo "[4] Query Loki directo (cli desde dentro del cluster):"
echo ""
echo "    Logs por namespace app=api (últimos 5 min):"
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/query_range?query=%7Bnamespace%3D%22micrositio%22%2Capp%3D%22api%22%7D&limit=5&since=300s" \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('data', {}).get('result', [])[:3]:
    stream = r['stream']
    print(f\"  Pod: {stream.get('pod','?')[:30]:30}\")
    for v in r['values'][:1]:
        ts, msg = v
        print(f\"  → {msg[:150]}\")"
echo ""

# ── Paso 5: query con label pedidoId (si pedidos generaron logs con ese campo) ──
echo ""
echo "[5] Query buscando por label pedidoId (si la app loggea con pino+pedidoId):"
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/label/pedidoId/values" 2>/dev/null | head -5 || echo "(no pedidoIds aún indexados)"

# ── Paso 6: query stats ──
echo ""
echo "[6] Loki tiene logs activos:"
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/query?query=count(count_over_time(%7Bnamespace%3D%22micrositio%22%7D%5B5m%5D))" \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  Streams en micrositio ns últimos 5min: {d.get('data', {}).get('result', [{}])[0].get('value', [0, 'N/A'])[1]}\")"

echo ""
echo "═══ FIN DEMO 7 ═══"
echo "Cierre: 'En Grafana → Explore → Loki, query {namespace=\"micrositio\", pedidoId=\"PED-...\"} muestra la historia completa del pedido en <30s.'"
