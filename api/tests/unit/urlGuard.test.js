const { assertSafeUrl, ipv4InBlockedRange } = require('../../utils/urlGuard');

// Agrupa pruebas de ipv4InBlockedRange para rangos privados/reservados.
describe('ipv4InBlockedRange — rangos privados/reservados', () => {
  // Verifica que el rango loopback 127.0.0.0/8 sea bloqueado.
  it('bloquea loopback 127.0.0.0/8', () => {
    expect(ipv4InBlockedRange('127.0.0.1')).toBe(true);
    expect(ipv4InBlockedRange('127.255.255.255')).toBe(true);
  });

  // Verifica que los rangos RFC1918 sean bloqueados.
  it('bloquea RFC1918 (10/8, 172.16/12, 192.168/16)', () => {
    expect(ipv4InBlockedRange('10.0.0.1')).toBe(true);
    expect(ipv4InBlockedRange('10.255.255.255')).toBe(true);
    expect(ipv4InBlockedRange('172.16.0.1')).toBe(true);
    expect(ipv4InBlockedRange('172.31.255.255')).toBe(true);
    expect(ipv4InBlockedRange('192.168.1.1')).toBe(true);
  });

  // Verifica que IPs fuera del bloque /12 de 172 no se bloqueen.
  it('NO bloquea 172.15.x ni 172.32.x (fuera del /12)', () => {
    expect(ipv4InBlockedRange('172.15.0.1')).toBe(false);
    expect(ipv4InBlockedRange('172.32.0.1')).toBe(false);
  });

  // Verifica que el rango link-local 169.254/16 sea bloqueado.
  it('bloquea link-local 169.254/16 (metadata cloud — vector SSRF clasico)', () => {
    expect(ipv4InBlockedRange('169.254.169.254')).toBe(true);
  });

  // Verifica que los rangos CGNAT 100.64/10 y 0.0.0.0/8 sean bloqueados.
  it('bloquea CGNAT 100.64/10 y 0.0.0.0/8', () => {
    expect(ipv4InBlockedRange('100.64.0.1')).toBe(true);
    expect(ipv4InBlockedRange('100.127.255.255')).toBe(true);
    expect(ipv4InBlockedRange('0.0.0.0')).toBe(true);
  });

  // Verifica que IPs publicas reales no se bloqueen.
  it('permite IPs publicas reales', () => {
    expect(ipv4InBlockedRange('8.8.8.8')).toBe(false);
    expect(ipv4InBlockedRange('1.1.1.1')).toBe(false);
    expect(ipv4InBlockedRange('216.58.210.46')).toBe(false);
  });

  // Verifica el fail-closed: strings no IPv4 validas se bloquean.
  it('fail-closed: strings que no son IPv4 valida se bloquean', () => {
    expect(ipv4InBlockedRange('not-an-ip')).toBe(true);
    expect(ipv4InBlockedRange('999.1.1.1')).toBe(true);
    expect(ipv4InBlockedRange('10.0.0')).toBe(true);
  });
});

// Agrupa pruebas de assertSafeUrl para rechazos que no dependen de DNS.
describe('assertSafeUrl — rechazos sin DNS', () => {
  // Verifica que una URL malformada sea rechazada.
  it('rechaza URL malformada', async () => {
    await expect(assertSafeUrl('no-es-una-url')).rejects.toThrow();
  });

  // Verifica que protocolos distintos de http/https sean rechazados.
  it('rechaza protocolos que no son http/https', async () => {
    await expect(assertSafeUrl('ftp://ejemplo.com')).rejects.toThrow();
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
  });

  // Verifica que las URLs hacia localhost sean rechazadas.
  it('rechaza localhost', async () => {
    await expect(assertSafeUrl('https://localhost/x')).rejects.toThrow(/localhost/);
    await expect(assertSafeUrl('https://api.localhost/x')).rejects.toThrow(/localhost/);
  });

  // Verifica que las direcciones IPv6 literales sean rechazadas.
  it('rechaza direcciones IPv6 literales', async () => {
    await expect(assertSafeUrl('https://[::1]/x')).rejects.toThrow(/IPv6/);
  });

  // Verifica que IPs literales privadas o de metadata sean rechazadas.
  it('rechaza IPs literales privadas / metadata', async () => {
    await expect(assertSafeUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /privada o reservada/
    );
    await expect(assertSafeUrl('https://10.0.0.5/admin')).rejects.toThrow(/privada o reservada/);
    await expect(assertSafeUrl('https://127.0.0.1:3000/')).rejects.toThrow(/privada o reservada/);
  });

  // Verifica que una IP literal publica sea aceptada.
  it('acepta una IP literal publica', async () => {
    await expect(assertSafeUrl('https://8.8.8.8/')).resolves.toBeUndefined();
  });
});
