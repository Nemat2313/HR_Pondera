import crypto from 'crypto';
import { getDb } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'pondera_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const DEFAULT_ADMIN_SCRYPT_HASH =
  'scrypt$5f0c1797ae937ffa6cf761787321859e$787cfeb5fdb0e92a1998e7368e4608fe317db38e36f60182f5ffe41e2ea0f2e89fcae63e40337ce4b17ae750190e99a588fb7d18dfea147c62e97d65311e5b34';

export const INITIAL_ADMIN_PASSWORD_HASH =
  (process.env.ADMIN_PASSWORD_HASH || '').trim() || DEFAULT_ADMIN_SCRYPT_HASH;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  scope_type: 'all' | 'region' | 'project';
  scope_value: string;
  exp?: number;
}

export function isPasswordHashed(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

export function hashPassword(plainPassword: string): string {
  const clean = String(plainPassword);
  if (isPasswordHashed(clean)) return clean;
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plainPassword: string, storedPassword: string): boolean {
  if (!plainPassword || !storedPassword) return false;
  const input = String(plainPassword);
  const stored = String(storedPassword);

  if (isPasswordHashed(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    try {
      const derived = crypto.scryptSync(input, salt, 64);
      const expected = Buffer.from(hashHex, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  // Legacy plaintext fallback (will be upgraded to scrypt hash upon login)
  const a = Buffer.from(input, 'utf-8');
  const b = Buffer.from(stored, 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

let cachedHmacSecret: string | null = null;

function getHmacSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 16) {
    return process.env.AUTH_SECRET.trim();
  }
  if (cachedHmacSecret) return cachedHmacSecret;

  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const row = db
      .prepare("SELECT value FROM system_info WHERE key = 'auth_hmac_secret'")
      .get() as { value?: string } | undefined;
    if (row?.value && row.value.length >= 32) {
      cachedHmacSecret = row.value;
      return cachedHmacSecret;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare(
      "INSERT OR REPLACE INTO system_info (key, value) VALUES ('auth_hmac_secret', ?)"
    ).run(generated);
    cachedHmacSecret = generated;
    return cachedHmacSecret;
  } catch {
    if (!cachedHmacSecret) {
      cachedHmacSecret = crypto.randomBytes(32).toString('hex');
    }
    return cachedHmacSecret;
  }
}

export function createSessionToken(user: Omit<SessionUser, 'exp'>): string {
  const payloadObj: SessionUser = {
    id: Number(user.id),
    name: String(user.name),
    email: String(user.email),
    role: user.role,
    scope_type: user.scope_type,
    scope_value: String(user.scope_value),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getHmacSecret())
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf-8');
    const b = Buffer.from(expectedSig, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as SessionUser;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export function getSessionUserFromRequest(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get('cookie');
  const token = parseCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  return verifySessionToken(token);
}

export function buildSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isProd) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
