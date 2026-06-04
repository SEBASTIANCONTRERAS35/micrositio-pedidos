#!/usr/bin/env bash
# ============================================================================
# DEMO KEDA — autoescalado del worker por longitud de cola de Redis.
#
# Mete trabajo a la cola y muestra al worker MULTIPLICARSE en vivo (1 -> 5),
# todo en UNA sola terminal. Pensado para la presentación.
#
# Ejecutar EN EL MASTER:   bash demo-keda.sh
# ============================================================================
G='\033[0;32m'; Y='\033[1;33m'; B='\033[1;34m'; N='\033[0m'
ok()    { echo -e "  ${G}✅ $*${N}"; }
info()  { echo -e "  ${B}ℹ️  $*${N}"; }
title() { echo; echo -e "${B}════ $* ════${N}"; }
ask()   { local r; read -rp "  ❓ $* [s/N]: " r; [[ "$r" =~ ^[sSyY] ]]; }

NS=micrositio
QUEUE=bull:notificaciones:wait

command -v kubectl >/dev/null 2>&1 || { echo "no encuentro kubectl (corre esto en el master)"; exit 1; }
RPW=$(kubectl get secret redis-auth -n "$NS" -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d 2>/dev/null)
[ -z "$RPW" ] && { echo "no pude leer la contraseña de Redis"; exit 1; }

rexec()    { kubectl exec deploy/redis -n "$NS" -- sh -c "export REDISCLI_AUTH='$RPW'; $*" 2>/dev/null; }
llen()     { rexec "redis-cli LLEN $QUEUE" | tr -d '\r'; }
nworkers() { kubectl get pods -n "$NS" -l app=worker --no-headers 2>/dev/null | wc -l | tr -d ' '; }
active()   { kubectl get scaledobject worker-scaler -n "$NS" -o jsonpath='{.status.conditions[?(@.type=="Active")].status}' 2>/dev/null; }
foto()     { echo -e "    obreros: ${G}$(nworkers)${N}   |   cola: ${Y}$(llen)${N}   |   KEDA activo: $(active)"; }

clear 2>/dev/null
echo -e "${B}╔══════════════════════════════════════════╗"
echo        "║   DEMO KEDA — autoescalado del worker     ║"
echo -e    "╚══════════════════════════════════════════╝${N}"

title "Estado inicial (en reposo)"
foto

N_JOBS=300
read -rp "  👉 ¿Cuántos trabajos meto a la cola? [300]: " x
[ -n "$x" ] && N_JOBS="$x"

title "Metiendo $N_JOBS trabajos a la cola de notificaciones..."
rexec "i=1; while [ \$i -le $N_JOBS ]; do echo LPUSH $QUEUE demo-\$i; i=\$((i+1)); done | redis-cli >/dev/null"
ok "listo. Cola ahora: $(llen) trabajos pendientes"

title "📈 KEDA escalando el worker (revisa cada 10s — paciencia ~15-30s)"
for _ in $(seq 1 20); do
  foto
  [ "$(nworkers)" -ge 5 ] && { ok "¡llegó al MÁXIMO de 5 obreros! 🎉"; break; }
  sleep 5
done

title "Vaciar la cola"
if ask "¿Vaciar la cola ahora?"; then
  rexec "redis-cli DEL $QUEUE" >/dev/null
  ok "cola vaciada (cola: $(llen))"
  info "El worker bajará solo a 1, pero el HPA espera unos minutos antes de bajar"
  info "(es a propósito, para no andar subiendo/bajando como loco). No hace falta verlo en vivo."
  if ask "¿Esperar y ver la BAJADA? (puede tardar ~3-5 min)"; then
    for _ in $(seq 1 40); do
      foto
      [ "$(nworkers)" -le 1 ] && { ok "volvió a 1 obrero 🎯"; break; }
      sleep 10
    done
  fi
fi

title "FIN"
foto
ok "Demo terminado."
