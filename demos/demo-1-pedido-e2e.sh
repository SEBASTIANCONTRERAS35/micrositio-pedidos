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

# ── Paso 2: crear pedido via API ──
echo ""
echo "[2] Crear pedido vía API (simula checkout del cliente):"
PEDIDO_ID="PED-$(date +%y%m)-$(printf '%04d' $RANDOM)"
echo "    pedidoId: $PEDIDO_ID"

curl -k --resolve zuyu.local:443:10.211.55.37 -s -X POST https://zuyu.local/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{
    "negocioSlug": "demo",
    "cliente": {
      "nombre": "Juan Pérez (demo Daniel)",
      "telefono": "+525555550100",
      "email": "juan@example.com",
      "direccion": "Av. Reforma 100, CDMX"
    },
    "productos": [
      { "id": "PROD-001", "cantidad": 2 },
      { "id": "PROD-002", "cantidad": 1 }
    ],
    "metodoPago": "efectivo"
  }' | python3 -m json.tool 2>&1 | head -15

# ── Paso 3: listar pedidos ──
echo ""
echo "[3] Listar pedidos recientes (vía panel del dueño):"
curl -k --resolve zuyu.local:443:10.211.55.37 -s https://zuyu.local/api/pedidos | python3 -m json.tool 2>&1 | head -20

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
kubectl exec redis-0 -n micrositio -- redis-cli -a "$REDIS_PASS" LLEN bull:notificaciones:wait 2>/dev/null
kubectl exec redis-0 -n micrositio -- redis-cli -a "$REDIS_PASS" KEYS "bull:*" 2>/dev/null | head -5

echo ""
echo "═══ FIN DEMO 1 ═══"
echo "Cierre: 'El pedido se creó, se guardó en MongoDB RS, y el worker fue notificado vía BullMQ.'"
