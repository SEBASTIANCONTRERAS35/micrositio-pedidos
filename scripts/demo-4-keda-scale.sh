#!/bin/bash
# Demo 4: KEDA escala worker arriba y abajo (3 min)
set -e
NS=micrositio

echo "════════════════════════════════════════════════════"
echo "DEMO 4: KEDA scale-up y scale-down (3 min)"
echo "════════════════════════════════════════════════════"
echo ""

echo "1. Estado inicial: 1 worker"
kubectl get pods -n $NS -l app=worker

echo ""
echo "2. Estado del ScaledObject de KEDA:"
kubectl get scaledobject -n $NS

echo ""
echo "3. Encolar 50 jobs en la cola 'notificaciones' para forzar escalado..."
echo ""

kubectl exec -n $NS deploy/api -- node -e "
  const { Queue } = require('bullmq');
  const q = new Queue('notificaciones', {
    connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT), password: process.env.REDIS_PASSWORD }
  });
  (async () => {
    for (let i = 0; i < 50; i++) {
      await q.add('demo-load', { i, pedidoId: 'PED-DEMO-' + i });
    }
    console.log('50 jobs encolados');
    process.exit(0);
  })();
"

echo ""
echo "4. KEDA detecta cola > 5, debe escalar el worker (min 1 → max 5)..."
echo "   Esperando ~30 segundos..."
echo ""

# Watch en vivo
kubectl get pods -n $NS -l app=worker -w &
WATCH_PID=$!
sleep 60
kill $WATCH_PID 2>/dev/null || true

echo ""
echo "5. Estado despues de los 50 jobs:"
kubectl get pods -n $NS -l app=worker
kubectl get hpa -n $NS

echo ""
echo "6. Esperando que la cola se vacie (cooldown 60s)..."
sleep 90

echo ""
echo "7. Estado final (debe haber bajado a 1 replica):"
kubectl get pods -n $NS -l app=worker

echo ""
echo "════════════════════════════════════════════════════"
echo "DEMO 4 COMPLETADA — KEDA escalo arriba y abajo"
echo "════════════════════════════════════════════════════"
