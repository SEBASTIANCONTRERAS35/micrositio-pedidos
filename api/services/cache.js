/**
 * Cache in-memory simple con TTL
 * Inspirado en el patron de PaginaWeb (cache 30 min para slug -> negocio)
 */

class TTLCache {
  constructor(defaultTTLMs = 30 * 60 * 1000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTLMs;
  }

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

  set(key, value, ttlMs = null) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Singleton para tienda (slug -> data)
const tiendaCache = new TTLCache(30 * 60 * 1000);

module.exports = { TTLCache, tiendaCache };
