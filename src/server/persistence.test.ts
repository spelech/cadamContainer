import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';

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
process.env.CADAM_SESSION_SECRET = 'test-cadam-session-secret-key-for-hmac-sha256';

import type { AuthUser } from './auth.ts';

const { query, closePool } = await import('./db.ts');
const { signSession, createSessionCookie } = await import('./auth.ts');

const { Route: ConversationsRoute } = await import('../routes/api/conversations.ts');
const { Route: ConversationIdRoute } = await import('../routes/api/conversations/$id.ts');
const { Route: MessagesRoute } = await import('../routes/api/messages.ts');
const { handleAiChatRequest } = await import('./aiChat.ts');

type RouteHandler = (opts: {
  request: Request;
  params?: Record<string, string>;
}) => Promise<Response>;
function getHandler(
  route: { options: { server?: { handlers?: unknown } } },
  method: string,
): RouteHandler {
  const handlers = route.options.server?.handlers as Record<string, RouteHandler> | undefined;
  return handlers?.[method] as RouteHandler;
}

describe('Persistence API & aiChat Postgres Integration', () => {
  const userA: AuthUser = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'user-a@example.com',
    display_name: 'User A',
  };

  const userB: AuthUser = {
    id: 'b0000000-0000-4000-8000-000000000002',
    email: 'user-b@example.com',
    display_name: 'User B',
  };

  let sessionCookieA: string;
  let sessionCookieB: string;

  before(async () => {
    sessionCookieA = createSessionCookie(signSession(userA));
    sessionCookieB = createSessionCookie(signSession(userB));

    // Ensure profiles exist for foreign key relations
    await query(
      `INSERT INTO profiles (id, email, display_name)
       VALUES ($1, $2, $3), ($4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
      [userA.id, userA.email, userA.display_name, userB.id, userB.email, userB.display_name],
    );
  });

  after(async () => {
    // Cleanup test data
    await query(`DELETE FROM profiles WHERE id IN ($1, $2)`, [userA.id, userB.id]);
    await closePool();
  });

  describe('/api/conversations', () => {
    const listHandler = getHandler(ConversationsRoute, 'GET');
    const createHandler = getHandler(ConversationsRoute, 'POST');

    it('rejects GET when unauthenticated with 401', async () => {
      const req = new Request('http://localhost:3000/cadam/api/conversations');
      const res = await listHandler({ request: req });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Unauthorized');
    });

    it('rejects POST when unauthenticated with 401', async () => {
      const req = new Request('http://localhost:3000/cadam/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthorized Test' }),
      });
      const res = await createHandler({ request: req });
      assert.strictEqual(res.status, 401);
    });

    it('creates a new conversation via POST for authenticated user', async () => {
      const req = new Request('http://localhost:3000/cadam/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          title: 'User A Conversation',
          type: 'parametric',
          privacy: 'private',
          settings: { model: 'claude-sonnet-4.5' },
        }),
      });

      const res = await createHandler({ request: req });
      assert.strictEqual(res.status, 201);
      const conv = await res.json();

      assert.ok(conv.id);
      assert.strictEqual(conv.user_id, userA.id);
      assert.strictEqual(conv.title, 'User A Conversation');
      assert.strictEqual(conv.type, 'parametric');
      assert.strictEqual(conv.privacy, 'private');
      assert.deepStrictEqual(conv.settings, { model: 'claude-sonnet-4.5' });
    });

    it('lists conversations ordered by updated_at DESC and isolated by user', async () => {
      // User A lists conversations
      const reqA = new Request('http://localhost:3000/cadam/api/conversations', {
        headers: { Cookie: sessionCookieA },
      });
      const resA = await listHandler({ request: reqA });
      assert.strictEqual(resA.status, 200);
      const listA = await resA.json();
      assert.ok(Array.isArray(listA));
      assert.ok(listA.length >= 1);
      assert.strictEqual(listA[0].user_id, userA.id);

      // User B lists conversations (should be empty initially for User B)
      const reqB = new Request('http://localhost:3000/cadam/api/conversations', {
        headers: { Cookie: sessionCookieB },
      });
      const resB = await listHandler({ request: reqB });
      assert.strictEqual(resB.status, 200);
      const listB = await resB.json();
      assert.strictEqual(listB.length, 0);
    });
  });

  describe('/api/conversations/$id', () => {
    const getByIdHandler = getHandler(ConversationIdRoute, 'GET');
    const patchHandler = getHandler(ConversationIdRoute, 'PATCH');
    const putHandler = getHandler(ConversationIdRoute, 'PUT');
    const deleteHandler = getHandler(ConversationIdRoute, 'DELETE');

    let testConvId: string;

    before(async () => {
      // Seed a conversation for user A
      const insert = await query<{ id: string }>(
        `INSERT INTO conversations (user_id, title, type, privacy, settings)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userA.id, 'Original Title', 'parametric', 'private', JSON.stringify({ key: 'val' })],
      );
      testConvId = insert.rows[0].id;
    });

    it('rejects GET for invalid UUID with 400', async () => {
      const req = new Request('http://localhost:3000/cadam/api/conversations/not-a-uuid', {
        headers: { Cookie: sessionCookieA },
      });
      const res = await getByIdHandler({ request: req, params: { id: 'not-a-uuid' } });
      assert.strictEqual(res.status, 400);
    });

    it('returns conversation for owner', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        headers: { Cookie: sessionCookieA },
      });
      const res = await getByIdHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 200);
      const conv = await res.json();
      assert.strictEqual(conv.id, testConvId);
      assert.strictEqual(conv.title, 'Original Title');
    });

    it('returns 404 when another user tries to fetch a private conversation', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        headers: { Cookie: sessionCookieB },
      });
      const res = await getByIdHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 404);
    });

    it('updates conversation fields via PATCH', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          title: 'Patched Title',
          privacy: 'public',
          settings: { theme: 'dark' },
        }),
      });

      const res = await patchHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 200);
      const updated = await res.json();
      assert.strictEqual(updated.title, 'Patched Title');
      assert.strictEqual(updated.privacy, 'public');
      assert.deepStrictEqual(updated.settings, { theme: 'dark' });
    });

    it('updates conversation fields via PUT', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          title: 'PUT Updated Title',
        }),
      });

      const res = await putHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 200);
      const updated = await res.json();
      assert.strictEqual(updated.title, 'PUT Updated Title');
    });

    it('allows another user to read conversation when public', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        headers: { Cookie: sessionCookieB },
      });
      const res = await getByIdHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 200);
      const conv = await res.json();
      assert.strictEqual(conv.id, testConvId);
    });

    it('rejects update by non-owner with 404', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieB,
        },
        body: JSON.stringify({ title: 'Hacked Title' }),
      });

      const res = await patchHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 404);
    });

    it('deletes conversation via DELETE for owner', async () => {
      const req = new Request(`http://localhost:3000/cadam/api/conversations/${testConvId}`, {
        method: 'DELETE',
        headers: { Cookie: sessionCookieA },
      });

      const res = await deleteHandler({ request: req, params: { id: testConvId } });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);

      // Verify it is gone
      const check = await query(`SELECT id FROM conversations WHERE id = $1`, [testConvId]);
      assert.strictEqual(check.rows.length, 0);
    });
  });

  describe('/api/messages', () => {
    const getMessagesHandler = getHandler(MessagesRoute, 'GET');
    const postMessageHandler = getHandler(MessagesRoute, 'POST');
    const patchMessageHandler = getHandler(MessagesRoute, 'PATCH');
    const deleteMessageHandler = getHandler(MessagesRoute, 'DELETE');

    let convId: string;
    let messageId1: string;

    before(async () => {
      const insert = await query<{ id: string }>(
        `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [userA.id, 'Messages Test Conv'],
      );
      convId = insert.rows[0].id;
    });

    it('rejects GET when missing conversationId query parameter with 400', async () => {
      const req = new Request('http://localhost:3000/cadam/api/messages', {
        headers: { Cookie: sessionCookieA },
      });
      const res = await getMessagesHandler({ request: req });
      assert.strictEqual(res.status, 400);
    });

    it('rejects GET for unauthorized user on private conversation with 403', async () => {
      const req = new Request(
        `http://localhost:3000/cadam/api/messages?conversationId=${convId}`,
        { headers: { Cookie: sessionCookieB } },
      );
      const res = await getMessagesHandler({ request: req });
      assert.strictEqual(res.status, 403);
    });

    it('appends a message via POST and automatically updates current_message_leaf_id', async () => {
      const req = new Request('http://localhost:3000/cadam/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          conversation_id: convId,
          role: 'user',
          parts: [{ type: 'text', text: 'Hello Adam CAD' }],
          metadata: { client: 'web' },
        }),
      });

      const res = await postMessageHandler({ request: req });
      assert.strictEqual(res.status, 201);
      const msg = await res.json();

      assert.ok(msg.id);
      messageId1 = msg.id;
      assert.strictEqual(msg.conversation_id, convId);
      assert.strictEqual(msg.role, 'user');
      assert.deepStrictEqual(msg.parts, [{ type: 'text', text: 'Hello Adam CAD' }]);

      // Verify trigger updated conversations.current_message_leaf_id
      const convRes = await query<{ current_message_leaf_id: string }>(
        `SELECT current_message_leaf_id FROM conversations WHERE id = $1`,
        [convId],
      );
      assert.strictEqual(convRes.rows[0].current_message_leaf_id, messageId1);
    });

    it('fetches messages for conversation ordered by created_at ASC', async () => {
      // Append second message
      const req2 = new Request('http://localhost:3000/cadam/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          conversation_id: convId,
          role: 'assistant',
          parent_message_id: messageId1,
          parts: [{ type: 'text', text: 'Hello! I can build that.' }],
        }),
      });
      const res2 = await postMessageHandler({ request: req2 });
      assert.strictEqual(res2.status, 201);
      const msg2 = await res2.json();

      // Fetch all messages
      const getReq = new Request(
        `http://localhost:3000/cadam/api/messages?conversationId=${convId}`,
        { headers: { Cookie: sessionCookieA } },
      );
      const getRes = await getMessagesHandler({ request: getReq });
      assert.strictEqual(getRes.status, 200);
      const list = await getRes.json();

      assert.strictEqual(list.length, 2);
      assert.strictEqual(list[0].id, messageId1);
      assert.strictEqual(list[1].id, msg2.id);
      assert.strictEqual(list[1].parent_message_id, messageId1);
    });

    it('updates message parts, metadata, or rating via PATCH', async () => {
      const req = new Request(
        `http://localhost:3000/cadam/api/messages?id=${messageId1}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookieA,
          },
          body: JSON.stringify({
            rating: 1,
            metadata: { client: 'web', edited: true },
          }),
        },
      );

      const res = await patchMessageHandler({ request: req });
      assert.strictEqual(res.status, 200);
      const updated = await res.json();
      assert.strictEqual(updated.rating, 1);
      assert.deepStrictEqual(updated.metadata, { client: 'web', edited: true });
    });

    it('rejects PATCH for message not belonging to user', async () => {
      const req = new Request(
        `http://localhost:3000/cadam/api/messages?id=${messageId1}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookieB,
          },
          body: JSON.stringify({ rating: -1 }),
        },
      );

      const res = await patchMessageHandler({ request: req });
      assert.strictEqual(res.status, 404);
    });

    it('deletes message via DELETE', async () => {
      const req = new Request(
        `http://localhost:3000/cadam/api/messages?id=${messageId1}`,
        {
          method: 'DELETE',
          headers: { Cookie: sessionCookieA },
        },
      );

      const res = await deleteMessageHandler({ request: req });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });
  });

  describe('aiChat.ts Integration', () => {
    it('returns CORS headers on OPTIONS', async () => {
      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'OPTIONS',
      });
      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    });

    it('returns 405 on non-POST requests', async () => {
      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'GET',
      });
      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 405);
    });

    it('returns 401 when unauthenticated', async () => {
      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'some-id', model: 'claude-sonnet-4.5' }),
      });
      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 401);
    });

    it('returns 400 for invalid request body', async () => {
      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({ invalid: true }),
      });
      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 400);
    });

    it('returns 404 when conversation not found or belongs to another user', async () => {
      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieB,
        },
        body: JSON.stringify({
          conversationId: '00000000-0000-0000-0000-000000000000',
          model: 'claude-sonnet-4.5',
        }),
      });
      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 404);
    });

    it('returns 400 when conversation has no leaf message', async () => {
      // Create conversation with no leaf
      const insert = await query<{ id: string }>(
        `INSERT INTO conversations (user_id, title, current_message_leaf_id)
         VALUES ($1, 'Leaf Test', NULL)
         RETURNING id`,
        [userA.id],
      );
      const convId = insert.rows[0].id;

      const req = new Request('http://localhost:3000/cadam/api/parametric-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookieA,
        },
        body: JSON.stringify({
          conversationId: convId,
          model: 'claude-sonnet-4.5',
        }),
      });

      const res = await handleAiChatRequest(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, 'Conversation has no leaf to generate from');
    });
  });
});
