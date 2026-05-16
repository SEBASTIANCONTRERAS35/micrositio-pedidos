#!/usr/bin/env bash
# DEMO EXTRA — ResourceQuota rechaza pod oversized (5 pts ResourceQuota)
# QUÉ DECIR: "El namespace micrositio tiene ResourceQuota con límites estrictos.
#   Si alguien intenta crear un pod que excede la cuota, K8s lo rechaza ANTES de schedularlo."
set -uo pipefail

echo "═══ DEMO EXTRA — ResourceQuota rechaza pod oversized ═══"

# ── Paso 1: mostrar ResourceQuota actual ──
echo ""
echo "[1] ResourceQuota del namespace micrositio:"
kubectl get resourcequota -n micrositio
echo ""
kubectl describe resourcequota -n micrositio | sed -n '/^Resource/,/^[A-Z]/p' | head -15

# ── Paso 2: intentar crear pod que excede el límite ──
echo ""
echo "[2] Intentar crear pod 'glutton' pidiendo 10 CPUs (excede el límite de 4):"
cat <<EOF > /tmp/glutton.yaml
apiVersion: v1
kind: Pod
metadata:
  name: glutton
  namespace: micrositio
  labels: { app: glutton }
spec:
  containers:
  - name: hog
    image: nginx:alpine
    resources:
      requests: { cpu: "10", memory: "20Gi" }
      limits: { cpu: "10", memory: "20Gi" }
EOF

echo ""
RESULT=$(kubectl apply -f /tmp/glutton.yaml 2>&1)
echo "$RESULT" | head -3
echo ""

if echo "$RESULT" | grep -qi "exceeded quota\|forbidden\|rejected"; then
  echo "  ✓ POD RECHAZADO por ResourceQuota ✓ (esperado)"
else
  echo "  ⚠ Pod NO rechazado — revisar quota"
fi

# ── Paso 3: probar con un pod razonable que SÍ pasa ──
echo ""
echo "[3] CONTROL — pod razonable (200m CPU, 256Mi) SÍ pasa:"
cat <<EOF | kubectl apply -f - 2>&1 | tail -2
apiVersion: v1
kind: Pod
metadata:
  name: razonable
  namespace: micrositio
spec:
  containers:
  - name: x
    image: nginx:alpine
    resources:
      requests: { cpu: 200m, memory: 256Mi }
      limits: { cpu: 500m, memory: 512Mi }
EOF
sleep 3
kubectl get pod razonable -n micrositio 2>&1 | head -2

# ── Paso 4: limpiar ──
echo ""
echo "[4] Limpiar:"
kubectl delete pod razonable -n micrositio --ignore-not-found --grace-period=0 --force 2>/dev/null
kubectl delete -f /tmp/glutton.yaml --ignore-not-found 2>/dev/null
rm -f /tmp/glutton.yaml

echo ""
echo "═══ FIN DEMO EXTRA RESOURCEQUOTA ═══"
echo "Cierre: 'ResourceQuota previene que un namespace consuma todos los recursos del cluster.'"
