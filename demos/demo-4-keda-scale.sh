#!/usr/bin/env bash
# DEMO 4 — KEDA scale-up + scale-down (3 min · 15 pts KEDA)
# QUÉ DECIR: "El worker drena la cola en milisegundos. Para mostrar KEDA en acción,
#   primero pauso el worker, push 50 jobs, KEDA detecta cola llena y escala a 5.
#   Luego reanudo el worker, drena, y KEDA baja a 1."
set -uo pipefail

echo "═══ DEMO 4 — KEDA scale-up + scale-down ═══"

REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)

# ── Paso 1: estado inicial ──
echo ""
echo "[1] Estado INICIAL:"
kubectl get scaledobject worker-scaler -n micrositio
kubectl get hpa keda-hpa-worker-scaler -n micrositio
kubectl get pods -n micrositio -l app=worker

# ── Paso 2: pausar el worker (scale down a 0) ──
echo ""
echo "[2] PAUSAR worker (para que NO consuma la cola y KEDA pueda ver backlog):"
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas=0 --overwrite
sleep 8
kubectl get pods -n micrositio -l app=worker

# ── Paso 3: push 50 jobs ──
echo ""
echo "[3] Push 50 jobs a 'bull:notificaciones:wait':"
for i in $(seq 1 50); do
  kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning RPUSH bull:notificaciones:wait "{\"jobId\":\"demo-$i\"}" >/dev/null 2>&1
done
LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null)
echo "    ✓ Cola: $LEN jobs"

# ── Paso 4: reanudar worker (KEDA verá la cola y escalará) ──
echo ""
echo "[4] REANUDAR ScaledObject — KEDA verá cola llena y escalará a 5:"
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas- --overwrite 2>/dev/null
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused- --overwrite 2>/dev/null

echo ""
echo "[5] Esperando SCALE-UP (KEDA polling cada 10s):"
for i in {1..15}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  DESIRED=$(kubectl get hpa keda-hpa-worker-scaler -n micrositio -o jsonpath='{.status.desiredReplicas}' 2>/dev/null)
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null)
  echo "  [${i}*5s] replicas=$REP desired=$DESIRED queue=$LEN"
  if [ "$REP" -ge 5 ]; then
    echo "  ✓ SCALE-UP a $REP en $((i*5))s"
    break
  fi
  sleep 5
done

echo ""
echo "[6] Pods worker (debe haber hasta 5):"
kubectl get pods -n micrositio -l app=worker -o wide

# ── Paso 7: esperar drain natural y scale-down ──
echo ""
echo "[7] Worker drena la cola y KEDA hace scale-down a 1:"
for i in {1..30}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  LEN=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$REDIS_PASS" --no-auth-warning LLEN bull:notificaciones:wait 2>/dev/null)
  echo "  [${i}*5s] replicas=$REP queue=$LEN"
  if [ "$REP" = "1" ] && [ "$LEN" = "0" ]; then
    echo "  ✓ SCALE-DOWN a 1 en $((i*5))s (cola vacía)"
    break
  fi
  sleep 5
done

echo ""
echo "═══ FIN DEMO 4 ═══"
echo "Cierre: 'KEDA escala según la longitud de cola Redis. Sin demanda, baja a min=1.'"
