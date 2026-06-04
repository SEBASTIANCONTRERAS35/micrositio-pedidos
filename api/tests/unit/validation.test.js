const { z } = require('zod');
const { validate } = require('../../middlewares/validation');

const schema = z.object({
  nombre: z.string().min(2).max(50),
  edad: z.number().int().positive(),
});

// Ejecuta un middleware y resuelve con el error y el req resultantes.
function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = (err) => resolve({ err, req });
    mw(req, res, next);
  });
}

describe('validate middleware', () => {
  it('pasa con body valido', async () => {
    const { err } = await runMiddleware(validate(schema), {
      body: { nombre: 'Juan', edad: 30 },
    });
    expect(err).toBeUndefined();
  });

  it('rechaza body invalido', async () => {
    const { err } = await runMiddleware(validate(schema), {
      body: { nombre: 'X', edad: -1 },
    });
    expect(err).toBeDefined();
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.length).toBeGreaterThan(0);
  });
});
