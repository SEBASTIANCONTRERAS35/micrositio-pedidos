#!/usr/bin/env bash
# DEMO 4 — KEDA scale-up + scale-down (3 min · 15 pts KEDA)
# QUÉ DECIR: "El worker drena la cola en milisegundos por eso pausamos el ScaledObject
#   temporalmente (paused-replicas=0), pushamos 500 jobs (KEDA verá la cola enorme),
#   reanudamos. KEDA dispara HPA y escala worker a 5. Worker drena, KEDA baja a 1."
set -uo pipefail

echo "═══ DEMO 4 — KEDA scale-up + scale-down ═══"

REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)

# ── Paso 1: estado inicial ──
echo ""
echo "[1] Estado INICIAL — worker en 1 réplica:"
kubectl get scaledobject worker-scaler -n micrositio
kubectl get hpa keda-hpa-worker-scaler -n micrositio
kubectl get deploy worker -n micrositio

# ── Paso 2: pausar KEDA (worker queda en 0) ──
echo ""
echo "[2] PAUSAR KEDA a 0 réplicas para que no consuma:"
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas=0 --overwrite
echo "    Esperando worker → 0..."
for i in {1..15}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.spec.replicas}')
  STATUS_REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  [ "$REP" = "0" ] && [ "$STATUS_REP" = "" ] && echo "    ✓ worker a 0 réplicas en $((i*3))s" && break
  sleep 3
done

# ── Paso 3: push 500 jobs (sobra incluso si KEDA tarda) ──
echo ""
echo "[3] Push 500 jobs a 'bull:notificaciones:wait' (con worker pausado):"
for i in $(seq 1 500); do
  kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning RPUSH bull:notificaciones:wait "{\"jobId\":\"demo-$i\"}" >/dev/null 2>&1
done
LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null | tr -dc '0-9')
echo "    ✓ Cola: $LEN jobs"

# ── Paso 4: reanudar KEDA ──
echo ""
echo "[4] REANUDAR ScaledObject — KEDA verá 500 jobs y escalará MAX:"
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas- --overwrite

echo ""
echo "[5] Esperando SCALE-UP:"
for i in {1..18}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}' 2>/dev/null)
  DESIRED=$(kubectl get hpa keda-hpa-worker-scaler -n micrositio -o jsonpath='{.status.desiredReplicas}' 2>/dev/null)
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null | tr -dc '0-9')
  echo "  [${i}*5s] replicas=$REP desired=$DESIRED queue=$LEN"
  if [ "${REP:-0}" -ge 4 ] 2>/dev/null; then
    echo "  ✓ SCALE-UP a $REP en $((i*5))s"
    break
  fi
  sleep 5
done

echo ""
echo "[6] Pods worker (escalados):"
kubectl get pods -n micrositio -l app=worker -o wide

# ── Paso 7: drain + scale-down ──
echo ""
echo "[7] Worker drena la cola, KEDA scale-down a 1:"
for i in {1..30}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null | tr -dc '0-9')
  echo "  [${i}*5s] replicas=$REP queue=${LEN:-0}"
  if [ "$REP" = "1" ] && [ "${LEN:-0}" = "0" ]; then
    echo "  ✓ SCALE-DOWN a 1 en $((i*5))s (cola vacía)"
    break
  fi
  sleep 5
done

echo ""
echo "═══ FIN DEMO 4 ═══"
echo "Cierre: 'KEDA escala worker 1→5 cuando cola >5, y baja a min=1 cuando drena.'"
