/**
 * Tests del dominio de envío (api/domain/envio.js) — función pura, sin I/O.
 * Cubre el origen del pickup que consumen los providers de delivery.
 */
const {
  formatearDireccion,
  construirOrigenEnvio,
  COORDENADAS_FALLBACK,
} = require('../../domain/envio');

describe('formatearDireccion', () => {
  it('une los campos presentes separados por comas', () => {
    expect(
      formatearDireccion({
        calle: 'Av. Reforma 100',
        colonia: 'Centro',
        ciudad: 'CDMX',
        estado: 'CDMX',
        cp: '06000',
      })
    ).toBe('Av. Reforma 100, Centro, CDMX, CDMX, 06000');
  });

  it('omite los campos vacíos o ausentes', () => {
    expect(formatearDireccion({ calle: 'Calle 1', ciudad: 'Puebla' })).toBe('Calle 1, Puebla');
  });

  it('devuelve cadena vacía si no hay dirección', () => {
    expect(formatearDireccion(null)).toBe('');
    expect(formatearDireccion(undefined)).toBe('');
    expect(formatearDireccion({})).toBe('');
  });

  it('hace trim de cada parte', () => {
    expect(formatearDireccion({ calle: '  Calle 1  ', ciudad: ' Puebla ' })).toBe(
      'Calle 1, Puebla'
    );
  });
});

describe('construirOrigenEnvio', () => {
  it('arma el origen desde un negocio completo', () => {
    const o = construirOrigenEnvio({
      nombre: 'Farmacia Demo',
      telefono: '+525555555555',
      direccion: { calle: 'Av. Reforma 100', ciudad: 'CDMX' },
      ubicacion: { lat: 19.5, lng: -99.2 },
    });
    expect(o.address).toBe('Av. Reforma 100, CDMX');
    expect(o.name).toBe('Farmacia Demo');
    expect(o.phone).toBe('+525555555555');
    expect(o.coordinates).toEqual({ lat: 19.5, lng: -99.2 });
  });

  it('usa el fallback de coordenadas si el negocio no tiene ubicación', () => {
    const o = construirOrigenEnvio({ nombre: 'X', direccion: { calle: 'C1' } });
    expect(o.coordinates).toEqual(COORDENADAS_FALLBACK);
  });

  it('usa defaults seguros si el negocio es nulo', () => {
    const o = construirOrigenEnvio(null);
    expect(o.name).toBe('Negocio');
    expect(o.phone).toBe('');
    expect(o.address).toBe('Dirección del negocio no configurada');
    expect(o.coordinates).toEqual(COORDENADAS_FALLBACK);
  });

  it('ignora coordenadas no numéricas (cae al fallback)', () => {
    const o = construirOrigenEnvio({ ubicacion: { lat: 'abc', lng: null } });
    expect(o.coordinates).toEqual(COORDENADAS_FALLBACK);
  });
});
