#!/usr/bin/env bash
# Pre-flight check — correr 1 hora antes de la defensa
set -uo pipefail

echo "═══════════════════════════════════════════════════"
echo " PRE-FLIGHT — verificar estado del cluster"
echo "═══════════════════════════════════════════════════"

FAIL=0
ok() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo ""
echo "── 1. Nodos K8s ──"
READY=$(kubectl get nodes --no-headers | grep -cw Ready)
[ "$READY" = "3" ] && ok "3/3 nodos Ready" || fail "Solo $READY/3 nodos Ready"

echo ""
echo "── 2. ArgoCD App ──"
SYNC=$(kubectl get app micrositio -n argocd -o jsonpath='{.status.sync.status}')
HEALTH=$(kubectl get app micrositio -n argocd -o jsonpath='{.status.health.status}')
[ "$SYNC" = "Synced" ] && ok "ArgoCD Sync=Synced" || fail "ArgoCD Sync=$SYNC"
[ "$HEALTH" = "Healthy" ] && ok "ArgoCD Health=Healthy" || fail "ArgoCD Health=$HEALTH"

echo ""
echo "── 3. Pods micrositio ──"
TOTAL=$(kubectl get pods -n micrositio --no-headers | wc -l | tr -d ' ')
RUNNING=$(kubectl get pods -n micrositio --no-headers | grep -c "Running")
[ "$RUNNING" = "$TOTAL" ] && ok "$RUNNING/$TOTAL pods Running" || fail "Solo $RUNNING/$TOTAL pods Running"

echo ""
echo "── 4. MongoDB Replica Set ──"
ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d 2>/dev/null)
RS=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet -u root -p "$ROOT_PASS" --authenticationDatabase admin --eval 'rs.status().members.length' 2>/dev/null)
[ "$RS" = "3" ] && ok "3 miembros en Replica Set" || fail "Solo $RS miembros en RS"

PRIMARY=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet -u root -p "$ROOT_PASS" --authenticationDatabase admin --eval 'rs.status().members.filter(m=>m.stateStr=="PRIMARY").length' 2>/dev/null)
[ "$PRIMARY" = "1" ] && ok "1 PRIMARY elegido" || fail "Sin PRIMARY (rs.status fallido)"

echo ""
echo "── 5. KEDA ──"
KEDA_READY=$(kubectl get scaledobject worker-scaler -n micrositio -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
[ "$KEDA_READY" = "True" ] && ok "ScaledObject Ready" || fail "ScaledObject Ready=$KEDA_READY"

echo ""
echo "── 6. HTTPS ingress ──"
HTTP=$(curl -k --resolve zuyu.local:443:10.211.55.37 -s -o /dev/null -w "%{http_code}" https://zuyu.local/health/live 2>/dev/null)
[ "$HTTP" = "200" ] && ok "HTTPS zuyu.local → 200" || fail "HTTPS zuyu.local → $HTTP"

GRAFANA_HTTP=$(curl -k --resolve grafana.zuyu.local:443:10.211.55.37 -s -o /dev/null -w "%{http_code}" https://grafana.zuyu.local/login 2>/dev/null)
[ "$GRAFANA_HTTP" = "200" ] && ok "HTTPS grafana → 200" || fail "HTTPS grafana → $GRAFANA_HTTP"

echo ""
echo "── 7. Registry local ──"
CATALOG=$(curl -s http://10.211.55.30:30500/v2/_catalog 2>/dev/null)
echo "$CATALOG" | grep -q micrositio-api && ok "micrositio-api en registry" || fail "micrositio-api NO en registry"
echo "$CATALOG" | grep -q micrositio-worker && ok "micrositio-worker en registry" || fail "micrositio-worker NO en registry"

echo ""
echo "── 8. NetworkPolicies ──"
NP=$(kubectl get netpol -n micrositio --no-headers | wc -l | tr -d ' ')
[ "$NP" -ge 10 ] && ok "$NP NetworkPolicies aplicadas" || fail "Solo $NP NetworkPolicies"

echo ""
echo "── 9. Rollouts ──"
ROLLOUT=$(kubectl get rollout api -n micrositio -o jsonpath='{.status.availableReplicas}/{.status.replicas}' 2>/dev/null)
[ "$ROLLOUT" = "2/2" ] && ok "Rollout api $ROLLOUT" || fail "Rollout api $ROLLOUT (esperado 2/2)"

echo ""
echo "── 10. Argo Rollouts CLI plugin ──"
which kubectl-argo-rollouts >/dev/null 2>&1 && ok "kubectl argo rollouts instalado" || fail "kubectl argo rollouts NO instalado (necesario para demo 6)"

echo ""
echo "═══════════════════════════════════════════════════"
if [ "$FAIL" = "0" ]; then
  echo " ✓ CLUSTER LISTO PARA DEFENSA"
else
  echo " ✗ $FAIL CHECKS FALLARON — revisar antes de demo"
fi
echo "═══════════════════════════════════════════════════"
exit $FAIL
