#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ver-pedidos.sh — muestra los pedidos en MongoDB SIN exponer la contraseña.
#
# La contraseña se lee del Secret DENTRO del comando remoto y se pasa a mongosh
# por -p "$PW"; nunca se imprime en pantalla. Seguro para usar frente al público.
#
# Uso:
#   ./demos/ver-pedidos.sh          # total + último pedido
#   ./demos/ver-pedidos.sh 5        # total + últimos 5 pedidos
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
N="${1:-1}"
ssh -o BatchMode=yes -i "$HOME/.ssh/id_ed25519" sebastian@10.211.55.30 "bash -s '$N'" <<'EOF'
N="$1"
PW=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh micrositio --quiet \
  -u root -p "$PW" --authenticationDatabase admin --eval "
print('═══════════════════════════════════════');
print('  Total de pedidos: ' + db.pedidos.countDocuments());
print('═══════════════════════════════════════');
db.pedidos.find().sort({creadoEn:-1}).limit($N).forEach(function(p){
  print('');
  print('  Pedido:    ' + p.pedidoId + '   [' + p.estado + ']');
  print('  Cliente:   ' + p.cliente.nombre + ' · ' + p.cliente.telefono);
  print('  Productos: ' + p.productos.map(function(x){return x.cantidad+'x '+x.nombre;}).join(', '));
  print('  Total:     \$' + p.total);
  print('  Historial: ' + p.historial.map(function(h){return h.estado;}).join(' -> '));
});
"
EOF
