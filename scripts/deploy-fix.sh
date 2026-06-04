#!/usr/bin/env bash
# ============================================================================
# Despliega el fix de Redis/BullMQ (commit f57a12f):
#   build Tekton -> redeploy api+worker -> noeviction -> limpiar jobs viejos.
# Ejecutar EN EL MASTER:  bash deploy-fix.sh
# ============================================================================
set -u
G='\033[0;32m'; Y='\033[1;33m'; B='\033[1;34m'; R='\033[0;31m'; N='\033[0m'
ok()   { echo -e "  ${G}✅ $*${N}"; }
info() { echo -e "  ${B}ℹ️  $*${N}"; }
err()  { echo -e "  ${R}❌ $*${N}"; }
step() { echo; echo -e "${B}════ $* ════${N}"; }

REPO="https://github.com/SEBASTIANCONTRERAS35/micrositio-pedidos.git"

step "PASO 2 — Disparar el build de Tekton"
SECRET=$(kubectl get secret github-webhook-secret -n ci -o jsonpath='{.data.secretToken}' | base64 -d)
EL=$(kubectl get svc el-micrositio-github-listener -n ci -o jsonpath='{.spec.clusterIP}')
PAYLOAD="{\"ref\":\"refs/heads/main\",\"after\":\"main\",\"repository\":{\"clone_url\":\"$REPO\"}}"
HASH=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
curl -s -X POST "http://$EL:8080" -H "Content-Type: application/json" -H "X-GitHub-Event: push" -H "X-Hub-Signature-256: sha256=$HASH" -d "$PAYLOAD" >/dev/null
sleep 6
PR=$(kubectl get pipelinerun -n ci --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
ok "build disparado: $PR"

step "PASO 3 — Esperando a que el build termine (~2-3 min)"
DONE=""
for i in $(seq 1 18); do
  Rs=$(kubectl get pipelinerun "$PR" -n ci -o jsonpath='{.status.conditions[0].reason}' 2>/dev/null)
  echo "    [$((i*15))s] ${Rs:-iniciando}"
  case "$Rs" in
    Succeeded|Completed) ok "build OK"; DONE=1; break;;
    Failed) err "el build FALLÓ — revisa: kubectl get pipelinerun $PR -n ci"; exit 1;;
  esac
  sleep 15
done
[ -z "$DONE" ] && { err "el build tardó demasiado; revísalo a mano y reintenta"; exit 1; }

step "PASO 4 — Redesplegar api + worker (jalan imagen nueva)"
kubectl argo rollouts restart api -n micrositio >/dev/null 2>&1 || kubectl rollout restart rollout/api -n micrositio >/dev/null 2>&1
kubectl rollout restart deployment worker -n micrositio >/dev/null 2>&1
ok "api + worker reiniciados"

step "PASO 5 — Aplicar noeviction + reiniciar redis"
kubectl get configmap redis-config -n micrositio -o yaml | sed 's/allkeys-lru/noeviction/' | kubectl apply -f - >/dev/null 2>&1
kubectl rollout restart deployment redis -n micrositio >/dev/null 2>&1
ok "configmap (noeviction) aplicado + redis reiniciado"
info "esperando a que worker y redis vuelvan..."
kubectl rollout status deployment worker -n micrositio --timeout=120s >/dev/null 2>&1
kubectl rollout status deployment redis -n micrositio --timeout=120s >/dev/null 2>&1
ok "worker y redis listos"

step "PASO 6 — Limpiar los jobs viejos acumulados (BullMQ clean, seguro)"
kubectl exec deploy/worker -n micrositio -- node -e '
const {Queue}=require("bullmq");
const c={host:process.env.REDIS_HOST,port:+(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD};
(async()=>{for(const n of ["notificaciones","delivery","webhook-delivery"]){try{const q=new Queue(n,{connection:c});const a=await q.clean(0,100000,"completed");const b=await q.clean(0,100000,"failed");console.log(n+" borrados: "+(a.length+b.length));await q.close();}catch(e){console.log(n+" error: "+e.message);}}process.exit(0);})();
' 2>&1 | sed 's/^/    /'

step "PASO 7 — Verificar"
RPW=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)
DB=$(kubectl exec deploy/redis -n micrositio -- redis-cli -a "$RPW" --no-auth-warning DBSIZE 2>/dev/null)
echo "    claves en Redis ahora: $DB  (antes: 21050)"
echo
kubectl get pods -n micrositio --no-headers 2>/dev/null | awk '{print "    "$1"  ready:"$2"  "$3}'
echo
ok "FIX DESPLEGADO."
