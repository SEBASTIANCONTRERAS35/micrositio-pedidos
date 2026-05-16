#!/usr/bin/env bash
# DEMO 2 — MongoDB Replica Set failover (2 min · 15 pts MongoDB RS)
# QUÉ DECIR: "Mongo está en Replica Set 3 nodos distribuidos en 3 máquinas distintas.
#   Si mato el PRIMARY, un SECONDARY se elige en menos de 10s, y los datos sobreviven."
set -uo pipefail

echo "═══ DEMO 2 — MongoDB failover ═══"

ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)

# ── Paso 1: estado ANTES ──
echo ""
echo "[1] Estado ANTES (1 PRIMARY + 2 SECONDARY distribuidos):"
kubectl get pods -n micrositio -l app=mongodb -o wide
echo ""
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.forEach(m => print(m.name.split(".")[0].padEnd(12) + m.stateStr))'

PRIMARY=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.find(m=>m.stateStr=="PRIMARY").name.split(".")[0]' | tr -d '[:space:]')

echo ""
echo "PRIMARY actual: $PRIMARY"

# ── Paso 2: matar el PRIMARY ──
echo ""
echo "[2] Matando pod $PRIMARY (PRIMARY)..."
kubectl delete pod "$PRIMARY" -n micrositio --grace-period=5

# ── Paso 3: esperar nuevo PRIMARY ──
echo ""
echo "[3] Esperando elección de nuevo PRIMARY..."
for i in {1..20}; do
  NEW=$(kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
    -u root -p "$ROOT_PASS" --authenticationDatabase admin \
    --eval 'rs.status().members.find(m=>m.stateStr=="PRIMARY")?.name.split(".")[0]' 2>/dev/null | tr -d '[:space:]')
  if [ -n "$NEW" ] && [ "$NEW" != "$PRIMARY" ] && [ "$NEW" != "undefined" ]; then
    echo "  ✓ Nuevo PRIMARY: $NEW en $((i*2))s"
    break
  fi
  sleep 2
done

# ── Paso 4: estado durante failover ──
echo ""
echo "[4] Estado durante failover:"
kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.forEach(m => print(m.name.split(".")[0].padEnd(12) + m.stateStr))'

# ── Paso 5: la app sigue funcionando ──
echo ""
echo "[5] La app sigue respondiendo (el driver Node hace auto-reconnect al nuevo PRIMARY):"
curl -k --resolve zuyu.local:443:10.211.55.37 -s -o /dev/null -w "  HTTPS health/live: %{http_code} en %{time_total}s\n" https://zuyu.local/health/live

# ── Paso 6: esperar mongo-0 vuelva ──
echo ""
echo "[6] Esperando que el pod muerto vuelva como SECONDARY..."
for i in {1..30}; do
  STATE=$(kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
    -u root -p "$ROOT_PASS" --authenticationDatabase admin \
    --eval "rs.status().members.find(m=>m.name.startsWith(\"$PRIMARY\"))?.stateStr" 2>/dev/null | tr -d '[:space:]')
  if [ "$STATE" = "SECONDARY" ] || [ "$STATE" = "PRIMARY" ]; then
    echo "  ✓ $PRIMARY rejoint como $STATE en $((i*3))s"
    break
  fi
  sleep 3
done

echo ""
echo "═══ FIN DEMO 2 ═══"
echo "Cierre: 'El RS tolera fallos de nodo sin downtime de la app. Failover automático en <10s.'"
