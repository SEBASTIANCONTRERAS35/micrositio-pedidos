#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# modo-zuyu.sh — cambia el catálogo del micrositio (negocio "demo") entre:
#   real → datos REALES de ZUYU DEV (catálogo de Sharewow Mexico, vía publicApi)
#   demo → datos LOCALES del cluster (mock, 3 productos sembrados)  ← seguro/offline
#
# Uso:
#   ./demos/modo-zuyu.sh real
#   ./demos/modo-zuyu.sh demo
#
# El apiKey y la baseUrl se leen de demos/.zuyu-dev-credentials (NO versionado).
# Tras cambiar, reinicia el api para limpiar el caché en memoria y verifica.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODE="${1:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
CRED="$DIR/.zuyu-dev-credentials"
MASTER="sebastian@10.211.55.30"
SSHK="$HOME/.ssh/id_ed25519"
NODE_IP="${NODE_IP:-10.211.55.39}"
SSH="ssh -o BatchMode=yes -i $SSHK $MASTER"

usage() { echo "Uso: $0 real|demo"; exit 1; }
[ "$MODE" = "real" ] || [ "$MODE" = "demo" ] || usage

# ── 1. Aplicar el cambio de zuyuConfig en el Mongo del cluster ──────────────
if [ "$MODE" = "real" ]; then
  [ -f "$CRED" ] || { echo "❌ Falta $CRED (ZUYU_BASE_URL + ZUYU_API_KEY)"; exit 1; }
  # shellcheck disable=SC1090
  source "$CRED"
  echo "→ Conectando el micrositio a ZUYU DEV: $ZUYU_BASE_URL"
  $SSH "bash -s '$ZUYU_BASE_URL' '$ZUYU_API_KEY'" <<'EOF'
PW=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh micrositio --quiet -u root -p "$PW" --authenticationDatabase admin --eval \
  "db.negocios.updateOne({slug:'demo'},{\$set:{'zuyuConfig.conectado':true,'zuyuConfig.baseUrl':'$1','zuyuConfig.apiKey':'$2'}}); print('zuyuConfig: conectado=true')"
EOF
else
  echo "→ Volviendo a datos LOCALES (mock)"
  $SSH 'bash -s' <<'EOF'
PW=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh micrositio --quiet -u root -p "$PW" --authenticationDatabase admin --eval \
  "db.negocios.updateOne({slug:'demo'},{\$set:{'zuyuConfig.conectado':false}}); print('zuyuConfig: conectado=false')"
EOF
fi

# ── 2. Reiniciar el api para limpiar el caché en memoria ────────────────────
echo "→ Reiniciando api (limpia caché)..."
$SSH 'kubectl argo rollouts restart api -n micrositio >/dev/null && kubectl argo rollouts status api -n micrositio --timeout 120s | tail -1'

# ── 3. (modo real) despertar ZUYU DEV por si Render está dormido ────────────
if [ "$MODE" = "real" ]; then
  echo "→ Despertando ZUYU DEV (Render cold start)..."
  curl -s -m 70 -o /dev/null "${ZUYU_BASE_URL}/api/public/v1/health" || true
fi

# ── 4. Verificar qué está mostrando el micrositio ───────────────────────────
echo "→ Verificando /tienda/demo ..."
HTML=$(curl -sk -m 75 --resolve "zuyu.local:443:$NODE_IP" https://zuyu.local/tienda/demo 2>/dev/null || true)
N=$(printf '%s' "$HTML" | grep -oc 'ct-card__name' || true)
TITLE=$(printf '%s' "$HTML" | grep -oE '<title>[^<]*' | head -1 | sed 's/<title>//')
echo "──────────────────────────────────────────"
echo "  MODO: $MODE"
echo "  Negocio: ${TITLE:-?}"
echo "  Productos mostrados: ${N:-0}"
echo "──────────────────────────────────────────"
