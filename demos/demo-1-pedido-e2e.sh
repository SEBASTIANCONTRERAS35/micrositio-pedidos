#!/usr/bin/env bash
# DEMO 1 — Flujo de pedido end-to-end (4 min · 5 pts App funcional)
# QUÉ DECIR mientras corre: "Esta es la app real corriendo en el cluster,
#   desplegada por ArgoCD desde Git. Hago un pedido, lo confirmo, y el worker
#   solicita el repartidor."
set -uo pipefail

echo "═══ DEMO 1 — Pedido end-to-end ═══"

# ── Paso 1: abrir el micrositio en el browser ──
echo ""
echo "[1] Abrir https://zuyu.local/tienda/demo en el browser"
echo "    (asumiendo /etc/hosts ya tiene zuyu.local apuntando a un worker)"
open "https://zuyu.local/tienda/demo" 2>/dev/null || echo "  (en Mac: open; en Linux: xdg-open; o pega la URL manualmente)"

# ── Paso 2: obtener productos reales del negocio (ObjectIds) ──
echo ""
echo "[2a] Obtener catálogo de productos del negocio demo:"
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
PROD_IDS=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'db.productos.find({},{_id:1}).limit(2).toArray().map(p => p._id.toString()).join(" ")' 2>/dev/null | tail -1)
PROD1=$(echo $PROD_IDS | awk '{print $1}')
PROD2=$(echo $PROD_IDS | awk '{print $2}')
echo "    Producto 1: $PROD1"
echo "    Producto 2: $PROD2"

echo ""
echo "[2b] Crear pedido vía API (simula checkout del cliente):"

curl -ks --resolve zuyu.local:443:10.211.55.37 -X POST https://zuyu.local/api/pedidos \
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
  }" | python3 -m json.tool 2>&1 | head -20

# ── Paso 3: listar pedidos ──
echo ""
echo "[3] Listar pedidos recientes (vía panel del dueño):"
curl -ks --resolve zuyu.local:443:10.211.55.37 https://zuyu.local/api/pedidos | python3 -m json.tool 2>&1 | head -20

# ── Paso 4: ver el pedido en MongoDB ──
echo ""
echo "[4] Verificar que el pedido se guardó en MongoDB (replica set):"
ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'use micrositio; db.pedidos.find().sort({creadoEn:-1}).limit(1).pretty()' 2>&1 | head -25

# ── Paso 5: ver el job en la cola Redis ──
echo ""
echo "[5] Worker debe haber procesado un job 'notificaciones':"
REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)
kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null
kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning KEYS "bull:*" 2>/dev/null | head -5

echo ""
echo "═══ FIN DEMO 1 ═══"
echo "Cierre: 'El pedido se creó, se guardó en MongoDB RS, y el worker fue notificado vía BullMQ.'"
