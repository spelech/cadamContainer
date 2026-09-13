import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.CADAM_SESSION_SECRET = 'test-cadam-session-secret-key-for-hmac-sha256';

const { signSession, createSessionCookie } = await import('./auth.ts');
const { requireUser, isUnauthorizedError } = await import('./api.ts');
const { billing } = await import('./billingClient.ts');
const { Route: BillingStatusRoute } = await import('../routes/api/billing-status.ts');

type RouteHandler = (opts: { request: Request }) => Promise<Response>;
function getHandler(
  route: { options: { server?: { handlers?: unknown } } },
  method: string,
): RouteHandler {
  const handlers = route.options.server?.handlers as
    | Record<string, RouteHandler>
    | undefined;
  if (!handlers || !handlers[method]) {
    throw new Error(`Handler for ${method} not found on route`);
  }
  return handlers[method];
}

describe('Billing and Local Auth (requireUser & billingClient)', () => {
  const testUser = {
    id: 'c8088921-6d7c-4ef7-b9c1-841c2c3132e0',
    email: 'cadam_user@example.com',
    display_name: 'CADAM User',
  };

  describe('requireUser in src/server/api.ts', () => {
    it('throws Unauthorized error if no cookie or authorization header is present', async () => {
      const request = new Request('http://localhost/api/test');
      await assert.rejects(
        () => requireUser(request),
        (err: unknown) => {
          assert.ok(isUnauthorizedError(err));
          return true;
        },
      );
    });

    it('returns AuthUser when a valid session cookie is provided', async () => {
      const token = signSession(testUser);
      const cookie = createSessionCookie(token);
      const request = new Request('http://localhost/api/test', {
        headers: { Cookie: cookie },
      });

      const user = await requireUser(request);
      assert.equal(user.id, testUser.id);
      assert.equal(user.email, testUser.email);
    });

    it('returns AuthUser when a valid Bearer token is provided', async () => {
      const token = signSession(testUser);
      const request = new Request('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const user = await requireUser(request);
      assert.equal(user.id, testUser.id);
      assert.equal(user.email, testUser.email);
    });
  });

  describe('billingClient.ts', () => {
    it('billing.getStatus returns max tier and 999,999,999 tokens', async () => {
      const status = await billing.getStatus('test@example.com');
      assert.deepEqual(status, {
        subscription: {
          level: 'max',
          status: 'active',
          currentPeriodEnd: null,
        },
        tokens: {
          free: 999999999,
          subscription: 999999999,
          purchased: 999999999,
          total: 999999999,
        },
        user: {
          hasTrialed: true,
        },
      });
    });

    it('billing.consume resolves with a successful no-op result', async () => {
      const result = await billing.consume('test@example.com', { tokens: 100 });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.totalBalance, 999999999);
      }
    });
  });

  describe('GET /api/billing-status route handler', () => {
    const getBillingStatus = getHandler(BillingStatusRoute, 'GET');

    it('returns 401 when unauthenticated', async () => {
      const request = new Request('http://localhost/api/billing-status');
      const response = await getBillingStatus({ request });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, 'Unauthorized');
    });

    it('returns 200 and max tier billing status when authenticated', async () => {
      const token = signSession(testUser);
      const cookie = createSessionCookie(token);
      const request = new Request('http://localhost/api/billing-status', {
        headers: { Cookie: cookie },
      });

      const response = await getBillingStatus({ request });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.subscription?.level, 'max');
      assert.equal(body.tokens?.total, 999999999);
      assert.equal(body.user?.hasTrialed, true);
    });
  });
});
