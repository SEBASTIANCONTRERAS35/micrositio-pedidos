#!/usr/bin/env bash
# Auditoría de seguridad — Trivy filesystem + imagenes + npm audit
# Correr antes de la defensa para anticipar preguntas de Daniel sobre vulnerabilidades.
set -uo pipefail

echo "═══ Auditoría de Seguridad ═══"

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /Users/emiliocontreras/Downloads/micrositio-pedidos)"

# ── 1. npm audit api ──
echo ""
echo "[1] npm audit api (level >=high):"
(cd api && npm audit --omit=dev --audit-level=high --json 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  meta = d.get('metadata', {})
  vulns = meta.get('vulnerabilities', {})
  print(f\"  Critical: {vulns.get('critical', 0)} · High: {vulns.get('high', 0)} · Moderate: {vulns.get('moderate', 0)} · Low: {vulns.get('low', 0)}\")
except: print('  (sin output JSON)')") || true

# ── 2. npm audit worker ──
echo ""
echo "[2] npm audit worker (level >=high):"
(cd worker && npm audit --omit=dev --audit-level=high --json 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  meta = d.get('metadata', {})
  vulns = meta.get('vulnerabilities', {})
  print(f\"  Critical: {vulns.get('critical', 0)} · High: {vulns.get('high', 0)} · Moderate: {vulns.get('moderate', 0)} · Low: {vulns.get('low', 0)}\")
except: print('  (sin output JSON)')") || true

# ── 3. Trivy filesystem (deps + Dockerfile) ──
if which trivy >/dev/null 2>&1 ; then
  echo ""
  echo "[3] Trivy fs (CVE en deps + Dockerfile):"
  trivy fs . --severity HIGH,CRITICAL --no-progress 2>&1 | tail -20
else
  echo ""
  echo "[3] Trivy NO instalado localmente. Instálalo con: brew install trivy"
fi

# ── 4. Trivy scan imágenes del registry local (requiere VMs prendidas) ──
if which trivy >/dev/null 2>&1 ; then
  echo ""
  echo "[4] Trivy scan imágenes del registry local:"
  for IMG in micrositio-api micrositio-worker ; do
    echo ""
    echo "  → $IMG:latest"
    trivy image --severity HIGH,CRITICAL --no-progress \
      "10.211.55.30:30500/$IMG:latest" 2>&1 | tail -10 || echo "  (VMs apagadas o registry no accesible)"
  done
fi

# ── 5. Verificar no hay secrets en el repo ──
echo ""
echo "[5] Buscar secrets en plaintext en el repo (gitleaks-style básico):"
PATTERNS='password.*=.*[A-Za-z0-9]{16,}|api[_-]?key.*=.*[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9]{50,}|sk_(test|live)_[A-Za-z0-9]+'
HITS=$(grep -rEIn "$PATTERNS" --include='*.{js,yml,yaml,json,env}' --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | grep -vE '\.example\.|CAMBIAR|XXXX|<.*>' | wc -l | tr -d ' ')
if [ "$HITS" = "0" ]; then
  echo "    ✓ No se encontraron secrets en plaintext"
else
  echo "    ⚠ $HITS posibles secrets en plaintext:"
  grep -rEIn "$PATTERNS" --include='*.{js,yml,yaml,json,env}' --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | grep -vE '\.example\.|CAMBIAR|XXXX|<.*>' | head -5
fi

# ── 6. Verificar no hay refs ZUYU en el repo público ──
echo ""
echo "[6] Buscar referencias 'ZUYU' que pueden ser sensitivas:"
ZUYU_HITS=$(grep -rIn "ZUYU\|zuyu\.mx\|zuyu\.com" --include='*.{js,md,yml,yaml,ejs}' --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | wc -l | tr -d ' ')
echo "    $ZUYU_HITS menciones (es OK si son del contexto académico)"

echo ""
echo "═══ FIN AUDIT ═══"
echo ""
echo "Próximos pasos si encontró HIGH/CRITICAL:"
echo "  - npm audit fix --force (cuidado con breaking changes)"
echo "  - Actualizar base image en Dockerfile a versión más nueva"
echo "  - Documentar excepciones en docs/adr/00X-security-exceptions.md"
