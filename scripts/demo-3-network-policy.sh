#!/bin/bash
# Demo 3: NetworkPolicy bloqueando pod no autorizado (2 min)
set +e
NS=micrositio

echo "════════════════════════════════════════════════════"
echo "DEMO 3: NetworkPolicy aislamiento (2 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Mostrar las NetworkPolicies activas:"
kubectl get networkpolicy -n $NS

echo ""
echo "2. Verificar que desde el pod 'api' SI se puede conectar a MongoDB:"
echo "   (test esperado: SUCCESS)"
echo ""
kubectl exec -n $NS deploy/api -- node -e "
  const m = require('mongoose');
  m.connect(process.env.MONGODB_URI).then(() => {
    console.log('OK conectado a MongoDB');
    process.exit(0);
  }).catch(e => { console.error('FALLO:', e.message); process.exit(1); });
"

echo ""
echo "3. Lanzar pod ROGUE sin autorizacion en el namespace e intentar conectar a MongoDB"
echo "   (test esperado: TIMEOUT — la NetworkPolicy bloquea)"
echo ""
read -p "[Pulsa ENTER para lanzar el pod rogue]"

# El pod rogue NO tiene label app=api ni app=worker, asi que la NetworkPolicy lo bloquea
timeout 30 kubectl run rogue-test \
  --image=mongo:7 --rm -it --restart=Never -n $NS \
  --labels="rogue=true" -- \
  mongosh --host mongodb-headless.micrositio --eval "db.adminCommand('ping')" --quiet

echo ""
if [ $? -ne 0 ]; then
  echo "✅ EXITO: el pod rogue fue BLOQUEADO por NetworkPolicy (timeout esperado)"
else
  echo "❌ FALLO: el pod rogue se conecto, NetworkPolicy NO esta funcionando"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "DEMO 3 COMPLETADA"
echo "════════════════════════════════════════════════════"
