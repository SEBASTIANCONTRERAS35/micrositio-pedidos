/**
 * Defensa SSRF para URLs salientes (la `baseUrl` de ZUYU que captura el dueno).
 *
 * Sin esto, un dueno (o un JWT robado) podria poner `https://169.254.169.254/`
 * (metadata cloud) o `https://10.0.0.x/` y convertir el micrositio en un proxy
 * SSRF que ademas adjunta el `X-API-Key` al request — filtrando la credencial.
 *
 * Estrategia (OWASP SSRF Cheat Sheet, version sin dependencias):
 *   1. Solo HTTPS (HTTP solo fuera de produccion)
 *   2. Bloquear loopback / IPv6 literal
 *   3. Resolver DNS y bloquear toda IP privada/reservada
 */
const dns = require('dns').promises;
const { URL } = require('url');

const ALLOW_HTTP = process.env.NODE_ENV !== 'production';

/**
 * True si la IPv4 cae en un rango privado/reservado (SSRF).
 * Tambien devuelve true si el string no es una IPv4 valida (fail-closed).
 */
function ipv4InBlockedRange(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // no es IPv4 valida — bloquear por seguridad
  }
  const [a, b] = parts;
  if (a === 127) {
    return true;
  } // loopback
  if (a === 10) {
    return true;
  } // RFC1918
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  } // RFC1918
  if (a === 192 && b === 168) {
    return true;
  } // RFC1918
  if (a === 169 && b === 254) {
    return true;
  } // link-local (metadata AWS/GCP/Azure)
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  } // CGNAT
  if (a === 0) {
    return true;
  } // "this" network
  return false;
}

function isIpv4Literal(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Valida que una URL sea segura para un fetch saliente. Lanza Error con
 * mensaje user-facing si es insegura.
 *
 * @param {string} rawUrl
 */
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL malformada');
  }

  if (url.protocol !== 'https:' && !(ALLOW_HTTP && url.protocol === 'http:')) {
    throw new Error('La URL debe usar HTTPS');
  }

  const host = url.hostname;

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('La URL apunta a localhost');
  }

  // IPv6 literal: no es un caso valido para la baseUrl de ZUYU — bloquear.
  if (host.includes(':')) {
    throw new Error('Las direcciones IPv6 no estan permitidas');
  }

  // IPv4 literal: validar directamente, sin DNS.
  if (isIpv4Literal(host)) {
    if (ipv4InBlockedRange(host)) {
      throw new Error('La URL apunta a una IP privada o reservada');
    }
    return;
  }

  // Hostname: resolver DNS y validar TODAS las IPs que devuelva.
  let ips;
  try {
    ips = await dns.resolve4(host);
  } catch (err) {
    throw new Error(`No se pudo resolver el hostname: ${err.message}`);
  }
  if (!ips || ips.length === 0) {
    throw new Error('El hostname no resuelve a ninguna IP');
  }
  for (const ip of ips) {
    if (ipv4InBlockedRange(ip)) {
      throw new Error(`La URL resuelve a una IP bloqueada: ${ip}`);
    }
  }
}

module.exports = { assertSafeUrl, ipv4InBlockedRange };
