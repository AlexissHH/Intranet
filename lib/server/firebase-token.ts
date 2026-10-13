/**
 * Verificación de ID tokens de Firebase en el servidor, sin dependencias externas.
 *
 * Sigue el procedimiento documentado por Firebase para verificar tokens con
 * una librería JWT de terceros (https://firebase.google.com/docs/auth/admin/verify-id-tokens):
 *   - alg = RS256 y `kid` presente en las claves públicas de Google.
 *   - exp en el futuro, iat en el pasado, auth_time en el pasado.
 *   - aud = ID del proyecto Firebase.
 *   - iss = https://securetoken.google.com/<ID del proyecto>.
 *   - sub no vacío (es el uid).
 * La firma se valida con las claves JWKS publicadas por Google.
 *
 * Solo para uso en servidor (importa `node:crypto`).
 */
import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_KEYS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 8192;

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

interface JwkWithKid {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}

let keyCache: { keys: Map<string, KeyObject>; expiresAt: number } | null = null;

/** Solo para tests: limpia la caché de claves públicas. */
export function __resetKeyCacheForTests(): void {
  keyCache = null;
}

function base64UrlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJson<T>(buf: Buffer, what: string): T {
  try {
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    throw new TokenVerificationError(`Token malformado (${what}).`);
  }
}

async function loadKeys(fetchImpl: typeof fetch): Promise<Map<string, KeyObject>> {
  const now = Date.now();
  if (keyCache && keyCache.expiresAt > now) return keyCache.keys;

  const res = await fetchImpl(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`No se pudieron obtener las claves públicas (HTTP ${res.status}).`);

  const body = (await res.json()) as { keys?: JwkWithKid[] };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
  }
  if (keys.size === 0) throw new Error('El servicio de claves públicas no devolvió claves RSA.');

  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
  const ttl = maxAge ? Math.min(Number(maxAge[1]) * 1000, DEFAULT_KEYS_TTL_MS) : DEFAULT_KEYS_TTL_MS;
  keyCache = { keys, expiresAt: now + Math.max(ttl, 60_000) };
  return keys;
}

export interface VerifyOptions {
  projectId: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
  /** Inyectable para tests (segundos Unix). */
  nowSeconds?: number;
}

/**
 * Verifica un ID token de Firebase. Lanza `TokenVerificationError` si es inválido
 * y un `Error` común si no pudo consultar las claves públicas (fallo de red).
 */
export async function verifyFirebaseIdToken(
  token: string,
  { projectId, fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) }: VerifyOptions
): Promise<VerifiedFirebaseUser> {
  if (!projectId) throw new Error('Falta el ID del proyecto Firebase para verificar el token.');
  if (!token || token.length > MAX_TOKEN_LENGTH) throw new TokenVerificationError('Token ausente o demasiado largo.');

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p === '')) throw new TokenVerificationError('Token malformado.');
  const [h, p, s] = parts;

  const header = parseJson<{ alg?: string; kid?: string }>(base64UrlToBuffer(h), 'cabecera');
  if (header.alg !== 'RS256') throw new TokenVerificationError('Algoritmo de firma no permitido.');
  if (!header.kid) throw new TokenVerificationError('El token no indica la clave de firma (kid).');

  const keys = await loadKeys(fetchImpl);
  const key = keys.get(header.kid);
  if (!key) {
    // Pudo rotar la clave: se invalida la caché para el próximo intento.
    keyCache = null;
    throw new TokenVerificationError('Clave de firma desconocida.');
  }

  const signatureOk = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, base64UrlToBuffer(s));
  if (!signatureOk) throw new TokenVerificationError('Firma del token inválida.');

  const claims = parseJson<{
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(base64UrlToBuffer(p), 'payload');

  if (claims.aud !== projectId) throw new TokenVerificationError('El token no corresponde a este proyecto.');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new TokenVerificationError('Emisor del token inválido.');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) {
    throw new TokenVerificationError('El token expiró.');
  }
  if (typeof claims.iat !== 'number' || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new TokenVerificationError('El token tiene fecha de emisión inválida.');
  }
  if (typeof claims.auth_time === 'number' && claims.auth_time > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new TokenVerificationError('El token tiene fecha de autenticación inválida.');
  }
  if (!claims.sub || typeof claims.sub !== 'string') throw new TokenVerificationError('El token no tiene uid.');

  return {
    uid: claims.sub,
    email: (claims.email ?? '').trim().toLowerCase(),
    emailVerified: claims.email_verified === true,
    name: claims.name,
  };
}
