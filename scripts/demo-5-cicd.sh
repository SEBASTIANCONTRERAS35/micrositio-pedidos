#!/bin/bash
# Demo 5: CI/CD git push -> Tekton -> ArgoCD -> deploy automatico (3 min)
set -e

echo "════════════════════════════════════════════════════"
echo "DEMO 5: CI/CD git push → deploy automatico (3 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Hacer un cambio visible en una vista EJS"
echo "   Ej: cambiar el titulo del header en api/views/tienda/index.ejs"
echo ""

read -p "[Pulsa ENTER cuando hayas hecho el cambio]"

echo ""
echo "2. Commit y push:"
git add api/views/tienda/index.ejs
git commit -m "demo: cambio visible para defensa"
git push origin main

echo ""
echo "3. Abrir Tekton Dashboard (en otra terminal):"
echo "   kubectl port-forward -n tekton-pipelines svc/tekton-dashboard 9097:9097"
echo "   open http://localhost:9097"
echo ""
echo "4. Abrir ArgoCD UI:"
echo "   kubectl port-forward -n argocd svc/argocd-server 8080:443"
echo "   open https://localhost:8080"
echo "   (User: admin, password: kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' | base64 -d)"
echo ""

echo "5. Mostrar:"
echo "   - PipelineRun corriendo en Tekton (clone -> trivy -> test -> kaniko-build -> push)"
echo "   - ArgoCD Application: estado 'OutOfSync' -> 'Syncing' -> 'Synced'"
echo "   - kubectl get pods -n micrositio (la nueva imagen aparece)"
echo ""

echo "6. En ~2 min el cambio esta en el cluster. Refrescar el browser:"
echo "   https://zuyu.local/tienda/demo"
echo ""

echo "════════════════════════════════════════════════════"
echo "DEMO 5 COMPLETADA"
echo "════════════════════════════════════════════════════"
