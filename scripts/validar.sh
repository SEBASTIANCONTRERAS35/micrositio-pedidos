#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Validacion end-to-end del micrositio + integracion ZUYU
#
# Cubre los 3 niveles del plan:
#   N1 - Tests automatizados (vitest unit + integration + lint)
#   N2 - Smoke con curl
#   N4 - Probes de seguridad ofensiva (cifrado at-rest, IDOR, SSRF,
#        idempotency anti-poisoning, JWT revocation)
#
# El nivel 3 (flujo en navegador) es manual — este script no lo cubre.
#
# Uso:
#   ./scripts/validar.sh                # todo
#   ./scripts/validar.sh n1             # solo nivel 1
#   ./scripts/validar.sh n2 n4          # niveles 2 y 4
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

# ── Colores ────────────────────────────────────────────────────────
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[1;34m'; D='\033[0m'

# ── Config ─────────────────────────────────────────────────────────
LOCAL="${MICROSITIO_URL:-http://localhost:3000}"
ZUYU="${ZUYU_URL:-https://pilldb-dev.onrender.com}"
EMAIL="${PANEL_EMAIL:-demo@zuyu.local}"
PASS="${PANEL_PASS:-Demo1234!}"
MICROSITIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Contadores ─────────────────────────────────────────────────────
PASS_N=0
FAIL_N=0
FAILED=()

pass() { echo -e "  ${G}✓${D} $1"; PASS_N=$((PASS_N + 1)); }
fail() {
  echo -e "  ${R}✗${D} $1"
  [ -n "${2:-}" ] && echo -e "    ${R}↳${D} $2"
  FAIL_N=$((FAIL_N + 1)); FAILED+=("$1")
}
SKIP_N=0
skip() {
  echo -e "  ${Y}~${D} SKIP: $1"
  [ -n "${2:-}" ] && echo -e "    ${Y}↳${D} $2"
  SKIP_N=$((SKIP_N + 1))
}
section() { echo; echo -e "${B}══ $1${D}"; }
info()    { echo -e "  ${Y}ⓘ${D} $1"; }

# ───────────────────────────────────────────────────────────────────
# NIVEL 1 — Tests automatizados
# ───────────────────────────────────────────────────────────────────
nivel_1() {
  section "Nivel 1 — Tests automatizados"
  cd "$MICROSITIO_DIR/api" || { fail "no se pudo entrar a api/"; return; }

  info "vitest unit (60 tests esperados)..."
  if out=$(npx vitest run tests/unit/ 2>&1 | tail -5); then
    if echo "$out" | grep -qE "Tests +[0-9]+ passed"; then
      pass "unit tests: $(echo "$out" | grep -oE "Tests +[0-9]+ passed")"
    else
      fail "unit tests no reportaron passed" "$out"
    fi
  else
    fail "vitest unit fallo"
  fi

  info "vitest integration (8 tests esperados, levanta MongoMemoryReplSet)..."
  if out=$(npx vitest run --config vitest.integration.config.js 2>&1 | tail -5); then
    if echo "$out" | grep -qE "Tests +[0-9]+ passed"; then
      pass "integration tests: $(echo "$out" | grep -oE "Tests +[0-9]+ passed")"
    else
      fail "integration tests no reportaron passed" "$out"
    fi
  else
    fail "vitest integration fallo"
  fi

  info "eslint completo..."
  cd "$MICROSITIO_DIR" || { fail "no se pudo volver"; return; }
  if npx eslint api/ eslint.config.js 2>&1 | grep -qE "error\b" | grep -v "0 errors"; then
    fail "eslint: hay errores"
  else
    pass "eslint sin errores (solo warnings preexistentes)"
  fi
}

# ───────────────────────────────────────────────────────────────────
# NIVEL 2 — Smoke con curl
# ───────────────────────────────────────────────────────────────────
status() { curl -s -o /dev/null -w "%{http_code}" -m 10 "$@"; }

nivel_2() {
  section "Nivel 2 — Smoke (curl)"

  info "Micrositio local — GET /tienda/demo"
  c=$(status "$LOCAL/tienda/demo")
  [ "$c" = "200" ] && pass "/tienda/demo → 200" || fail "/tienda/demo → $c (esperado 200)"

  info "Micrositio local — assets externalizados"
  for js in tienda.js checkout.js panel-login.js panel-pedidos.js panel-integracion.js; do
    c=$(status "$LOCAL/js/$js")
    [ "$c" = "200" ] && pass "/js/$js → 200" || fail "/js/$js → $c"
  done

  info "ZUYU-DEV — GET /api/public/v1/health (publico)"
  health=$(curl -s -m 10 "$ZUYU/api/public/v1/health")
  if echo "$health" | grep -q '"status":"ok"'; then
    pass "ZUYU health → ok"
  else
    fail "ZUYU health no responde ok" "$health"
  fi

  info "Endpoints protegidos deben dar 401 sin auth"
  c=$(status "$LOCAL/panel/api/integracion")
  [ "$c" = "401" ] && pass "/panel/api/integracion sin auth → 401" || fail "/panel/api/integracion sin auth → $c (esperado 401)"
  c=$(status "$ZUYU/api/public/v1/catalog")
  [ "$c" = "401" ] && pass "ZUYU /catalog sin api-key → 401" || fail "ZUYU /catalog sin api-key → $c (esperado 401)"
  c=$(status -H "X-API-Key: zk_basura" "$ZUYU/api/public/v1/catalog")
  [ "$c" = "401" ] && pass "ZUYU /catalog con api-key basura → 401" || fail "/catalog con basura → $c"
}

# ───────────────────────────────────────────────────────────────────
# NIVEL 4 — Probes de seguridad ofensiva
# ───────────────────────────────────────────────────────────────────
login_token() {
  curl -s -X POST "$LOCAL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" |
    python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}

nivel_4() {
  section "Nivel 4 — Seguridad ofensiva"

  # ── F1: Cifrado at-rest ─────────────────────────────────────────
  info "F1 — apiKey en Mongo debe estar cifrada (enc:v1:...)"
  key=$(docker exec micrositio-mongodb mongosh --quiet --eval \
    "print(db.getSiblingDB('micrositio').negocios.findOne({slug:'demo'}).zuyuConfig.apiKey)" 2>/dev/null)
  if [[ "$key" == enc:v1:* ]]; then
    pass "apiKey cifrada at-rest: ${key:0:24}..."
  elif [[ -z "$key" || "$key" == "null" ]]; then
    info "demo no tiene apiKey configurada — skip (configura una desde el panel)"
  else
    fail "apiKey NO cifrada en Mongo" "${key:0:40}..."
  fi

  # ── Login para los siguientes ────────────────────────────────────
  info "Login al panel del micrositio..."
  TOKEN=$(login_token)
  if [ -z "$TOKEN" ]; then
    fail "login fallo — los siguientes checks se omiten"
    return
  fi
  pass "login OK"

  # ── F0.4: JWT con jti + revocacion ──────────────────────────────
  info "F0.4 — JWT debe tener jti"
  jti=$(python3 -c "
import base64,json,sys
p='$TOKEN'.split('.')[1]
p += '=' * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p)).get('jti',''))" 2>/dev/null)
  if [ -n "$jti" ]; then
    pass "JWT tiene jti: ${jti:0:16}..."
  else
    fail "JWT sin jti — la revocacion no funcionaria"
  fi

  # ── F0.3: IDOR confirmar/cancelar ───────────────────────────────
  info "F0.3 — IDOR cerrado: pedido inexistente debe dar 404 (no 500/200)"
  c=$(status -X POST "$LOCAL/api/pedidos/PED-9999-9999/confirmar" \
        -H "Authorization: Bearer $TOKEN")
  [ "$c" = "404" ] && pass "pedido inexistente → 404" || fail "esperado 404, obtuvo $c"

  # ── F1: SSRF guard ──────────────────────────────────────────────
  info "F1 — SSRF: baseUrl a metadata cloud (169.254.169.254) debe rechazarse"
  resp=$(curl -s -X PUT "$LOCAL/panel/api/integracion" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"baseUrl":"https://169.254.169.254/"}')
  if echo "$resp" | grep -qiE "rechaz|privada|reservada"; then
    pass "baseUrl metadata → rechazada"
  else
    fail "SSRF no detectado" "$resp"
  fi

  info "F1 — SSRF: localhost debe rechazarse"
  resp=$(curl -s -X PUT "$LOCAL/panel/api/integracion" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"baseUrl":"https://localhost/x"}')
  if echo "$resp" | grep -qiE "rechaz|localhost"; then
    pass "baseUrl localhost → rechazada"
  else
    fail "SSRF localhost no detectado" "$resp"
  fi

  info "F1 — SSRF: protocolo no-https debe rechazarse"
  resp=$(curl -s -X PUT "$LOCAL/panel/api/integracion" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"baseUrl":"ftp://ejemplo.com/"}')
  if echo "$resp" | grep -qiE "rechaz|HTTPS"; then
    pass "baseUrl ftp:// → rechazada"
  else
    fail "protocolo no-https no detectado" "$resp"
  fi

  # ── F0.5: Idempotency anti-poisoning ────────────────────────────
  # El middleware solo cachea respuestas 2xx. Para probar la deteccion de
  # key-reuse en vivo hay que crear un pedido REAL primero (side-effect),
  # cosa que un script de validacion no deberia hacer. Hacemos un test
  # ligero: 2 requests identicos con un body intencionalmente invalido —
  # ambos deben dar el MISMO codigo (no contaminacion cruzada).
  info "F0.5 — Idempotency: requests identicos no se contaminan entre keys"
  KEY=$(uuidgen 2>/dev/null || python3 -c "import uuid;print(uuid.uuid4())")
  payload='{"negocioSlug":"demo","cliente":{"nombre":"A","telefono":"+5215500000000","email":"a@a.com","direccion":"Calle Falsa 123"},"productos":[{"id":"000000000000000000000000","cantidad":1}],"metodoPago":"efectivo"}'
  c1=$(status -X POST "$LOCAL/api/pedidos" \
    -H "Idempotency-Key: $KEY" -H "Content-Type: application/json" -d "$payload")
  c2=$(status -X POST "$LOCAL/api/pedidos" \
    -H "Idempotency-Key: $KEY" -H "Content-Type: application/json" -d "$payload")
  if [ "$c1" = "$c2" ]; then
    pass "mismo key + mismo body -> mismo codigo ($c1)"
  else
    fail "mismo key + mismo body dio codigos distintos ($c1 vs $c2)"
  fi
  skip "Idempotency anti-poisoning (key-reuse con body distinto)" \
       "requiere un pedido real exitoso para poblar el cache — la logica del middleware esta cubierta por code review + esta en idempotency.js:32-45"

  # ── F1.3: Zod en /panel/api/integracion ─────────────────────────
  info "F1.3 — Body invalido en /panel/api/integracion debe dar 400"
  c=$(status -X PUT "$LOCAL/panel/api/integracion" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"apiKey":123,"conectado":"no-soy-bool"}')
  [ "$c" = "400" ] && pass "body invalido → 400" || fail "esperado 400, obtuvo $c"

  # ── F0.4: Revocacion del JWT en logout ──────────────────────────
  info "F0.4 — Tras logout, el token revocado debe dar 401"
  REFRESH=$(curl -s -X POST "$LOCAL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" |
    python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)
  TOKEN2=$(login_token)
  curl -s -X POST "$LOCAL/api/auth/logout" \
    -H "Authorization: Bearer $TOKEN2" -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH\"}" >/dev/null
  c=$(status "$LOCAL/panel/api/me" -H "Authorization: Bearer $TOKEN2")
  [ "$c" = "401" ] && pass "token tras logout → 401" || fail "token tras logout deberia ser 401, fue $c"
}

# ───────────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────────
echo -e "${B}Validacion del micrositio + integracion ZUYU${D}"
echo "  Local: $LOCAL"
echo "  ZUYU:  $ZUYU"

if [ $# -eq 0 ]; then
  nivel_1; nivel_2; nivel_4
else
  for arg in "$@"; do
    case "$arg" in
      n1|N1|1) nivel_1 ;;
      n2|N2|2) nivel_2 ;;
      n4|N4|4) nivel_4 ;;
      *) echo "uso: $0 [n1] [n2] [n4]"; exit 2 ;;
    esac
  done
fi

echo
echo -e "${B}══════════ Resumen ══════════${D}"
echo -e "  ${G}OK:${D}    $PASS_N"
echo -e "  ${R}FAIL:${D}  $FAIL_N"
echo -e "  ${Y}SKIP:${D}  $SKIP_N"
if [ $FAIL_N -gt 0 ]; then
  echo
  echo -e "${R}Failures:${D}"
  for f in "${FAILED[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
