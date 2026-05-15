/**
 * Tests del guard SSRF (api/utils/urlGuard.js).
 *
 * Cubren `ipv4InBlockedRange` (pura) exhaustivamente y los caminos de
 * `assertSafeUrl` que NO dependen de DNS (URL malformada, protocolo,
 * localhost, IPv6 literal, IPs literales privadas/publicas).
 *
 * describe/it/expect globales (vitest.config.js -> globals: true).
 */
const { assertSafeUrl, ipv4InBlockedRange } = require('../../utils/urlGuard');

describe('ipv4InBlockedRange — rangos privados/reservados', () => {
  it('bloquea loopback 127.0.0.0/8', () => {
    expect(ipv4InBlockedRange('127.0.0.1')).toBe(true);
    expect(ipv4InBlockedRange('127.255.255.255')).toBe(true);
  });

  it('bloquea RFC1918 (10/8, 172.16/12, 192.168/16)', () => {
    expect(ipv4InBlockedRange('10.0.0.1')).toBe(true);
    expect(ipv4InBlockedRange('10.255.255.255')).toBe(true);
    expect(ipv4InBlockedRange('172.16.0.1')).toBe(true);
    expect(ipv4InBlockedRange('172.31.255.255')).toBe(true);
    expect(ipv4InBlockedRange('192.168.1.1')).toBe(true);
  });

  it('NO bloquea 172.15.x ni 172.32.x (fuera del /12)', () => {
    expect(ipv4InBlockedRange('172.15.0.1')).toBe(false);
    expect(ipv4InBlockedRange('172.32.0.1')).toBe(false);
  });

  it('bloquea link-local 169.254/16 (metadata cloud — vector SSRF clasico)', () => {
    expect(ipv4InBlockedRange('169.254.169.254')).toBe(true);
  });

  it('bloquea CGNAT 100.64/10 y 0.0.0.0/8', () => {
    expect(ipv4InBlockedRange('100.64.0.1')).toBe(true);
    expect(ipv4InBlockedRange('100.127.255.255')).toBe(true);
    expect(ipv4InBlockedRange('0.0.0.0')).toBe(true);
  });

  it('permite IPs publicas reales', () => {
    expect(ipv4InBlockedRange('8.8.8.8')).toBe(false);
    expect(ipv4InBlockedRange('1.1.1.1')).toBe(false);
    expect(ipv4InBlockedRange('216.58.210.46')).toBe(false);
  });

  it('fail-closed: strings que no son IPv4 valida se bloquean', () => {
    expect(ipv4InBlockedRange('not-an-ip')).toBe(true);
    expect(ipv4InBlockedRange('999.1.1.1')).toBe(true);
    expect(ipv4InBlockedRange('10.0.0')).toBe(true);
  });
});

describe('assertSafeUrl — rechazos sin DNS', () => {
  it('rechaza URL malformada', async () => {
    await expect(assertSafeUrl('no-es-una-url')).rejects.toThrow();
  });

  it('rechaza protocolos que no son http/https', async () => {
    await expect(assertSafeUrl('ftp://ejemplo.com')).rejects.toThrow();
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('rechaza localhost', async () => {
    await expect(assertSafeUrl('https://localhost/x')).rejects.toThrow(/localhost/);
    await expect(assertSafeUrl('https://api.localhost/x')).rejects.toThrow(/localhost/);
  });

  it('rechaza direcciones IPv6 literales', async () => {
    await expect(assertSafeUrl('https://[::1]/x')).rejects.toThrow(/IPv6/);
  });

  it('rechaza IPs literales privadas / metadata', async () => {
    await expect(assertSafeUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /privada o reservada/
    );
    await expect(assertSafeUrl('https://10.0.0.5/admin')).rejects.toThrow(/privada o reservada/);
    await expect(assertSafeUrl('https://127.0.0.1:3000/')).rejects.toThrow(/privada o reservada/);
  });

  it('acepta una IP literal publica', async () => {
    await expect(assertSafeUrl('https://8.8.8.8/')).resolves.toBeUndefined();
  });
});
