const { selectProviderByCity } = require('../../services/delivery');

// Agrupa los tests de la seleccion de carrier por ciudad del negocio.
describe('selectProviderByCity', () => {
  // Verifica que CDMX se resuelve a iVoy.
  it('CDMX se resuelve a ivoy', () => {
    expect(selectProviderByCity({ direccion: { ciudad: 'CDMX' } })).toBe('ivoy');
  });

  // Verifica que Guadalajara se resuelve a Lalamove.
  it('Guadalajara se resuelve a lalamove', () => {
    expect(selectProviderByCity({ direccion: { ciudad: 'Guadalajara' } })).toBe('lalamove');
  });

  // Verifica que una ciudad sin regla cae en Uber Direct.
  it('Queretaro (sin regla) cae en uberDirect', () => {
    expect(selectProviderByCity({ direccion: { ciudad: 'Queretaro' } })).toBe('uberDirect');
  });

  // Verifica que un carrier fijado por el negocio gana sobre la ciudad.
  it('respeta el override por campo aunque la ciudad apunte a otro carrier', () => {
    expect(
      selectProviderByCity({
        deliveryProvider: 'lalamove',
        direccion: { ciudad: 'CDMX' },
      })
    ).toBe('lalamove');
  });

  // Verifica que "auto" delega la decision a la ciudad.
  it('con "auto" delega la seleccion a la ciudad', () => {
    expect(
      selectProviderByCity({
        deliveryProvider: 'auto',
        direccion: { ciudad: 'CDMX' },
      })
    ).toBe('ivoy');
  });
});
