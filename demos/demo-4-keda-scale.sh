#!/usr/bin/env bash
# DEMO 4 — KEDA scale-up + scale-down (15 pts KEDA)
# QUÉ DECIR: "KEDA observa la longitud de la cola Redis. Generamos carga
#   SOSTENIDA (push en background más rápido de lo que el worker drena):
#   KEDA dispara el HPA y escala el worker de 1 a 5. Al parar la carga,
#   el worker drena la cola y KEDA baja de vuelta a 1."
#
# Por qué carga sostenida: los jobs de prueba se procesan casi instantáneo,
# así que un push único se drena antes de que KEDA alcance a reaccionar.
# El push en background mantiene la cola llena hasta que KEDA escala.
set -uo pipefail

echo "═══ DEMO 4 — KEDA scale-up + scale-down ═══"

REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)
QUEUE=bull:notificaciones:wait

# ── Paso 1: estado inicial (asegurar que el ScaledObject no esté pausado) ──
echo ""
echo "[1] Estado INICIAL — worker en 1 réplica:"
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas- --overwrite 2>/dev/null
kubectl get scaledobject worker-scaler -n micrositio
kubectl get hpa keda-hpa-worker-scaler -n micrositio
kubectl get deploy worker -n micrositio

# ── Paso 2: carga sostenida en background ──
echo ""
echo "[2] Generando carga SOSTENIDA (push 20k jobs cada 5s, Lua server-side)..."
(
  for r in $(seq 1 30); do
    kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning \
      EVAL 'for i=1,20000 do redis.call("RPUSH", KEYS[1], "j"..i) end return 1' 1 "$QUEUE" >/dev/null 2>&1
    sleep 5
  done
) &
PUSH_PID=$!

# ── Paso 3: monitorear scale-up ──
echo ""
echo "[3] Esperando SCALE-UP (KEDA ve la cola y dispara el HPA):"
for i in {1..30}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.spec.replicas}' 2>/dev/null)
  DESIRED=$(kubectl get hpa keda-hpa-worker-scaler -n micrositio -o jsonpath='{.status.desiredReplicas}' 2>/dev/null)
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "$QUEUE" 2>/dev/null | tr -dc '0-9')
  echo "  [${i}*5s] replicas=${REP:-?} desired=${DESIRED:-?} queue=${LEN:-?}"
  if [ "${REP:-0}" -ge 4 ] 2>/dev/null; then
    echo "  ✓ SCALE-UP a $REP réplicas en $((i*5))s"
    break
  fi
  sleep 5
done

# detener la carga sostenida
kill "$PUSH_PID" 2>/dev/null
wait "$PUSH_PID" 2>/dev/null

# ── Paso 4: pods escalados ──
echo ""
echo "[4] Pods worker escalados:"
kubectl get pods -n micrositio -l app=worker -o wide

# ── Paso 5: scale-down ──
echo ""
echo "[5] Carga detenida — worker drena la cola, KEDA scale-down a 1:"
for i in {1..48}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.spec.replicas}' 2>/dev/null)
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN "$QUEUE" 2>/dev/null | tr -dc '0-9')
  echo "  [${i}*5s] replicas=${REP:-?} queue=${LEN:-0}"
  if [ "${REP:-0}" = "1" ] && [ "${LEN:-0}" = "0" ]; then
    echo "  ✓ SCALE-DOWN a 1 en $((i*5))s"
    break
  fi
  sleep 5
done

echo ""
echo "═══ FIN DEMO 4 ═══"
echo "Cierre: 'KEDA escala el worker 1→5 con la cola llena, y baja a 1 al drenar.'"
