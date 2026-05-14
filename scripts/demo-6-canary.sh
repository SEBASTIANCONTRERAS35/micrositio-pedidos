#!/bin/bash
# Demo 6: Argo Rollouts Canary 10% -> 50% -> 100% (2 min)
set -e
NS=micrositio

echo "════════════════════════════════════════════════════"
echo "DEMO 6: Canary Release (2 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Estado actual del Rollout:"
kubectl argo rollouts get rollout api -n $NS

echo ""
echo "2. Desplegar nueva version (cambiar tag de imagen)"
read -p "Tag de la nueva imagen (ej: v2): " NEW_TAG
kubectl argo rollouts set image api -n $NS \
  api=docker.io/sebastiancontreras35/micrositio-api:$NEW_TAG

echo ""
echo "3. Watch del rollout (10% del trafico va a la version nueva):"
echo "   En otra terminal: kubectl argo rollouts get rollout api -n $NS --watch"
echo ""

read -p "[Esperar a que el step de pause de 2 min termine, luego ENTER]"

echo ""
echo "4. Promover al 50%:"
kubectl argo rollouts promote api -n $NS

read -p "[Esperar al siguiente pause, luego ENTER]"

echo ""
echo "5. Promover al 100%:"
kubectl argo rollouts promote api -n $NS

echo ""
echo "6. Estado final:"
kubectl argo rollouts get rollout api -n $NS

echo ""
echo "BONUS: probar rollback con imagen rota"
read -p "Probar rollback? [y/N]: " ROLLBACK
if [ "$ROLLBACK" = "y" ]; then
  kubectl argo rollouts set image api -n $NS \
    api=docker.io/sebastiancontreras35/micrositio-api:imagen-rota
  echo "Esperar a que AnalysisTemplate detecte error rate > 5% y aborte..."
  sleep 30
  kubectl argo rollouts abort api -n $NS
  kubectl argo rollouts undo api -n $NS
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "DEMO 6 COMPLETADA"
echo "════════════════════════════════════════════════════"
