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
    // Integracion con ZUYU (Fase 4.5). El dueno la configura desde el panel.
    // apiKey/webhookSecret van con select:false — NUNCA salen en queries
    // normales ni en JSON.stringify. Solo se leen explicitamente en zuyu.js.
    zuyuConfig: {
      // conectado=false => modo MOCK (catalogo desde el Mongo local).
      conectado: { type: Boolean, default: false },
      baseUrl: { type: String, trim: true, default: '' },
      apiKey: { type: String, select: false },
      // Prefijo visible (zk_dev_abc...) para mostrar en la UI sin exponer el key.
      apiKeyPrefix: { type: String },
      webhookSecret: { type: String, select: false },
      // Durante rotacion, el secret anterior sigue valido (dual-secret).
      webhookSecretPrevio: { type: String, select: false },
      actualizadoEn: { type: Date },
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

// Defensa en profundidad: aunque se haga .select('+zuyuConfig.apiKey'),
// nunca dejar que el material secreto salga en una serializacion JSON.
negocioSchema.set('toJSON', {
  transform: (doc, ret) => {
    if (ret.zuyuConfig) {
      delete ret.zuyuConfig.apiKey;
      delete ret.zuyuConfig.webhookSecret;
      delete ret.zuyuConfig.webhookSecretPrevio;
    }
    return ret;
  },
});

// Index ya creado por unique: true en el campo slug, no duplicar

module.exports = mongoose.model('Negocio', negocioSchema);
