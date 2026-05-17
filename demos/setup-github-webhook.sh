#!/usr/bin/env bash
# Setup ArgoCD webhook secret + ingress argocd.zuyu.local
# Después: configurar webhook en GitHub UI (instrucciones al final)
set -uo pipefail

echo "═══ Setup GitHub Webhook → ArgoCD ═══"

# ── 1. Generar webhook secret + patchear argocd-secret ──
echo ""
echo "[1] Generar webhook secret:"
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "    Secret generado (${WEBHOOK_SECRET:0:16}...)"

kubectl patch secret argocd-secret -n argocd --type=merge \
  -p "{\"stringData\":{\"webhook.github.secret\":\"$WEBHOOK_SECRET\"}}"
echo "    ✓ argocd-secret patcheado"

# ── 2. Restart argocd-server para que recargue el secret ──
echo ""
echo "[2] Restart argocd-server:"
kubectl rollout restart deploy/argocd-server -n argocd
kubectl rollout status deploy/argocd-server -n argocd --timeout=60s

# ── 3. Exponer ArgoCD vía Ingress ──
echo ""
echo "[3] Crear Ingress argocd.zuyu.local:"
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd
  namespace: argocd
  annotations:
    cert-manager.io/cluster-issuer: zuyu-ca-issuer
    nginx.ingress.kubernetes.io/backend-protocol: HTTPS
    nginx.ingress.kubernetes.io/ssl-passthrough: "false"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [argocd.zuyu.local]
      secretName: argocd-tls
  rules:
    - host: argocd.zuyu.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
EOF
echo "    ✓ Ingress aplicado"

# ── 4. Mostrar URL del webhook ──
echo ""
echo "═══ INSTRUCCIONES MANUALES — configurar en GitHub ═══"
echo ""
echo "1. Añadir a /etc/hosts del Mac:"
echo "     10.211.55.37 argocd.zuyu.local"
echo ""
echo "2. Ir a:"
echo "     https://github.com/SEBASTIANCONTRERAS35/micrositio-pedidos/settings/hooks/new"
echo ""
echo "3. Llenar:"
echo "     Payload URL:   https://argocd.zuyu.local/api/webhook"
echo "     Content type:  application/json"
echo "     Secret:        $WEBHOOK_SECRET"
echo "     Events:        Just the push event"
echo "     Active:        ✓"
echo ""
echo "4. Save → GitHub prueba el endpoint (esperar ✓ verde)"
echo ""
echo "5. Probar: hacer cualquier git push → ArgoCD detecta INSTANTE"
