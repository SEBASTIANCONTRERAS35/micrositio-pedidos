/**
 * Modelo Producto del catalogo del negocio
 */
const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema(
  {
    negocioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Negocio',
      required: true,
      index: true,
    },
    // ID_PRODUCTO de ZUYU — correlaciona este producto local con el de ZUYU.
    // Solo presente cuando ZUYU_MOCK=false (integracion activa). En modo
    // standalone el producto vive solo en el micrositio y este campo es null.
    zuyuProductoId: { type: String, default: null, index: true },
    nombre: { type: String, required: true, trim: true, maxlength: 200 },
    descripcion: { type: String, trim: true, maxlength: 1000 },
    precio: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    categoria: { type: String, default: 'General', trim: true },
    imagen: { type: String },
    activo: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' } }
);

productoSchema.index({ negocioId: 1, categoria: 1 });
productoSchema.index({ negocioId: 1, nombre: 'text' });
// Lookup rapido por id de ZUYU durante la sincronizacion
productoSchema.index({ negocioId: 1, zuyuProductoId: 1 }, { sparse: true });

module.exports = mongoose.model('Producto', productoSchema);
