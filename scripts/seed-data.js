/**
 * Seed inicial: 1 negocio, 1 usuario, 5 productos
 * Uso: node scripts/seed-data.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const path = require('path');
require('module').globalPaths.push(path.resolve(__dirname, '../api/node_modules'));

const Negocio = require('../api/models/negocio');
const Producto = require('../api/models/producto');
const Usuario = require('../api/models/usuario');
const { hashPassword } = require('../api/services/auth/argon2');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado a MongoDB');

  // Limpiar
  await Promise.all([
    Negocio.deleteMany({ slug: 'demo' }),
    Usuario.deleteMany({ email: 'demo@zuyu.local' }),
  ]);

  // Negocio demo
  const negocio = await Negocio.create({
    slug: 'demo',
    nombre: 'Farmacia Demo',
    tipo: 'PHARMACY',
    telefono: '+525555555555',
    direccion: {
      calle: 'Av. Reforma 123',
      colonia: 'Centro',
      ciudad: 'Ciudad de Mexico',
      estado: 'CDMX',
      cp: '06000',
    },
    horarios: { apertura: '08:00', cierre: '22:00' },
    deliveryProvider: 'ivoy',
  });
  console.log(`Negocio creado: ${negocio._id} (slug: demo)`);

  // Usuario dueno
  const usuario = await Usuario.create({
    email: 'demo@zuyu.local',
    passwordHash: await hashPassword('Demo1234!'),
    negocioId: negocio._id,
    nombre: 'Dueno Demo',
    rol: 'owner',
  });
  console.log(`Usuario creado: ${usuario.email} / pass: Demo1234!`);

  // Limpiar productos viejos
  await Producto.deleteMany({ negocioId: negocio._id });

  // Productos
  const productos = await Producto.insertMany([
    { negocioId: negocio._id, nombre: 'Paracetamol 500mg (10 tabletas)', precio: 35, stock: 50, categoria: 'Analgesicos' },
    { negocioId: negocio._id, nombre: 'Ibuprofeno 400mg (20 tabletas)', precio: 65, stock: 30, categoria: 'Analgesicos' },
    { negocioId: negocio._id, nombre: 'Cubrebocas KN95 (10 piezas)', precio: 89, stock: 100, categoria: 'Cuidado personal' },
    { negocioId: negocio._id, nombre: 'Alcohol gel 250ml', precio: 45, stock: 80, categoria: 'Cuidado personal' },
    { negocioId: negocio._id, nombre: 'Termometro digital', precio: 199, stock: 5, categoria: 'Equipo medico' },
  ]);
  console.log(`${productos.length} productos creados`);

  console.log('\n✅ Seed completado.');
  console.log('   Tienda publica: http://localhost:3000/tienda/demo');
  console.log('   Panel: http://localhost:3000/panel/login');
  console.log('   Login: demo@zuyu.local / Demo1234!\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
