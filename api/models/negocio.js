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
    ubicacion: {
      lat: Number,
      lng: Number,
    },
    horarios: {
      apertura: String,
      cierre: String,
    },
    deliveryProvider: {
      type: String,
      enum: ['auto', 'ivoy', 'lalamove', 'uberDirect'],
      default: 'ivoy',
    },
    zuyuConfig: {
      conectado: { type: Boolean, default: false },
      baseUrl: { type: String, trim: true, default: '' },
      apiKey: { type: String, select: false },
      apiKeyPrefix: { type: String },
      webhookSecret: { type: String, select: false },
      webhookSecretPrevio: { type: String, select: false },
      actualizadoEn: { type: Date },
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

negocioSchema.set('toJSON', {
  // Elimina material secreto de zuyuConfig al serializar a JSON.
  transform: (doc, ret) => {
    if (ret.zuyuConfig) {
      delete ret.zuyuConfig.apiKey;
      delete ret.zuyuConfig.webhookSecret;
      delete ret.zuyuConfig.webhookSecretPrevio;
    }
    return ret;
  },
});

module.exports = mongoose.model('Negocio', negocioSchema);
