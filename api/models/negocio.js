/**
 * Modelo Negocio (single-tenant simplificado)
 * Cada negocio tiene su propio slug para el micrositio publico
 */
const mongoose = require('mongoose');

const negocioSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
    },
    nombre: { type: String, required: true, trim: true, maxlength: 200 },
    tipo: {
      type: String,
      enum: ['PHARMACY', 'RETAIL', 'RESTAURANT', 'CAFE', 'GROCERY', 'BAKERY', 'OTHER'],
      default: 'OTHER',
    },
    telefono: { type: String, trim: true },
    direccion: {
      calle: String,
      colonia: String,
      ciudad: String,
      estado: String,
      cp: String,
    },
    horarios: {
      apertura: String,
      cierre: String,
    },
    deliveryProvider: {
      type: String,
      enum: ['ivoy', 'lalamove', 'uberDirect'],
      default: 'ivoy',
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

negocioSchema.index({ slug: 1 });

module.exports = mongoose.model('Negocio', negocioSchema);
