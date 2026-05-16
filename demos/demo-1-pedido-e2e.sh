#!/usr/bin/env bash
# DEMO 1 — Flujo de pedido end-to-end (4 min · 5 pts App funcional)
# QUÉ DECIR: "App real corriendo en cluster, desplegada por ArgoCD desde Git.
#   Creo un pedido vía API, lo veo en MongoDB, y el worker procesa la notificación."
set -uo pipefail

echo "═══ DEMO 1 — Pedido end-to-end ═══"

# ── Paso 1: abrir el micrositio en el browser ──
echo ""
echo "[1] Abrir https://zuyu.local/tienda/demo en el browser:"
open "https://zuyu.local/tienda/demo" 2>/dev/null || echo "  (en Linux: xdg-open; o pega URL manualmente)"

# ── Paso 2: obtener productos reales del negocio ──
echo ""
echo "[2a] Obtener catálogo de productos del negocio demo (ObjectIds reales):"
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
PROD_IDS=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'db.productos.find({},{_id:1}).limit(2).toArray().map(p => p._id.toString()).join(" ")' 2>/dev/null | tail -1)
PROD1=$(echo $PROD_IDS | awk '{print $1}')
PROD2=$(echo $PROD_IDS | awk '{print $2}')
echo "    Producto 1: $PROD1"
echo "    Producto 2: $PROD2"

# ── Paso 3: crear pedido vía API HTTPS ──
echo ""
echo "[2b] CREAR pedido vía POST /api/pedidos (HTTPS):"
RESP=$(curl -ks --resolve zuyu.local:443:10.211.55.37 -X POST https://zuyu.local/api/pedidos \
  -H "Content-Type: application/json" \
  -d "{
    \"negocioSlug\": \"demo\",
    \"cliente\": {
      \"nombre\": \"Juan Pérez (demo Daniel)\",
      \"telefono\": \"+525555550100\",
      \"email\": \"juan@example.com\",
      \"direccion\": \"Av. Reforma 100, CDMX\"
    },
    \"productos\": [
      { \"id\": \"$PROD1\", \"cantidad\": 2 },
      { \"id\": \"$PROD2\", \"cantidad\": 1 }
    ],
    \"metodoPago\": \"efectivo\"
  }")
echo "$RESP" | python3 -m json.tool 2>&1 | head -10
PEDIDO_ID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("pedidoId",""))' 2>/dev/null)
echo "    Pedido ID: $PEDIDO_ID"

# ── Paso 4: ver el pedido en MongoDB (RS distribuido) ──
echo ""
echo "[3] Verificar pedido guardado en MongoDB (RS 3 nodos):"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval "db.pedidos.find({pedidoId: '$PEDIDO_ID'}).pretty()" 2>&1 | head -25

# ── Paso 5: ver cuántos pedidos totales ──
echo ""
echo "[4] Total de pedidos en BD:"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'print("Total pedidos: " + db.pedidos.countDocuments())' 2>&1 | tail -2

# ── Paso 6: ver actividad del worker (jobs procesados en Redis) ──
echo ""
echo "[5] Worker procesó notificación (jobs completados en Redis):"
REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)
COMPLETADOS=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning ZCARD bull:notificaciones:completed 2>/dev/null | tr -dc '0-9')
echo "    Jobs notificaciones completados (total): $COMPLETADOS"
echo "    Último log del worker:"
kubectl logs -n micrositio deploy/worker --tail=5 2>/dev/null | grep -iE "completado|procesando" | tail -2

echo ""
echo "═══ FIN DEMO 1 ═══"
echo "Cierre: 'Pedido HTTPS → MongoDB RS → Worker BullMQ. End-to-end real, no mock.'"
