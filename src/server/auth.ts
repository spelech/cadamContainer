import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from './db';

export const SESSION_COOKIE_NAME = 'cadam_session';
export const STATE_COOKIE_NAME = 'cadam_oauth_state';
export const VERIFIER_COOKIE_NAME = 'cadam_code_verifier';

export const DEFAULT_POCKETID_ISSUER = 'https://sso.wileyriley.com';
export const DEFAULT_SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface PocketIdUserInfo {
  sub: string;
  email: string;
  name?: string | null;
  preferred_username?: string | null;
  display_name?: string | null;
  picture?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

export interface OidcTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';
  path?: string;
  maxAge?: number;
  domain?: string;
}

export interface PocketIdConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

/**
 * Returns the configured PocketID OIDC configuration.
 */
export function getPocketIdConfig(): PocketIdConfig {
  return {
    issuer:
      process.env.POCKETID_ISSUER?.trim() ||
      process.env.CADAM_OIDC_ISSUER?.trim() ||
      DEFAULT_POCKETID_ISSUER,
    clientId:
      process.env.POCKETID_CLIENT_ID?.trim() ||
      process.env.CADAM_OIDC_CLIENT_ID?.trim() ||
      '',
    clientSecret:
      process.env.POCKETID_CLIENT_SECRET?.trim() ||
      process.env.CADAM_OIDC_CLIENT_SECRET?.trim() ||
      '',
    redirectUri:
      process.env.POCKETID_REDIRECT_URI?.trim() ||
      process.env.CADAM_OIDC_REDIRECT_URI?.trim() ||
      undefined,
  };
}

/**
 * Returns the HMAC signing secret for session cookies.
 */
export function getSessionSecret(): string {
  const secret =
    process.env.CADAM_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.POCKETID_CLIENT_SECRET?.trim() ||
    process.env.CADAM_OIDC_CLIENT_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[auth] CADAM_SESSION_SECRET is not configured! Defaulting to fallback dev secret in production.',
    );
  }

  return 'cadam-insecure-default-session-secret-change-in-production';
}

/**
 * Determines whether cookies should include the Secure flag based on environment and request.
 */
export function isSecure(request?: Request): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.NODE_ENV === 'production') return true;
  if (!request) return false;
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'https') return true;
  return request.url.startsWith('https:');
}

/**
 * Parses HTTP Cookie header string into key-value map.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

/**
 * Serializes cookie name, value, and options into a Set-Cookie header value.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${options.maxAge}`;
  }
  cookie += `; Path=${options.path || '/'}`;
  if (options.httpOnly !== false) {
    cookie += '; HttpOnly';
  }
  if (options.secure) {
    cookie += '; Secure';
  }
  if (options.sameSite) {
    cookie += `; SameSite=${options.sameSite}`;
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  return cookie;
}

/**
 * Generates PKCE code_verifier, code_challenge (S256), and random CSRF state.
 */
export function generatePkce(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  return { verifier, challenge, state };
}

/**
 * Creates a signed JWT/HMAC session token containing user claims.
 */
export function signSession(
  user: AuthUser,
  expiresInSeconds = DEFAULT_SESSION_EXPIRY_SECONDS,
  secret = getSessionSecret(),
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: user.id,
    email: user.email,
    display_name: user.display_name ?? null,
    avatar_url: user.avatar_url ?? null,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `${headerB64}.${payloadB64}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');

  return `${content}.${signature}`;
}

/**
 * Verifies a signed session token and returns the authenticated user or null.
 */
export function verifySession(
  token: string,
  secret = getSessionSecret(),
): AuthUser | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const content = `${headerB64}.${payloadB64}`;

  try {
    const expectedSig = createHmac('sha256', secret).update(content).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (!payload || typeof payload !== 'object') return null;
    if (!payload.id || !payload.email) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      return null; // Expired
    }

    return {
      id: String(payload.id),
      email: String(payload.email),
      display_name: payload.display_name ?? null,
      avatar_url: payload.avatar_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the authenticated user from the Request's cookies or Authorization header.
 */
export async function getSessionUser(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];

  if (sessionCookie) {
    const user = verifySession(sessionCookie);
    if (user) return user;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    const user = verifySession(bearerToken);
    if (user) return user;
  }

  return null;
}

/**
 * Throws an Unauthorized error if no valid session exists on the request.
 */
export async function requireSessionUser(request: Request): Promise<AuthUser> {
  const user = await getSessionUser(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Creates Set-Cookie header string for cadam_session.
 */
export function createSessionCookie(
  token: string,
  options: Partial<CookieOptions> = {},
): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: options.maxAge ?? DEFAULT_SESSION_EXPIRY_SECONDS,
    secure: options.secure,
    ...options,
  });
}

/**
 * Creates Set-Cookie header string to clear cadam_session.
 */
export function clearSessionCookie(options: Partial<CookieOptions> = {}): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    secure: options.secure,
    ...options,
  });
}

/**
 * Creates Set-Cookie header string for cadam_oauth_state.
 */
export function createOauthStateCookie(
  state: string,
  options: Partial<CookieOptions> = {},
): string {
  return serializeCookie(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600, // 10 minutes
    secure: options.secure,
    ...options,
  });
}

/**
 * Creates Set-Cookie header string for cadam_code_verifier.
 */
export function createCodeVerifierCookie(
  verifier: string,
  options: Partial<CookieOptions> = {},
): string {
  return serializeCookie(VERIFIER_COOKIE_NAME, verifier, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600, // 10 minutes
    secure: options.secure,
    ...options,
  });
}

/**
 * Creates array of Set-Cookie header strings to clear temporary OAuth state cookies.
 */
export function clearOauthCookies(options: Partial<CookieOptions> = {}): string[] {
  return [
    serializeCookie(STATE_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
      secure: options.secure,
      ...options,
    }),
    serializeCookie(VERIFIER_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
      secure: options.secure,
      ...options,
    }),
  ];
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let cachedDiscovery: { doc: DiscoveryDoc; expiresAt: number } | null = null;

/**
 * Discovers OIDC endpoints from .well-known/openid-configuration or returns PocketID defaults.
 */
export async function getOidcEndpoints(issuer = getPocketIdConfig().issuer): Promise<DiscoveryDoc> {
  const now = Date.now();
  if (cachedDiscovery && cachedDiscovery.expiresAt > now) {
    return cachedDiscovery.doc;
  }

  const cleanIssuer = issuer.replace(/\/$/, '');
  const defaults: DiscoveryDoc = {
    authorization_endpoint: `${cleanIssuer}/oauth/authorize`,
    token_endpoint: `${cleanIssuer}/oauth/token`,
    userinfo_endpoint: `${cleanIssuer}/oauth/userinfo`,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${cleanIssuer}/.well-known/openid-configuration`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.authorization_endpoint && data.token_endpoint && data.userinfo_endpoint) {
        const doc: DiscoveryDoc = {
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          userinfo_endpoint: data.userinfo_endpoint,
        };
        cachedDiscovery = { doc, expiresAt: now + 3600 * 1000 };
        return doc;
      }
    }
  } catch {
    // Network or parse failure: fallback to defaults
  }

  return defaults;
}

/**
 * Builds the PocketID authorization URL.
 */
export async function buildAuthorizationUrl(options: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  issuer?: string;
  clientId?: string;
}): Promise<string> {
  const config = getPocketIdConfig();
  const issuer = options.issuer || config.issuer;
  const clientId = options.clientId || config.clientId;
  const endpoints = await getOidcEndpoints(issuer);

  const url = new URL(endpoints.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('scope', options.scope || 'openid profile email');
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

/**
 * Exchanges authorization code and PKCE verifier for OIDC tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  options?: {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
  },
): Promise<OidcTokens> {
  const config = getPocketIdConfig();
  const issuer = options?.issuer || config.issuer;
  const clientId = options?.clientId || config.clientId;
  const clientSecret = options?.clientSecret || config.clientSecret;

  const endpoints = await getOidcEndpoints(issuer);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(endpoints.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `PocketID token exchange failed (${res.status}): ${errorText}`,
    );
  }

  const tokens = (await res.json()) as OidcTokens;
  if (!tokens.access_token) {
    throw new Error('PocketID token exchange response missing access_token');
  }

  return tokens;
}

/**
 * Fetches user profile info from the PocketID userinfo endpoint.
 */
export async function fetchUserInfo(
  accessToken: string,
  options?: {
    issuer?: string;
    userinfoEndpoint?: string;
  },
): Promise<PocketIdUserInfo> {
  let endpoint = options?.userinfoEndpoint;
  if (!endpoint) {
    const config = getPocketIdConfig();
    const issuer = options?.issuer || config.issuer;
    const endpoints = await getOidcEndpoints(issuer);
    endpoint = endpoints.userinfo_endpoint;
  }

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `PocketID userinfo fetch failed (${res.status}): ${errorText}`,
    );
  }

  const userInfo = (await res.json()) as PocketIdUserInfo;
  if (!userInfo.email) {
    throw new Error('PocketID userinfo response missing email');
  }

  return userInfo;
}

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/**
 * Upserts a PocketID user into the PostgreSQL profiles table.
 * Matches existing profiles by id (sub) or email, preserving primary key identity.
 */
export async function syncUserProfile(
  userInfo: PocketIdUserInfo,
): Promise<AuthUser> {
  const email = userInfo.email.trim().toLowerCase();
  const displayName =
    userInfo.display_name?.trim() ||
    userInfo.name?.trim() ||
    userInfo.preferred_username?.trim() ||
    email.split('@')[0];

  const avatarUrl =
    userInfo.avatar_url || userInfo.picture || userInfo.avatar || null;

  const validSubUuid = isValidUuid(userInfo.sub) ? userInfo.sub : null;

  // 1. Check if profile already exists by id (sub) or email
  const existingRes = await query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT id, email, display_name, avatar_url FROM profiles
     WHERE ($1::uuid IS NOT NULL AND id = $1::uuid) OR (LOWER(email) = $2)
     LIMIT 1`,
    [validSubUuid, email],
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const updateRes = await query<{
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
    }>(
      `UPDATE profiles
       SET email = $2,
           display_name = COALESCE($3, display_name),
           avatar_url = COALESCE($4, avatar_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, avatar_url`,
      [existing.id, email, displayName, avatarUrl],
    );

    const updated = updateRes.rows[0] || existing;
    return {
      id: updated.id,
      email: updated.email,
      display_name: updated.display_name,
      avatar_url: updated.avatar_url,
    };
  }

  // 2. Determine ID: use sub if valid UUID, otherwise generate random UUID
  const newId = validSubUuid ? validSubUuid : randomUUID();

  // 3. Insert fresh profile
  const insertRes = await query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  }>(
    `INSERT INTO profiles (id, email, display_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
       updated_at = NOW()
     RETURNING id, email, display_name, avatar_url`,
    [newId, email, displayName, avatarUrl],
  );

  const row = insertRes.rows[0];
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
  };
}

/**
 * Determines the public redirect URI for PocketID callbacks based on request context.
 */
export function getCallbackUri(request: Request): string {
  const config = getPocketIdConfig();
  if (config.redirectUri) {
    return config.redirectUri;
  }

  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || url.host;
  const proto =
    request.headers.get('x-forwarded-proto') ||
    url.protocol.replace(':', '') ||
    'http';

  return `${proto}://${host}/cadam/api/auth/callback`;
}
