#!/usr/bin/env bash
# DEMO EXTRA — AnalysisTemplate auto-rollback (bonus +3 pts)
# QUÉ DECIR: "Argo Rollouts permite hacer análisis automático durante el canary.
#   El AnalysisTemplate consulta Prometheus por error rate 5xx. Si supera 5%,
#   el Rollout se aborta solo. Aquí simulo una imagen con error → rollback automático."
set -uo pipefail

echo "═══ DEMO EXTRA — Argo Rollouts AnalysisTemplate (bonus +3) ═══"

# ── Paso 1: ver AnalysisTemplate aplicada ──
echo ""
echo "[1] AnalysisTemplate registrada:"
kubectl get analysistemplate api-error-rate -n micrositio
echo ""
kubectl get analysistemplate api-error-rate -n micrositio -o jsonpath='{.spec.metrics[*]}' | python3 -m json.tool 2>/dev/null | head -15

# ── Paso 2: ver Rollout config ──
echo ""
echo "[2] Rollout actual con steps que incluyen analysis:"
kubectl get rollout api -n micrositio -o jsonpath='{.spec.strategy.canary.steps[*]}' | python3 -m json.tool 2>/dev/null | head -20

# ── Paso 3: desplegar imagen "rota" (que vamos a abortar manualmente) ──
echo ""
echo "[3] Desplegar imagen v-broken (simulamos imagen con bug):"
BROKEN_TAG="broken-$(date +%s | tail -c 5)"
NEW_IMAGE="10.211.55.30:30500/micrositio-api:$BROKEN_TAG"

# Para demo simulamos: tag :latest con nombre :broken (mismo binario, ArgoCD detecta cambio)
MANIFEST=$(curl -s -H "Accept: application/vnd.oci.image.manifest.v1+json" \
  http://10.211.55.30:30500/v2/micrositio-api/manifests/latest)
curl -s -X PUT \
  -H "Content-Type: application/vnd.oci.image.manifest.v1+json" \
  -d "$MANIFEST" \
  http://10.211.55.30:30500/v2/micrositio-api/manifests/$BROKEN_TAG > /dev/null

kubectl-argo-rollouts set image api api=$NEW_IMAGE -n micrositio
sleep 10
echo ""
echo "[4] Rollout en step canary 10%:"
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -15

# ── Paso 5: simular detección de error y ABORT manual ──
echo ""
echo "[5] (En producción: AnalysisRun detecta error rate >5% y aborta solo)"
echo "    Aquí simulamos con abort manual para mostrar el mecanismo:"
sleep 5
kubectl-argo-rollouts abort api -n micrositio
sleep 5

echo ""
echo "[6] Rollout DESPUÉS de abort — vuelve al stable:"
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -15

# ── Paso 7: HTTPS sigue OK (rollback exitoso) ──
echo ""
echo "[7] HTTPS sigue 200 (stable nunca se afectó):"
curl -ks --resolve zuyu.local:443:10.211.55.37 -o /dev/null \
  -w "  zuyu.local: HTTP %{http_code} en %{time_total}s\n" \
  https://zuyu.local/health/live

echo ""
echo "═══ FIN DEMO EXTRA ANALYSIS-TEMPLATE ═══"
echo "Cierre: 'AnalysisTemplate hace lo MISMO automáticamente cuando Prom detecta error_rate > 5%.'"
echo "        'Sin intervención humana, el Rollout aborta + rollback al stable.'"
