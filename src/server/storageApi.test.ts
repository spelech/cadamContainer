import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execSync } from 'node:child_process';

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
    // fallback
  }
  return 'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';
}

process.env.DATABASE_URL = resolveDatabaseUrl();

const { query, closePool, initDatabase } = await import('./db');
const { signSession } = await import('./auth');
const { Route } = await import('../routes/api/storage/$');

type RouteHandler = (args: { request: Request }) => Promise<Response>;

function getHandler(
  route: { options: { server?: { handlers?: unknown } } },
  method: string,
): RouteHandler {
  const handlers = route.options.server?.handlers as
    | Record<string, RouteHandler>
    | undefined;
  return handlers?.[method] as RouteHandler;
}

describe('Storage API Route (src/routes/api/storage/$.ts)', () => {
  let sessionCookie: string;
  const testUserId = '11111111-2222-3333-4444-555555555555';

  before(async () => {
    await initDatabase();
    await query('DELETE FROM storage_objects WHERE bucket = $1', ['test-api-bucket']);
    await query('DELETE FROM profiles WHERE id = $1', [testUserId]);

    await query(
      `INSERT INTO profiles (id, email, display_name)
       VALUES ($1, $2, $3)`,
      [testUserId, 'storage-tester@example.com', 'Storage Tester'],
    );

    const token = signSession({
      id: testUserId,
      email: 'storage-tester@example.com',
      display_name: 'Storage Tester',
    });
    sessionCookie = `cadam_session=${token}`;
  });

  after(async () => {
    await query('DELETE FROM storage_objects WHERE bucket = $1', ['test-api-bucket']);
    await query('DELETE FROM profiles WHERE id = $1', [testUserId]);
    await closePool();
  });

  it('rejects POST when unauthenticated with 401', async () => {
    const req = new Request('http://localhost:3000/api/storage/test-api-bucket/test.png', {
      method: 'POST',
      body: Buffer.from('fake image bytes'),
      headers: { 'Content-Type': 'image/png' },
    });

    const handler = getHandler(Route, 'POST');
    assert.ok(handler, 'POST handler should exist');
    const res = await handler({ request: req });
    assert.strictEqual(res.status, 401);
  });

  it('allows authenticated POST to upload object', async () => {
    const rawData = Buffer.from('sample png image data');
    const req = new Request('http://localhost:3000/api/storage/test-api-bucket/folder/test.png', {
      method: 'POST',
      body: rawData,
      headers: {
        'Content-Type': 'image/png',
        Cookie: sessionCookie,
      },
    });

    const handler = getHandler(Route, 'POST');
    assert.ok(handler, 'POST handler should exist');
    const res = await handler({ request: req });
    assert.strictEqual(res.status, 200);

    const json = (await res.json()) as { key: string };
    assert.strictEqual(json.key, 'folder/test.png');
  });

  it('allows GET to download public or uploaded object', async () => {
    const req = new Request('http://localhost:3000/api/storage/test-api-bucket/folder/test.png', {
      method: 'GET',
    });

    const handler = getHandler(Route, 'GET');
    assert.ok(handler, 'GET handler should exist');
    const res = await handler({ request: req });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Content-Type'), 'image/png');

    const bytes = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(bytes.toString('utf-8'), 'sample png image data');
  });

  it('returns 404 for nonexistent object on GET', async () => {
    const req = new Request('http://localhost:3000/api/storage/test-api-bucket/missing.png', {
      method: 'GET',
    });

    const handler = getHandler(Route, 'GET');
    assert.ok(handler, 'GET handler should exist');
    const res = await handler({ request: req });
    assert.strictEqual(res.status, 404);
  });

  it('deletes object on authenticated DELETE', async () => {
    const req = new Request('http://localhost:3000/api/storage/test-api-bucket/folder/test.png', {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });

    const handler = getHandler(Route, 'DELETE');
    assert.ok(handler, 'DELETE handler should exist');
    const res = await handler({ request: req });
    assert.strictEqual(res.status, 200);

    const getReq = new Request('http://localhost:3000/api/storage/test-api-bucket/folder/test.png', {
      method: 'GET',
    });
    const getHandlerFn = getHandler(Route, 'GET');
    const getRes = await getHandlerFn({ request: getReq });
    assert.strictEqual(getRes.status, 404);
  });
});
