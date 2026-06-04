const Negocio = require('../../models/negocio');

// Crea una instancia de Negocio con secretos de zuyuConfig poblados.
function negocioConSecretos() {
  return new Negocio({
    slug: 'demo',
    nombre: 'Farmacia Demo',
    zuyuConfig: {
      conectado: true,
      baseUrl: 'https://pilldb-dev.onrender.com',
      apiKey: 'zk_dev_SUPERSECRETO_EN_CLARO',
      apiKeyPrefix: 'zk_dev_abc12',
      webhookSecret: 'whsec_SECRETO_EN_CLARO',
      webhookSecretPrevio: 'whsec_VIEJO_EN_CLARO',
    },
  });
}

describe('Negocio.zuyuConfig — el material secreto vive en la instancia', () => {
  it('apiKey y webhookSecret SI estan en la instancia (los necesita zuyu.js)', () => {
    const n = negocioConSecretos();
    expect(n.zuyuConfig.apiKey).toBe('zk_dev_SUPERSECRETO_EN_CLARO');
    expect(n.zuyuConfig.webhookSecret).toBe('whsec_SECRETO_EN_CLARO');
  });
});

describe('Negocio.toJSON — los secretos NUNCA se serializan', () => {
  it('toJSON elimina apiKey, webhookSecret y webhookSecretPrevio', () => {
    const json = negocioConSecretos().toJSON();
    expect(json.zuyuConfig.apiKey).toBeUndefined();
    expect(json.zuyuConfig.webhookSecret).toBeUndefined();
    expect(json.zuyuConfig.webhookSecretPrevio).toBeUndefined();
  });

  it('toJSON conserva los campos NO secretos (prefijo, flags, baseUrl)', () => {
    const json = negocioConSecretos().toJSON();
    expect(json.zuyuConfig.conectado).toBe(true);
    expect(json.zuyuConfig.baseUrl).toBe('https://pilldb-dev.onrender.com');
    expect(json.zuyuConfig.apiKeyPrefix).toBe('zk_dev_abc12');
  });

  it('JSON.stringify del documento completo no arrastra ningun secreto', () => {
    const dump = JSON.stringify(negocioConSecretos());
    expect(dump).not.toContain('SUPERSECRETO');
    expect(dump).not.toContain('whsec_');
    expect(dump).toContain('zk_dev_abc12');
  });

  it('un negocio sin zuyuConfig no rompe el transform', () => {
    const n = new Negocio({ slug: 'simple', nombre: 'Simple' });
    expect(() => n.toJSON()).not.toThrow();
  });
});
