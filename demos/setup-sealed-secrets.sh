#!/usr/bin/env bash
# Setup Sealed Secrets controller + convertir secrets actuales a SealedSecrets
# Correr UNA SOLA VEZ después de levantar el cluster
set -uo pipefail

echo "═══ Setup Sealed Secrets ═══"

# ── 1. Instalar controller ──
echo ""
echo "[1] Instalar Sealed Secrets controller v0.27.1:"
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml
echo "Esperando controller Ready (max 60s)..."
kubectl wait --for=condition=available --timeout=60s deployment/sealed-secrets-controller -n kube-system

# ── 2. Instalar kubeseal CLI en el master (si no existe) ──
echo ""
echo "[2] Verificar kubeseal CLI:"
if ! which kubeseal >/dev/null 2>&1 ; then
  echo "    Descargando kubeseal v0.27.1 ARM64..."
  curl -sLO https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/kubeseal-0.27.1-linux-arm64.tar.gz
  tar xf kubeseal-0.27.1-linux-arm64.tar.gz kubeseal
  sudo mv kubeseal /usr/local/bin/
  rm -f kubeseal-0.27.1-linux-arm64.tar.gz
  echo "    ✓ kubeseal instalado"
fi
kubeseal --version

# ── 3. Exportar la public cert del controller (para uso futuro) ──
echo ""
echo "[3] Exportar public cert del controller a /tmp/sealed-secrets-cert.pem:"
kubeseal --fetch-cert > /tmp/sealed-secrets-cert.pem
echo "    ✓ Cert exportada"

# ── 4. Convertir los 5 secrets existentes a SealedSecrets ──
echo ""
echo "[4] Convertir secrets de micrositio a SealedSecrets:"
mkdir -p /tmp/sealed-out
for SEC in api-env api-jwt redis-auth mongodb-keyfile mongodb-users ; do
  echo ""
  echo "  → $SEC"
  kubectl get secret $SEC -n micrositio -o yaml | \
    sed '/creationTimestamp\|resourceVersion\|uid\|selfLink/d' | \
    kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
    > /tmp/sealed-out/${SEC}.sealedsecret.yaml 2>&1 || echo "    ⚠ Falló (verificar)"
  echo "    Output: /tmp/sealed-out/${SEC}.sealedsecret.yaml"
done

echo ""
echo "═══ DONE ═══"
echo ""
echo "Próximos pasos manuales:"
echo "  1. Copiar /tmp/sealed-out/*.sealedsecret.yaml a tu repo en k8s/secrets/"
echo "  2. git add + commit + push"
echo "  3. ArgoCD aplicará los SealedSecret CRDs"
echo "  4. Sealed Secrets controller los desencripta y crea los Secret normales en micrositio ns"
echo ""
echo "Los archivos .example.yaml se quedan como referencia documental."
