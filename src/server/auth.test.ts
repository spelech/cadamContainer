import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { after, describe, it } from 'node:test';

// Resolve database URL for local test runs if running on host outside docker container network
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  try {
    const ip = execSync(
      "docker inspect cadam-db -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'",
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (ip) {
      return `postgres://cadam:cadam_secret_pass@${ip}:5432/cadam`;
    }
  } catch {
    // fallback to default
  }
  return 'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';
}

process.env.DATABASE_URL = resolveDatabaseUrl();
process.env.POCKETID_CLIENT_ID = 'test-client-id';
process.env.POCKETID_CLIENT_SECRET = 'test-client-secret';
process.env.CADAM_SESSION_SECRET = 'test-cadam-session-secret-key-for-hmac-sha256';

const {
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  VERIFIER_COOKIE_NAME,
  generatePkce,
  parseCookies,
  serializeCookie,
  signSession,
  verifySession,
  getSessionUser,
  requireSessionUser,
  createSessionCookie,
  clearSessionCookie,
  createOauthStateCookie,
  createCodeVerifierCookie,
  clearOauthCookies,
  buildAuthorizationUrl,
  getCallbackUri,
  syncUserProfile,
} = await import('./auth.ts');

const { query, closePool } = await import('./db.ts');

const { Route: LoginRoute } = await import('../routes/api/auth/login.ts');
const { Route: CallbackRoute } = await import('../routes/api/auth/callback.ts');
const { Route: MeRoute } = await import('../routes/api/auth/me.ts');
const { Route: LogoutRoute } = await import('../routes/api/auth/logout.ts');

type RouteHandler = (opts: { request: Request }) => Promise<Response>;
function getHandler(route: { options: { server?: { handlers?: unknown } } }, method: string): RouteHandler {
  const handlers = route.options.server?.handlers as Record<string, RouteHandler> | undefined;
  return handlers?.[method] as RouteHandler;
}

describe('Auth Module (src/server/auth.ts)', () => {
  after(async () => {
    await closePool();
  });

  describe('PKCE Generation', () => {
    it('generates random verifier, state, and valid S256 challenge', () => {
      const { verifier, challenge, state } = generatePkce();

      assert.ok(verifier.length >= 43, 'verifier should be at least 43 chars');
      assert.ok(state.length >= 20, 'state should be sufficiently long');
      assert.ok(challenge.length >= 40, 'challenge should be valid sha256 base64url');

      const expectedChallenge = createHash('sha256').update(verifier).digest('base64url');
      assert.strictEqual(challenge, expectedChallenge);
    });

    it('generates unique tokens on every invocation', () => {
      const a = generatePkce();
      const b = generatePkce();

      assert.notStrictEqual(a.verifier, b.verifier);
      assert.notStrictEqual(a.challenge, b.challenge);
      assert.notStrictEqual(a.state, b.state);
    });
  });

  describe('Cookie Parsing and Serialization', () => {
    it('parses empty and complex cookie strings', () => {
      assert.deepStrictEqual(parseCookies(''), {});
      assert.deepStrictEqual(parseCookies(null), {});
      assert.deepStrictEqual(parseCookies(undefined), {});

      const parsed = parseCookies(
        'cadam_session=abc123xyz; other_cookie=foo%20bar; flag=1',
      );
      assert.strictEqual(parsed.cadam_session, 'abc123xyz');
      assert.strictEqual(parsed.other_cookie, 'foo bar');
      assert.strictEqual(parsed.flag, '1');
    });

    it('serializes cookies with appropriate security attributes', () => {
      const cookie = serializeCookie('test_name', 'test_value', {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 3600,
      });

      assert.ok(cookie.includes('test_name=test_value'));
      assert.ok(cookie.includes('Max-Age=3600'));
      assert.ok(cookie.includes('Path=/'));
      assert.ok(cookie.includes('HttpOnly'));
      assert.ok(cookie.includes('Secure'));
      assert.ok(cookie.includes('SameSite=Lax'));
    });

    it('creates and clears session and oauth cookies', () => {
      const sessionCookie = createSessionCookie('jwt.token.val', { secure: false });
      assert.ok(sessionCookie.includes(`${SESSION_COOKIE_NAME}=jwt.token.val`));
      assert.ok(sessionCookie.includes('HttpOnly'));
      assert.ok(sessionCookie.includes('SameSite=Lax'));

      const clearSession = clearSessionCookie();
      assert.ok(clearSession.includes(`${SESSION_COOKIE_NAME}=`));
      assert.ok(clearSession.includes('Max-Age=0'));

      const stateCookie = createOauthStateCookie('state123');
      assert.ok(stateCookie.includes(`${STATE_COOKIE_NAME}=state123`));

      const verifierCookie = createCodeVerifierCookie('verif456');
      assert.ok(verifierCookie.includes(`${VERIFIER_COOKIE_NAME}=verif456`));

      const clearOauth = clearOauthCookies();
      assert.strictEqual(clearOauth.length, 2);
      assert.ok(clearOauth[0].includes('Max-Age=0'));
      assert.ok(clearOauth[1].includes('Max-Age=0'));
    });
  });

  describe('Session JWT Signing and Verification', () => {
    const testUser = {
      id: 'd3b07384-d113-4ec4-a957-a37a1f592d3f',
      email: 'pilot@cadam.io',
      display_name: 'Test Pilot',
      avatar_url: 'https://avatar.example.com/pilot.png',
    };

    it('signs and verifies session token successfully', () => {
      const token = signSession(testUser);
      assert.strictEqual(token.split('.').length, 3);

      const verified = verifySession(token);
      assert.ok(verified);
      assert.strictEqual(verified.id, testUser.id);
      assert.strictEqual(verified.email, testUser.email);
      assert.strictEqual(verified.display_name, testUser.display_name);
      assert.strictEqual(verified.avatar_url, testUser.avatar_url);
    });

    it('rejects tampered signatures', () => {
      const token = signSession(testUser);
      const [header, payload, sig] = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
          email: 'hacker@cadam.io',
        }),
      ).toString('base64url');

      const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
      assert.strictEqual(verifySession(tamperedToken), null);
    });

    it('rejects expired tokens', () => {
      // Create token with negative expiry
      const expiredToken = signSession(testUser, -60);
      assert.strictEqual(verifySession(expiredToken), null);
    });

    it('rejects malformed token strings', () => {
      assert.strictEqual(verifySession('not-a-token'), null);
      assert.strictEqual(verifySession('a.b'), null);
      assert.strictEqual(verifySession(''), null);
    });
  });

  describe('Session Extraction from Request', () => {
    const testUser = {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'request@example.com',
      display_name: 'Request User',
      avatar_url: null,
    };

    it('extracts user from Cookie header', async () => {
      const token = signSession(testUser);
      const req = new Request('http://localhost:3000/cadam/api/auth/me', {
        headers: {
          Cookie: `foo=bar; ${SESSION_COOKIE_NAME}=${token}; baz=qux`,
        },
      });

      const user = await getSessionUser(req);
      assert.ok(user);
      assert.strictEqual(user.id, testUser.id);
      assert.strictEqual(user.email, testUser.email);
    });

    it('extracts user from Authorization Bearer header', async () => {
      const token = signSession(testUser);
      const req = new Request('http://localhost:3000/cadam/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const user = await getSessionUser(req);
      assert.ok(user);
      assert.strictEqual(user.id, testUser.id);
    });

    it('returns null when no session is present', async () => {
      const req = new Request('http://localhost:3000/cadam/api/auth/me');
      assert.strictEqual(await getSessionUser(req), null);
    });

    it('requireSessionUser throws when unauthenticated', async () => {
      const req = new Request('http://localhost:3000/cadam/api/auth/me');
      await assert.rejects(async () => {
        await requireSessionUser(req);
      }, /Unauthorized/);
    });
  });

  describe('OIDC Configuration and Authorization URL', () => {
    it('constructs PocketID authorization URL with correct parameters', async () => {
      const urlStr = await buildAuthorizationUrl({
        redirectUri: 'https://cadam.wileyriley.com/cadam/api/auth/callback',
        state: 'sample-state-value',
        codeChallenge: 'sample-code-challenge',
      });

      const parsed = new URL(urlStr);
      assert.strictEqual(parsed.searchParams.get('response_type'), 'code');
      assert.strictEqual(parsed.searchParams.get('client_id'), 'test-client-id');
      assert.strictEqual(
        parsed.searchParams.get('redirect_uri'),
        'https://cadam.wileyriley.com/cadam/api/auth/callback',
      );
      assert.strictEqual(parsed.searchParams.get('state'), 'sample-state-value');
      assert.strictEqual(
        parsed.searchParams.get('code_challenge'),
        'sample-code-challenge',
      );
      assert.strictEqual(parsed.searchParams.get('code_challenge_method'), 'S256');
    });

    it('resolves callback URI respecting x-forwarded headers and basepath', () => {
      delete process.env.POCKETID_REDIRECT_URI;
      const req = new Request('http://localhost:3000/cadam/api/auth/login', {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'cadam.wileyriley.com',
        },
      });

      const callbackUri = getCallbackUri(req);
      assert.strictEqual(
        callbackUri,
        'https://cadam.wileyriley.com/cadam/api/auth/callback',
      );
    });
  });

  describe('Database Profile Synchronization (syncUserProfile)', () => {
    it('inserts a new profile when user logs in with UUID sub', async () => {
      const sub = crypto.randomUUID();
      const email = `oidc_user_${Date.now()}@example.com`;

      const user = await syncUserProfile({
        sub,
        email,
        name: 'PocketID Explorer',
        picture: 'https://pocketid.example.com/avatar.jpg',
      });

      assert.strictEqual(user.id, sub);
      assert.strictEqual(user.email, email);
      assert.strictEqual(user.display_name, 'PocketID Explorer');
      assert.strictEqual(user.avatar_url, 'https://pocketid.example.com/avatar.jpg');

      // Verify stored in DB
      const dbRow = await query('SELECT * FROM profiles WHERE id = $1', [sub]);
      assert.strictEqual(dbRow.rows.length, 1);
      assert.strictEqual(dbRow.rows[0].email, email);
      assert.strictEqual(dbRow.rows[0].full_name, 'PocketID Explorer');
    });

    it('generates valid UUID when sub is non-UUID format', async () => {
      const sub = `pocketid_non_uuid_${Date.now()}`;
      const email = `non_uuid_${Date.now()}@example.com`;

      const user = await syncUserProfile({
        sub,
        email,
        name: 'Non Uuid User',
      });

      assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          user.id,
        ),
        'Generated ID should be a valid UUID',
      );
      assert.strictEqual(user.email, email);
    });

    it('updates existing profile when user logs in again with same email', async () => {
      const sub = crypto.randomUUID();
      const email = `sync_update_${Date.now()}@example.com`;

      const initial = await syncUserProfile({
        sub,
        email,
        name: 'Initial Name',
      });

      const updated = await syncUserProfile({
        sub,
        email,
        name: 'Updated Name',
        picture: 'https://newavatar.org/pic.png',
      });

      assert.strictEqual(updated.id, initial.id, 'User ID must be preserved');
      assert.strictEqual(updated.display_name, 'Updated Name');
      assert.strictEqual(updated.avatar_url, 'https://newavatar.org/pic.png');
    });
  });

  describe('Route Handlers', () => {
    describe('/api/auth/login', () => {
      it('redirects to PocketID with state and verifier Set-Cookie headers', async () => {
        const req = new Request('http://localhost:3000/cadam/api/auth/login', {
          headers: {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'cadam.wileyriley.com',
          },
        });

        const handler = getHandler(LoginRoute, 'GET');
        assert.ok(handler, 'GET handler should be defined');

        const res = await handler({ request: req });
        assert.strictEqual(res.status, 302);

        const location = res.headers.get('Location');
        assert.ok(location);
        assert.ok(location.includes('response_type=code'));
        assert.ok(location.includes('client_id=test-client-id'));

        const setCookies = res.headers.getSetCookie();
        assert.ok(
          setCookies.some((c: string) => c.includes(STATE_COOKIE_NAME)),
          'State cookie should be set',
        );
        assert.ok(
          setCookies.some((c: string) => c.includes(VERIFIER_COOKIE_NAME)),
          'Verifier cookie should be set',
        );
      });
    });

    describe('/api/auth/callback', () => {
      it('rejects callback if state does not match cookie (CSRF protection)', async () => {
        const req = new Request(
          'http://localhost:3000/cadam/api/auth/callback?code=fake-code&state=bad-state',
          {
            headers: {
              Cookie: `${STATE_COOKIE_NAME}=expected-state; ${VERIFIER_COOKIE_NAME}=verifier`,
            },
          },
        );

        const handler = getHandler(CallbackRoute, 'GET');
        assert.ok(handler);

        const res = await handler({ request: req });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.ok(data.error.includes('CSRF'));
      });

      it('redirects with error if provider returns error parameter', async () => {
        const req = new Request(
          'http://localhost:3000/cadam/api/auth/callback?error=access_denied&error_description=user_cancelled',
        );

        const handler = getHandler(CallbackRoute, 'GET');
        const res = await handler({ request: req });
        assert.strictEqual(res.status, 302);
        assert.ok(res.headers.get('Location')?.includes('auth_error=access_denied'));
      });
    });

    describe('/api/auth/me', () => {
      it('returns 401 when no session cookie is provided', async () => {
        const req = new Request('http://localhost:3000/cadam/api/auth/me');
        const handler = getHandler(MeRoute, 'GET');
        assert.ok(handler);

        const res = await handler({ request: req });
        assert.strictEqual(res.status, 401);
        const body = await res.json();
        assert.strictEqual(body.error, 'Unauthorized');
      });

      it('returns user profile when valid session cookie is provided', async () => {
        const token = signSession({
          id: '11111111-2222-3333-4444-555555555555',
          email: 'active@cadam.io',
          display_name: 'Active User',
          avatar_url: 'https://example.com/active.png',
        });

        const req = new Request('http://localhost:3000/cadam/api/auth/me', {
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
        });

        const handler = getHandler(MeRoute, 'GET');
        const res = await handler({ request: req });
        assert.strictEqual(res.status, 200);

        const body = await res.json();
        assert.ok(body.user);
        assert.strictEqual(body.user.email, 'active@cadam.io');
        assert.strictEqual(body.user.display_name, 'Active User');
        assert.strictEqual(body.user.user_metadata.full_name, 'Active User');
      });
    });

    describe('/api/auth/logout', () => {
      it('clears session cookie and redirects to /cadam/', async () => {
        const req = new Request('http://localhost:3000/cadam/api/auth/logout', {
          method: 'GET',
        });
        const handler = getHandler(LogoutRoute, 'GET');
        assert.ok(handler);

        const res = await handler({ request: req });
        assert.strictEqual(res.status, 302);
        assert.strictEqual(res.headers.get('Location'), '/cadam/');

        const setCookie = res.headers.get('Set-Cookie');
        assert.ok(setCookie?.includes(`${SESSION_COOKIE_NAME}=`));
        assert.ok(setCookie?.includes('Max-Age=0'));
      });

      it('returns json success when requested via POST with accept: application/json', async () => {
        const req = new Request('http://localhost:3000/cadam/api/auth/logout', {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        const handler = getHandler(LogoutRoute, 'POST');
        assert.ok(handler);

        const res = await handler({ request: req });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.success, true);
        assert.ok(res.headers.get('Set-Cookie')?.includes('Max-Age=0'));
      });
    });
  });
});
