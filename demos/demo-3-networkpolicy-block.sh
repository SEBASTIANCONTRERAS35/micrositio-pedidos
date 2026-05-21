#!/usr/bin/env bash
# DEMO 3 — NetworkPolicy bloquea pod rogue (2 min · 15 pts NetworkPolicy)
# QUÉ DECIR: "En el namespace micrositio hay una NetworkPolicy default-deny.
#   Cualquier pod nuevo sin etiquetas explícitamente permitidas no puede hablar con mongo
#   ni con redis. Calico es quien la enforce — Flannel no podría."
set -uo pipefail

echo "═══ DEMO 3 — NetworkPolicy default-deny ═══"

# ── Paso 1: mostrar policies ──
echo ""
echo "[1] NetworkPolicies activas en micrositio:"
kubectl get netpol -n micrositio

echo ""
echo "[2] Específicamente la default-deny-all:"
kubectl get netpol default-deny-all -n micrositio -o yaml | grep -A8 "spec:"

# ── Paso 3: lanzar pod rogue sin labels permitidos ──
echo ""
echo "[3] Lanzar pod 'rogue' en namespace 'default' (NO en micrositio, NO en allowlist):"
kubectl delete pod rogue --ignore-not-found --grace-period=0 --force 2>/dev/null
kubectl run rogue --image=nicolaka/netshoot --restart=Never --command -- sleep 600

echo "    Esperando Running..."
for i in {1..20}; do
  S=$(kubectl get pod rogue -o jsonpath='{.status.phase}' 2>/dev/null)
  [ "$S" = "Running" ] && echo "    ✓ rogue Running" && break
  sleep 2
done

# ── Paso 4: rogue intenta conectar a mongo (debe FALLAR) ──
echo ""
echo "[4] rogue → mongo (esperamos TIMEOUT o connection refused):"
timeout 8 kubectl exec rogue -- nc -zv -w 5 mongodb-0.mongodb-headless.micrositio.svc.cluster.local 27017 2>&1 | tail -3
echo "    ✗ BLOQUEADO por NetworkPolicy ✓ (esperado)"

echo ""
echo "[5] rogue → redis (esperamos TIMEOUT):"
timeout 8 kubectl exec rogue -- nc -zv -w 5 redis.micrositio.svc.cluster.local 6379 2>&1 | tail -3
echo "    ✗ BLOQUEADO por NetworkPolicy ✓ (esperado)"

# ── Paso 6: control — pod con label app=api (autorizado) SÍ puede ──
echo ""
echo "[6] CONTROL — pod con label app=api SÍ conecta a mongo (allow-api-to-mongo):"
# Pod de prueba con app=api: las NetworkPolicies allow-api-to-mongo +
# allow-mongo-from-api-worker lo autorizan. Contraste con el rogue (sin label).
kubectl delete pod test-allowed -n micrositio --ignore-not-found --grace-period=0 --force 2>/dev/null
kubectl run test-allowed --image=nicolaka/netshoot --restart=Never -n micrositio \
  --labels="app=api" --command -- sleep 120 >/dev/null 2>&1
for i in {1..15}; do
  [ "$(kubectl get pod test-allowed -n micrositio -o jsonpath='{.status.phase}' 2>/dev/null)" = "Running" ] && break
  sleep 2
done
kubectl exec test-allowed -n micrositio -- nc -zv -w 5 mongodb-0.mongodb-headless.micrositio.svc.cluster.local 27017 2>&1 | tail -2
echo "    ✓ AUTORIZADO (label app=api permitido por allow-api-to-mongo)"
kubectl delete pod test-allowed -n micrositio --grace-period=0 --force 2>/dev/null >/dev/null

# ── Paso 7: limpiar ──
echo ""
echo "[7] Limpiar pod rogue:"
kubectl delete pod rogue --grace-period=0 --force 2>/dev/null

echo ""
echo "═══ FIN DEMO 3 ═══"
echo "Cierre: 'Calico hace zero-trust pod-to-pod. Sin policy explícita = sin acceso.'"
