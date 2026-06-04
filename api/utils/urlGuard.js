const dns = require('dns').promises;
const { URL } = require('url');

const ALLOW_HTTP = process.env.NODE_ENV !== 'production';

// True si la IPv4 cae en un rango privado/reservado (SSRF); fail-closed si invalida.
function ipv4InBlockedRange(ip) {
  const octetos = String(ip).split('.').map(Number);
  if (octetos.length !== 4 || octetos.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = octetos;
  if (a === 127) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  return false;
}

// True si el host es un literal IPv4 (cuatro octetos numericos).
function isIpv4Literal(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

// Valida que una URL sea segura para un fetch saliente; lanza Error si es insegura.
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

  if (host.includes(':')) {
    throw new Error('Las direcciones IPv6 no estan permitidas');
  }

  if (isIpv4Literal(host)) {
    if (ipv4InBlockedRange(host)) {
      throw new Error('La URL apunta a una IP privada o reservada');
    }
    return;
  }

  let direccionesIp;
  try {
    direccionesIp = await dns.resolve4(host);
  } catch (err) {
    throw new Error(`No se pudo resolver el hostname: ${err.message}`);
  }
  if (!direccionesIp || direccionesIp.length === 0) {
    throw new Error('El hostname no resuelve a ninguna IP');
  }
  for (const ip of direccionesIp) {
    if (ipv4InBlockedRange(ip)) {
      throw new Error(`La URL resuelve a una IP bloqueada: ${ip}`);
    }
  }
}

module.exports = { assertSafeUrl, ipv4InBlockedRange };
