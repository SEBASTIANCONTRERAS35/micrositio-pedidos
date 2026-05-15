/**
 * Modelo Pedido — CORE DEL PROYECTO
 *
 * Estados:
 *   pendiente   -> recien creado, esperando confirmacion del dueno
 *   confirmado  -> dueno confirmo, worker debe solicitar repartidor
 *   en_camino   -> repartidor recogio el pedido
 *   entregado   -> entrega confirmada
 *   cancelado   -> dueno cancelo o stock devuelto
 *
 * Snapshots:
 *   productos[] guarda nombre y precioUnitario en el momento del pedido
 *   (los precios pueden cambiar despues, el pedido conserva el original)
 */
const mongoose = require('mongoose');

const productoSnapshotSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false }
);

const clienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, maxlength: 100 },
    telefono: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    direccion: { type: String, required: true, maxlength: 300 },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    proveedor: { type: String, enum: ['ivoy', 'lalamove', 'uberDirect', 'propio'] },
    deliveryId: String, // id externo del proveedor
    trackingUrl: String,
    estado: {
      type: String,
      enum: ['pending', 'pickup', 'dropoff', 'delivered', 'cancelled', 'failed'],
    },
    repartidor: {
      nombre: String,
      telefono: String,
      foto: String,
    },
    costoEnvio: { type: Number, default: 0 },
    actualizadoEn: Date,
  },
  { _id: false }
);

const pedidoSchema = new mongoose.Schema(
  {
    pedidoId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Referencia estable que ve ZUYU (= Idempotency-Key del cliente cuando
    // existe). En reintentos se reusa, asi ZUYU deduplica y no crea Ventas
    // duplicadas. Sparse: los pedidos en modo mock no la tienen.
    referenciaExterna: {
      type: String,
      index: { sparse: true },
    },
    negocioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Negocio',
      required: true,
      index: true,
    },
    cliente: { type: clienteSchema, required: true },
    productos: { type: [productoSnapshotSchema], required: true, validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    costoEnvio: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    metodoPago: {
      type: String,
      enum: ['efectivo', 'tarjeta_entrega'],
      default: 'efectivo',
    },
    estado: {
      type: String,
      enum: ['pendiente', 'confirmado', 'en_camino', 'entregado', 'cancelado'],
      default: 'pendiente',
      index: true,
    },
    delivery: deliverySchema,
    notas: String,
    historial: [
      {
        estado: String,
        timestamp: { type: Date, default: Date.now },
        nota: String,
      },
    ],
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

// Auto-cleanup de pedidos cancelados despues de 90 dias (compliance + storage)
pedidoSchema.index(
  { actualizadoEn: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { estado: 'cancelado' },
  }
);

pedidoSchema.index({ negocioId: 1, estado: 1, creadoEn: -1 });

module.exports = mongoose.model('Pedido', pedidoSchema);
