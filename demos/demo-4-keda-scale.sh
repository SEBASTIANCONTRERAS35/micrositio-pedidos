#!/usr/bin/env bash
# DEMO 4 — KEDA scale-up + scale-down (3 min · 15 pts KEDA)
# QUÉ DECIR: "El worker arranca con 1 réplica. Cuando la cola Redis bull:notificaciones:wait
#   tiene más de 5 jobs, KEDA dispara HPA y escala hasta 5 réplicas. Cuando la cola se vacía,
#   baja de regreso a 1 (cooldown 30s)."
set -uo pipefail

echo "═══ DEMO 4 — KEDA scale-up + scale-down ═══"

REDIS_PASS=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)

# ── Paso 1: estado inicial ──
echo ""
echo "[1] Estado INICIAL (worker debe ser 1 réplica):"
kubectl get deploy worker -n micrositio
kubectl get scaledobject worker-scaler -n micrositio
kubectl get hpa keda-hpa-worker-scaler -n micrositio 2>/dev/null

# ── Paso 2: encolar 50 jobs ──
echo ""
echo "[2] Encolar 50 jobs a 'bull:notificaciones:wait':"
for i in $(seq 1 50); do
  kubectl exec redis-0 -n micrositio -- redis-cli -a "$REDIS_PASS" RPUSH bull:notificaciones:wait "{\"jobId\":\"demo-$i\"}" >/dev/null 2>&1
done
LEN=$(kubectl exec redis-0 -n micrositio -- redis-cli -a "$REDIS_PASS" LLEN bull:notificaciones:wait 2>/dev/null)
echo "    ✓ Cola actual: $LEN jobs"

# ── Paso 3: ver KEDA escalar (poll cada 10s) ──
echo ""
echo "[3] Esperando scale-up (KEDA polling 10s):"
for i in {1..18}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  TARGET=$(kubectl get hpa keda-hpa-worker-scaler -n micrositio -o jsonpath='{.status.desiredReplicas}' 2>/dev/null)
  echo "  [${i}*5s] replicas=$REP desired=$TARGET"
  if [ "$REP" -ge 5 ]; then
    echo "  ✓ SCALE-UP a $REP réplicas en $((i*5))s"
    break
  fi
  sleep 5
done

echo ""
echo "[4] Pods worker (debe haber 5):"
kubectl get pods -n micrositio -l app=worker -o wide

# ── Paso 5: drenar cola ──
echo ""
echo "[5] Drenar cola (simular que worker consumió todo):"
for i in $(seq 1 50); do
  kubectl exec redis-0 -n micrositio -- redis-cli -a "$REDIS_PASS" LPOP bull:notificaciones:wait >/dev/null 2>&1
done
echo "    ✓ Cola vacía"

# ── Paso 6: ver scale-down ──
echo ""
echo "[6] Esperando SCALE-DOWN (cooldownPeriod 30s + stabilizationWindow 30s):"
for i in {1..24}; do
  REP=$(kubectl get deploy worker -n micrositio -o jsonpath='{.status.replicas}')
  echo "  [${i}*5s] replicas=$REP"
  if [ "$REP" = "1" ]; then
    echo "  ✓ SCALE-DOWN a 1 en $((i*5))s"
    break
  fi
  sleep 5
done

echo ""
echo "═══ FIN DEMO 4 ═══"
echo "Cierre: 'KEDA + HPA escalan/desescalan automáticamente según métricas custom de Redis.'"
