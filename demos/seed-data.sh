#!/usr/bin/env bash
# Seed inicial: 1 negocio + 3 productos + 1 usuario dueño
# Idempotente — borra existentes antes de crear
set -uo pipefail

echo "═══ SEED DATA — datos demo para defensa ═══"

ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)

# Hash Argon2 de "Demo1234!" pre-calculado (argon2id real). El salt va
# embebido en el hash → es determinista y portable. NO se genera en vivo
# porque la imagen del api no expone 'node' en el PATH del contenedor.

echo ""
echo "[1] Crear/limpiar negocio demo + productos:"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval '
const negSlug = "demo";
// Limpiar productos de negocios demo anteriores (cada re-seed crea un
// negocio con _id nuevo → sin esto los productos viejos quedan huérfanos).
db.negocios.find({slug: negSlug}).toArray().forEach(n => db.productos.deleteMany({negocioId: n._id}));
db.negocios.deleteMany({slug: negSlug});
const negocio = db.negocios.insertOne({
  slug: negSlug,
  nombre: "Farmacia Demo",
  tipo: "PHARMACY",
  telefono: "+525555555555",
  direccion: {calle: "Av. Reforma 123", colonia: "Centro", ciudad: "CDMX", estado: "CDMX", cp: "06000"},
  horarios: {apertura: "08:00", cierre: "22:00"},
  deliveryProvider: "ivoy",
  activo: true,
  creadoEn: new Date(),
  actualizadoEn: new Date()
});
print("✓ Negocio: " + negocio.insertedId);
db.productos.deleteMany({negocioId: negocio.insertedId});
db.productos.insertMany([
  {nombre: "Paracetamol 500mg", precio: 50, stock: 100, activo: true, negocioId: negocio.insertedId, creadoEn: new Date(), actualizadoEn: new Date()},
  {nombre: "Ibuprofeno 400mg", precio: 75, stock: 50, activo: true, negocioId: negocio.insertedId, creadoEn: new Date(), actualizadoEn: new Date()},
  {nombre: "Vitamina C 1g", precio: 120, stock: 30, activo: true, negocioId: negocio.insertedId, creadoEn: new Date(), actualizadoEn: new Date()}
]);
print("✓ Productos: " + db.productos.countDocuments({negocioId: negocio.insertedId}));
' 2>&1 | tail -8

echo ""
echo "[2] Hash Argon2 de 'Demo1234!' (pre-calculado, argon2id real):"
# Regenerar con: cd api && node -e 'require("argon2").hash("Demo1234!").then(console.log)'
HASH='$argon2id$v=19$m=65536,t=3,p=4$QAK3nCNpvpPKBOAk1SiBsA$r0MkZsa4XMFhrT4K0s/ZtoN9yxM2mJXmrMmFit63P+4'
echo "    Hash: ${HASH:0:30}..."

echo ""
echo "[3] Crear usuario dueño:"
NEG_ID=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'db.negocios.findOne({slug:"demo"})._id.toString()' 2>/dev/null | tail -1 | tr -dc 'a-f0-9')

kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
db.usuarios.deleteMany({email: 'demo@zuyu.local'});
const u = db.usuarios.insertOne({
  email: 'demo@zuyu.local',
  passwordHash: '$HASH',
  negocioId: ObjectId('$NEG_ID'),
  nombre: 'Sebastian Dueño Demo',
  rol: 'owner',
  activo: true,
  creadoEn: new Date(),
  actualizadoEn: new Date()
});
print('✓ Usuario: demo@zuyu.local / Demo1234!');
" 2>&1 | tail -3

echo ""
echo "═══ Seed completo ═══"
echo "  Negocio: demo (Farmacia Demo)"
echo "  Productos: Paracetamol \$50, Ibuprofeno \$75, Vitamina C \$120"
echo "  Login dueño: demo@zuyu.local / Demo1234!"
