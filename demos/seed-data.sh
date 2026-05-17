#!/usr/bin/env bash
# Seed inicial: 1 negocio + 3 productos + 1 usuario dueño
# Idempotente — borra existentes antes de crear
set -uo pipefail

echo "═══ SEED DATA — datos demo para defensa ═══"

ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)

# Argon2 hash de "Demo1234!" (pre-calculado — para no requerir node en el script)
# Generado con: const a = require('argon2'); await a.hash('Demo1234!');
# Para la demo NO es necesario hash real — la app valida con argon2 que rechazaría hash bogus.
# Solución: generar el hash en vivo desde un pod api (que tiene argon2).

echo ""
echo "[1] Crear/limpiar negocio demo + productos:"
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval '
const negSlug = "demo";
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
echo "[2] Generar hash Argon2 para password 'Demo1234!' desde pod api (real):"
HASH=$(kubectl exec -n micrositio deploy/api -- node -e '
const a = require("argon2");
a.hash("Demo1234!").then(h => console.log(h)).catch(e => { console.error(e); process.exit(1); });
' 2>/dev/null)
echo "    Hash: ${HASH:0:60}..."

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
