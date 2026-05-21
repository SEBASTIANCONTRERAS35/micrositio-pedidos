#!/usr/bin/env bash
# DEMO 5 — CI/CD git push → Tekton → ArgoCD (3 min · 15 pts CI/CD)
# QUÉ DECIR: "Hago un cambio trivial al código, git push.
#   Tekton detecta el commit, buildea la imagen con Kaniko, la pushea al registry local.
#   ArgoCD detecta drift, sincroniza, y los pods nuevos se despliegan automáticamente."
#
# Pre-requisito: deben existir ya las builds previas (api en :latest).
# Esta demo SOLO valida el flujo — no espera 5 min de build completo en vivo.
set -uo pipefail

echo "═══ DEMO 5 — git push → CI/CD ═══"

REPO_DIR="${REPO_DIR:-/Users/emiliocontreras/Downloads/micrositio-pedidos}"

# ── Paso 1: hacer cambio visible en código ──
echo ""
echo "[1] Cambio trivial: actualizar ci-demo-marker en api/api.js"
cd "$REPO_DIR"
TIMESTAMP=$(date +%H%M%S)
echo "    Actualizando marcador a $TIMESTAMP (idempotente — no acumula líneas)..."
sed -i.bak "s|// ci-demo-marker:.*|// ci-demo-marker: $TIMESTAMP|" api/api.js && rm -f api/api.js.bak

# ── Paso 2: commit + push ──
echo ""
echo "[2] git add + commit + push:"
git add api/api.js
git commit -m "ci: trigger demo build $TIMESTAMP" 2>&1 | tail -3
git push origin main 2>&1 | tail -2

# ── Paso 3: lanzar PipelineRun (en producción real, Tekton EventListener detectaría el push) ──
echo ""
echo "[3] Disparar PipelineRun (en prod un EventListener + Webhook GitHub lo haría):"
PIPELINERUN=$(cat <<EOF | kubectl create -f - 2>&1 | tail -1
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: demo-build-
  namespace: ci
spec:
  pipelineRef:
    name: build-and-push
  taskRunTemplate:
    serviceAccountName: pipeline-sa
  params:
  - name: repo-url
    value: https://github.com/SEBASTIANCONTRERAS35/micrositio-pedidos.git
  - name: image
    value: 10.211.55.30:30500/micrositio-api:demo-$TIMESTAMP
  - name: dockerfile
    value: api/Dockerfile
  - name: context
    value: repo
  workspaces:
  - name: shared-workspace
    volumeClaimTemplate:
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: nfs-csi
        resources: { requests: { storage: 5Gi } }
EOF
)
echo "    $PIPELINERUN"

PR_NAME=$(echo "$PIPELINERUN" | grep -oE 'demo-build-[a-z0-9]+')

# ── Paso 4: ver pipeline corriendo en vivo ──
echo ""
echo "[4] Esperando build (Tekton clone+kaniko, ~60s):"
for i in {1..40}; do
  R=$(kubectl get pipelinerun "$PR_NAME" -n ci -o jsonpath='{.status.conditions[?(@.type=="Succeeded")].reason}' 2>/dev/null)
  echo "  [${i}*5s] $R"
  if [ "$R" = "Succeeded" ]; then echo "  ✓ Build EXITOSO en $((i*5))s" ; break ; fi
  if [ "$R" = "Failed" ]; then echo "  ✗ Build FAILED" ; break ; fi
  sleep 5
done

# ── Paso 5: imagen en registry ──
echo ""
echo "[5] Imagen pusheada al registry:"
curl -s http://10.211.55.30:30500/v2/micrositio-api/tags/list 2>/dev/null | python3 -m json.tool | head -10

# ── Paso 6: ArgoCD detecta y syncs ──
echo ""
echo "[6] ArgoCD detecta el último commit (refresh) y sincroniza:"
kubectl patch app micrositio -n argocd --type=merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}' 2>&1 | tail -1
sleep 10
kubectl get app micrositio -n argocd -o jsonpath='Sync={.status.sync.status} / Health={.status.health.status} / Rev={.status.sync.revision}' ; echo

echo ""
echo "═══ FIN DEMO 5 ═══"
echo "Cierre: 'git push → Tekton build → registry → ArgoCD detecta → pods nuevos. Sin intervención manual.'"
