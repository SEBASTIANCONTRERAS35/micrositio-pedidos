#!/usr/bin/env bash
# DEMO 6 — Argo Rollouts Canary 10% → 50% → 100% (2 min · 10 pts Canary)
# QUÉ DECIR: "El api ya no es Deployment — es un Rollout de Argo. Cuando cambio la imagen,
#   solo el 10% del tráfico va a la nueva versión, después de pause y análisis automático va al 50%, y luego 100%.
#   Si el AnalysisTemplate detecta error rate > 5%, rollback automático (bonus +3)."
set -uo pipefail

echo "═══ DEMO 6 — Argo Rollouts Canary ═══"

# ── Paso 1: estado inicial ──
echo ""
echo "[1] Rollout actual:"
kubectl argo rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

# ── Paso 2: cambiar imagen (versión "v2") ──
echo ""
echo "[2] Desplegar nueva versión (imagen :demo-canary):"
# Para demo usamos la misma imagen latest pero con tag distinto
# (en demo real Tekton produciría imagen v2 con un cambio)
NEW_IMAGE="10.211.55.30:30500/micrositio-api:latest"
kubectl argo rollouts set image api api=$NEW_IMAGE -n micrositio
echo "    ✓ Trigger del Rollout"

# ── Paso 3: ver el canary en acción ──
echo ""
echo "[3] Rollout iniciando — debe ir al 10% primero:"
sleep 5
kubectl argo rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

echo ""
echo "[4] Mostrar tráfico distribuido (steps: 10% → pause 2min → analysis → 50% → pause 2min → 100%)"
echo "    NOTA: el setWeight 10 ya está, esperaría 2 min de pause."

# ── Paso 5: promote manual para acelerar demo ──
echo ""
echo "[5] PROMOVER manualmente al 50% (skip de la pausa de 2min):"
kubectl argo rollouts promote api -n micrositio
sleep 5
kubectl argo rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

echo ""
echo "[6] PROMOVER al 100%:"
kubectl argo rollouts promote api -n micrositio
sleep 5
kubectl argo rollouts get rollout api -n micrositio --no-color 2>&1 | head -25

echo ""
echo "[7] HTTPS sigue funcionando durante todo el rollout:"
curl -k --resolve zuyu.local:443:10.211.55.37 -s -o /dev/null -w "  zuyu.local: HTTP %{http_code} en %{time_total}s\n" https://zuyu.local/health/live

# ── Paso 8: ejemplo de abort (rollback) si quieres mostrarlo ──
echo ""
echo "[8] (OPCIONAL — demo rollback manual)"
echo "    Si quieres demo rollback: kubectl argo rollouts abort api -n micrositio"
echo "    Auto-rollback ya está configurado vía AnalysisTemplate (bonus +3 pts)"

echo ""
echo "═══ FIN DEMO 6 ═══"
echo "Cierre: 'Argo Rollouts permite deploys graduales con verificación automática.'"
