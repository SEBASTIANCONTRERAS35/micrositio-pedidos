#!/bin/bash
# Demo 2: MongoDB Replica Set + matar nodo (2 min)
set -e
NS=micrositio

echo "════════════════════════════════════════════════════"
echo "DEMO 2: MongoDB Replica Set failover (2 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Estado actual del Replica Set:"
kubectl exec -n $NS mongodb-0 -- mongosh --quiet --eval "
  rs.status().members.forEach(m => print(m.name + ': ' + m.stateStr));
"

PRIMARY=$(kubectl exec -n $NS mongodb-0 -- mongosh --quiet --eval "
  rs.status().members.filter(m => m.stateStr === 'PRIMARY')[0].name.split('.')[0]
" | tr -d '\r\n ')
echo ""
echo "PRIMARY actual: $PRIMARY"
echo ""

read -p "[Pulsa ENTER para matar el PRIMARY]"

kubectl delete pod -n $NS $PRIMARY --grace-period=0 --force

echo ""
echo "2. Esperando que el cluster elija nuevo PRIMARY..."
sleep 8

echo ""
echo "3. Estado despues de matar el PRIMARY:"
kubectl exec -n $NS mongodb-1 -- mongosh --quiet --eval "
  rs.status().members.forEach(m => print(m.name + ': ' + m.stateStr));
"

echo ""
echo "4. La app sigue funcionando? Hacer un pedido en https://zuyu.local/tienda/demo"
echo "   El pedido debe completarse sin errores aunque mongodb-0 acaba de morir"
echo ""

echo "════════════════════════════════════════════════════"
echo "DEMO 2 COMPLETADA"
echo "════════════════════════════════════════════════════"
