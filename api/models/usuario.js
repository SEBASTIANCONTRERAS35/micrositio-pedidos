/**
 * Modelo Usuario (dueno del negocio)
 * Login al panel
 */
const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true },
    negocioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Negocio',
      required: true,
    },
    nombre: { type: String, required: true, trim: true },
    rol: { type: String, enum: ['owner', 'staff'], default: 'owner' },
    activo: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

// Nunca incluir passwordHash en JSON.stringify
usuarioSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('Usuario', usuarioSchema);
