class TTLCache {
  // Inicializa el cache con un TTL por defecto en milisegundos
  constructor(defaultTTLMs = 30 * 60 * 1000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTLMs;
  }

  // Devuelve el valor de una clave o null si no existe o expiro
  get(key) {
    const entrada = this.cache.get(key);
    if (!entrada) {
      return null;
    }
    if (Date.now() > entrada.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entrada.value;
  }

  // Guarda un valor con su tiempo de expiracion calculado segun el TTL
  set(key, value, ttlMs = null) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  // Elimina una clave del cache
  delete(key) {
    this.cache.delete(key);
  }

  // Vacia por completo el cache
  clear() {
    this.cache.clear();
  }

  // Devuelve la cantidad de entradas almacenadas
  size() {
    return this.cache.size;
  }
}

const tiendaCache = new TTLCache(30 * 60 * 1000);

module.exports = { TTLCache, tiendaCache };
