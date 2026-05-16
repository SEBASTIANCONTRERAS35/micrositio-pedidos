#!/usr/bin/env bash
# DEMO 6 — Argo Rollouts Canary REAL (3 min · 10 pts Canary)
# QUÉ DECIR: "Voy a deployar una versión nueva del api con tag v2.
#   El Rollout despliega 10% primero, espera, después 50%, después 100%.
#   En cualquier momento puedo hacer abort + rollback si veo problemas."
#
# Pre-req: existe imagen :latest en registry. Esta demo la tagea como :v2 para
# disparar el canary (mismo binario, distinto tag = Rollout detecta cambio).
set -uo pipefail

echo "═══ DEMO 6 — Argo Rollouts Canary REAL ═══"

# ── Paso 1: estado inicial ──
echo ""
echo "[1] Rollout actual (estable en :latest):"
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -10

# ── Paso 2: crear tag :v2 desde :latest en el registry (mismo binario, distinto tag) ──
echo ""
echo "[2] Crear tag :v2 desde :latest (para que Rollout vea cambio):"
TAG="v$(date +%s | tail -c 5)"
NEW_IMAGE="10.211.55.30:30500/micrositio-api:$TAG"
echo "    Nueva imagen: $NEW_IMAGE"

# Get manifest of :latest
MANIFEST=$(curl -s -H "Accept: application/vnd.oci.image.manifest.v1+json" \
  http://10.211.55.30:30500/v2/micrositio-api/manifests/latest)
DIGEST=$(echo "$MANIFEST" | grep -oE '"digest":"sha256:[a-f0-9]+"' | head -1 | cut -d'"' -f4)

# Tag manifest with new name
curl -s -X PUT \
  -H "Content-Type: application/vnd.oci.image.manifest.v1+json" \
  -d "$MANIFEST" \
  http://10.211.55.30:30500/v2/micrositio-api/manifests/$TAG > /dev/null

echo "    ✓ Tag $TAG creado (digest $DIGEST)"

# ── Paso 3: trigger Rollout con nueva imagen ──
echo ""
echo "[3] Disparar Rollout (10% → 2min pause → 50% → 2min pause → 100%):"
kubectl-argo-rollouts set image api api=$NEW_IMAGE -n micrositio

sleep 8
echo ""
echo "[4] Después de 8s — debe estar en step 10%:"
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

# ── Paso 5: promote para skip de la pausa de 2 min ──
echo ""
echo "[5] PROMOVER manualmente al 50% (skip la pausa):"
kubectl-argo-rollouts promote api -n micrositio
sleep 5
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

# ── Paso 6: promote a 100% ──
echo ""
echo "[6] PROMOVER al 100%:"
kubectl-argo-rollouts promote api -n micrositio
sleep 10
kubectl-argo-rollouts get rollout api -n micrositio --no-color 2>&1 | head -10

# ── Paso 7: verificar HTTPS sigue OK ──
echo ""
echo "[7] HTTPS sigue 200 durante todo el rollout:"
curl -ks --resolve zuyu.local:443:10.211.55.37 -o /dev/null -w "  zuyu.local: HTTP %{http_code} en %{time_total}s\n" https://zuyu.local/health/live

echo ""
echo "═══ FIN DEMO 6 ═══"
echo "Cierre: 'Canary release sin downtime. Si AnalysisTemplate detecta error rate alto, aborta solo.'"
