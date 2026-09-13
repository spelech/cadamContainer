import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  accountUrl,
  getBasePath,
  isSupabaseConfigMissing,
  ssoClaims,
  ssoManaged,
  ssoProvider,
  supabase,
  _clearAuthListenersForTesting,
  _setCachedUserForTesting,
} from './supabase';
import {
  getAnonSupabaseClient,
  getServiceRoleSupabaseClient,
} from '../server/supabaseClient';

describe('Supabase Client-Side Adapter Shim (src/lib/supabase.ts)', () => {
  const originalFetch = globalThis.fetch;
  let interceptedRequests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    credentials?: RequestCredentials;
  }> = [];

  beforeEach(() => {
    interceptedRequests = [];
    _setCachedUserForTesting(null);
    _clearAuthListenersForTesting();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _setCachedUserForTesting(null);
    _clearAuthListenersForTesting();
  });

  function mockFetch(handler: (req: Request) => Promise<Response> | Response) {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      const headers: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) {
            headers[k] = v;
          }
        } else {
          Object.assign(headers, init.headers);
        }
      }

      let parsedBody: any = undefined;
      if (init?.body && typeof init.body === 'string') {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }

      interceptedRequests.push({
        url,
        method,
        headers,
        body: parsedBody,
        credentials: init?.credentials,
      });

      const fullUrl = url.startsWith('/') ? `http://localhost${url}` : url;
      const request = new Request(fullUrl, init);
      return handler(request);
    }) as typeof globalThis.fetch;
  }

  describe('Configuration and SSO Flags', () => {
    it('evaluates isSupabaseConfigMissing to false', () => {
      assert.strictEqual(isSupabaseConfigMissing, false);
    });

    it('exports ssoProvider as pocketid', () => {
      assert.strictEqual(ssoProvider, 'pocketid');
    });

    it('exports accountUrl and ssoManaged consistently', () => {
      assert.strictEqual(typeof accountUrl, 'string');
      assert.strictEqual(typeof ssoManaged, 'boolean');
    });

    it('extracts ssoClaims from user metadata or returns undefined', () => {
      assert.strictEqual(ssoClaims(null), undefined);
      assert.strictEqual(ssoClaims(undefined), undefined);

      const userWithFullName = {
        id: 'user-1',
        email: 'user1@example.com',
        user_metadata: {
          full_name: 'Alice Example',
          avatar_url: 'https://example.com/alice.png',
        },
      } as any;

      const claims1 = ssoClaims(userWithFullName);
      assert.deepStrictEqual(claims1, {
        name: 'Alice Example',
        avatar_url: 'https://example.com/alice.png',
        picture: 'https://example.com/alice.png',
      });

      const userWithName = {
        id: 'user-2',
        email: 'user2@example.com',
        user_metadata: {
          name: 'Bob Example',
        },
      } as any;

      const claims2 = ssoClaims(userWithName);
      assert.strictEqual(claims2?.name, 'Bob Example');
      assert.strictEqual(claims2?.avatar_url, undefined);

      const userEmailFallback = {
        id: 'user-3',
        email: 'charlie@example.com',
        user_metadata: {},
      } as any;

      const claims3 = ssoClaims(userEmailFallback);
      assert.strictEqual(claims3?.name, 'charlie@example.com');
    });

    it('computes basePath correctly', () => {
      const base = getBasePath();
      assert.ok(typeof base === 'string');
    });
  });

  describe('supabase.auth implementation', () => {
    it('getUser() returns user when /api/auth/me returns 200', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/auth/me'));
        assert.strictEqual(req.credentials, 'include');
        return Response.json({
          user: {
            id: '12345678-1234-1234-1234-123456789abc',
            email: 'test@example.com',
            display_name: 'Test User',
            avatar_url: null,
            user_metadata: {
              full_name: 'Test User',
              avatar_url: null,
            },
          },
        });
      });

      const { data, error } = await supabase.auth.getUser();
      assert.strictEqual(error, null);
      assert.ok(data.user);
      assert.strictEqual(data.user.email, 'test@example.com');
      assert.strictEqual(data.user.id, '12345678-1234-1234-1234-123456789abc');
    });

    it('getUser() returns null and error when /api/auth/me returns 401', async () => {
      mockFetch(async () => {
        return Response.json({ error: 'Unauthorized', user: null }, { status: 401 });
      });

      const { data, error } = await supabase.auth.getUser();
      assert.strictEqual(data.user, null);
      assert.ok(error instanceof Error);
    });

    it('getSession() and refreshSession() return session when user is authenticated', async () => {
      mockFetch(async () => {
        return Response.json({
          user: {
            id: '12345678-1234-1234-1234-123456789abc',
            email: 'session-test@example.com',
            user_metadata: { full_name: 'Session User' },
          },
        });
      });

      const refreshResult = await supabase.auth.refreshSession();
      assert.strictEqual(refreshResult.error, null);
      assert.ok(refreshResult.data.session);
      assert.strictEqual(
        refreshResult.data.session.user.email,
        'session-test@example.com',
      );
      assert.strictEqual(
        refreshResult.data.session.access_token,
        'local-session',
      );

      const sessionResult = await supabase.auth.getSession();
      assert.strictEqual(sessionResult.error, null);
      assert.ok(sessionResult.data.session);
      assert.strictEqual(
        sessionResult.data.session.user.id,
        '12345678-1234-1234-1234-123456789abc',
      );
    });

    it('signInWithOAuth returns auth login URL with redirect parameter', async () => {
      const result = await supabase.auth.signInWithOAuth({
        provider: ssoProvider as any,
        options: {
          redirectTo: '/editor/1234',
        },
      });

      assert.strictEqual(result.error, null);
      assert.strictEqual(result.data.provider, 'pocketid');
      assert.ok(result.data.url.includes('/api/auth/login?redirect='));
      assert.ok(result.data.url.includes(encodeURIComponent('/editor/1234')));
    });

    it('signOut() sends POST to /api/auth/logout and clears user', async () => {
      _setCachedUserForTesting({ id: 'active-user', email: 'a@example.com' } as any);

      let logoutCalled = false;
      mockFetch(async (req) => {
        if (req.url.endsWith('/api/auth/logout')) {
          logoutCalled = true;
          assert.strictEqual(req.method, 'POST');
          assert.strictEqual(req.credentials, 'include');
          return Response.json({ success: true });
        }
        return Response.json({ error: 'not found' }, { status: 404 });
      });

      let authChangeFired = false;
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' && session === null) {
          authChangeFired = true;
        }
      });

      const result = await supabase.auth.signOut();
      assert.strictEqual(result.error, null);
      assert.strictEqual(logoutCalled, true);
      assert.strictEqual(authChangeFired, true);

      // Subsequent getSession should be null
      mockFetch(async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
      const { data } = await supabase.auth.getSession();
      assert.strictEqual(data.session, null);
    });

    it('onAuthStateChange unsubscribes correctly', async () => {
      let callCount = 0;
      const { data } = supabase.auth.onAuthStateChange(() => {
        callCount++;
      });

      // Wait a tick for initial event
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(callCount, 1);

      data.subscription.unsubscribe();

      // Trigger sign out which would notify listeners
      await supabase.auth.signOut();
      assert.strictEqual(callCount, 1); // should not have incremented
    });

    it('safe stubs for password and otp methods invoke signInWithOAuth or return error', async () => {
      const pwRes = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'secret',
      });
      assert.strictEqual(pwRes.error, null);

      const otpRes = await supabase.auth.verifyOtp({
        email: 'test@example.com',
        token: '123456',
        type: 'email',
      });
      assert.ok(otpRes.error instanceof Error);
    });
  });

  describe('supabase.from("conversations") Query Builder', () => {
    it('lists conversations via .select()', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/conversations'));
        assert.strictEqual(req.method, 'GET');
        assert.strictEqual(req.credentials, 'include');
        return Response.json([
          {
            id: 'conv-1',
            title: 'First Chat',
            type: 'parametric',
            created_at: '2026-09-13T00:00:00.000Z',
            updated_at: '2026-09-13T01:00:00.000Z',
          },
          {
            id: 'conv-2',
            title: 'Second Chat',
            type: 'creative',
            created_at: '2026-09-13T02:00:00.000Z',
            updated_at: '2026-09-13T02:30:00.000Z',
          },
        ]);
      });

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(10);

      assert.strictEqual(error, null);
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 2);
      assert.strictEqual(data[0].id, 'conv-2'); // ordered descending
      assert.deepStrictEqual((data[0] as any).first_message, []);
      assert.deepStrictEqual((data[0] as any).messagesCount, [{ count: 0 }]);
    });

    it('fetches single conversation via .select().eq("id", ...).single()', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/conversations/conv-xyz'));
        assert.strictEqual(req.method, 'GET');
        return Response.json({
          id: 'conv-xyz',
          title: 'Target Conversation',
          type: 'parametric',
        });
      });

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', 'conv-xyz')
        .single()
        .overrideTypes<{ id: string; title: string }>();

      assert.strictEqual(error, null);
      assert.strictEqual(data?.id, 'conv-xyz');
      assert.strictEqual(data?.title, 'Target Conversation');
    });

    it('creates a conversation via .insert().select().single()', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/conversations'));
        assert.strictEqual(req.method, 'POST');
        const body = await req.json();
        assert.strictEqual(body.title, 'Brand New');
        return Response.json(
          {
            id: 'new-id',
            title: body.title,
            type: body.type,
          },
          { status: 201 },
        );
      });

      const { data, error } = await supabase
        .from('conversations')
        .insert([
          {
            user_id: 'user-1',
            title: 'Brand New',
            type: 'parametric',
          },
        ])
        .select()
        .single();

      assert.strictEqual(error, null);
      assert.strictEqual(data.id, 'new-id');
      assert.strictEqual(data.title, 'Brand New');
    });

    it('updates a conversation via .update().eq("id", ...)', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/conversations/conv-update-1'));
        assert.strictEqual(req.method, 'PATCH');
        const body = await req.json();
        assert.strictEqual(body.title, 'Renamed Title');
        return Response.json({
          id: 'conv-update-1',
          title: body.title,
        });
      });

      const { data, error } = await supabase
        .from('conversations')
        .update({ title: 'Renamed Title' })
        .eq('id', 'conv-update-1')
        .select()
        .single();

      assert.strictEqual(error, null);
      assert.strictEqual(data.title, 'Renamed Title');
    });

    it('deletes a conversation via .delete().eq("id", ...)', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/conversations/conv-delete-1'));
        assert.strictEqual(req.method, 'DELETE');
        return Response.json({ success: true, id: 'conv-delete-1' });
      });

      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', 'conv-delete-1');

      assert.strictEqual(error, null);
    });
  });

  describe('supabase.from("messages") Query Builder', () => {
    it('fetches messages for conversation via .select().eq("conversation_id", ...)', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.includes('/api/messages?conversationId=conv-test-1'));
        assert.strictEqual(req.method, 'GET');
        return Response.json([
          {
            id: 'm1',
            conversation_id: 'conv-test-1',
            role: 'user',
            content: {},
            created_at: '2026-09-13T00:00:00Z',
          },
          {
            id: 'm2',
            conversation_id: 'conv-test-1',
            role: 'assistant',
            content: {},
            created_at: '2026-09-13T00:00:05Z',
          },
        ]);
      });

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', 'conv-test-1')
        .order('created_at', { ascending: true })
        .overrideTypes<any[]>();

      assert.strictEqual(error, null);
      assert.strictEqual(data?.length, 2);
      assert.strictEqual(data?.[0].id, 'm1');
      assert.strictEqual(data?.[1].id, 'm2');
    });

    it('inserts a message via .insert()', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/messages'));
        assert.strictEqual(req.method, 'POST');
        const body = await req.json();
        assert.strictEqual(body.role, 'user');
        assert.strictEqual(body.conversation_id, 'conv-test-1');
        return Response.json(
          {
            id: 'msg-created-1',
            ...body,
          },
          { status: 201 },
        );
      });

      const { error } = await supabase.from('messages').insert({
        id: 'msg-created-1',
        conversation_id: 'conv-test-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: {},
        parent_message_id: null,
      });

      assert.strictEqual(error, null);
    });

    it('updates message parts and returns array when chaining .select("id")', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.includes('/api/messages?id=msg-target-1'));
        assert.strictEqual(req.method, 'PATCH');
        const body = await req.json();
        return Response.json({
          id: 'msg-target-1',
          parts: body.parts,
        });
      });

      const { data, error } = await supabase
        .from('messages')
        .update({ parts: [{ type: 'text', text: 'Updated' }] })
        .eq('id', 'msg-target-1')
        .eq('conversation_id', 'conv-1')
        .select('id');

      assert.strictEqual(error, null);
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 1);
      assert.strictEqual(data[0].id, 'msg-target-1');
    });

    it('deletes message via .delete().eq("id", ...)', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.includes('/api/messages?id=msg-del-1'));
        assert.strictEqual(req.method, 'DELETE');
        return Response.json({ success: true, id: 'msg-del-1' });
      });

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', 'msg-del-1');

      assert.strictEqual(error, null);
    });
  });

  describe('supabase.from("profiles") Query Builder', () => {
    it('fetches profile from /api/auth/me', async () => {
      mockFetch(async (req) => {
        assert.ok(req.url.endsWith('/api/auth/me'));
        return Response.json({
          user: {
            id: 'profile-user-id',
            email: 'profile@example.com',
            display_name: 'Profile User',
            avatar_url: 'https://example.com/pic.jpg',
            user_metadata: {
              full_name: 'Profile User',
              avatar_url: 'https://example.com/pic.jpg',
            },
          },
        });
      });

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', 'profile-user-id')
        .single();

      assert.strictEqual(error, null);
      assert.strictEqual(data?.user_id, 'profile-user-id');
      assert.strictEqual(data?.full_name, 'Profile User');
      assert.strictEqual(data?.avatar_path, 'https://example.com/pic.jpg');
    });
  });

  describe('Dummy channels and storage mocks', () => {
    it('channel creates a working chain and subscribe/send mock', async () => {
      const ch = supabase.channel('mesh-updates-user-1');
      assert.ok(ch);

      let subscribed = false;
      ch.on('broadcast', { event: 'mesh-updated' }, () => {})
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') subscribed = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(subscribed, true);

      const sendResult = await ch.send({
        type: 'broadcast',
        event: 'test',
        payload: 'data',
      });
      assert.strictEqual(sendResult, 'ok');

      const removeResult = supabase.removeChannel(ch);
      assert.strictEqual(removeResult, 'ok');
    });

    it('storage operations resolve safely', async () => {
      const storage = supabase.storage.from('images');
      const uploadRes = await storage.upload('test/path.png', new Blob([]));
      assert.strictEqual(uploadRes.error, null);
      assert.strictEqual(uploadRes.data?.path, 'test/path.png');

      const downloadRes = await storage.download('test/path.png');
      assert.strictEqual(downloadRes.error, null);
      assert.ok(downloadRes.data instanceof Blob);

      const listRes = await storage.list('folder');
      assert.strictEqual(listRes.error, null);
      assert.deepStrictEqual(listRes.data, []);

      const removeRes = await storage.remove(['file1.png']);
      assert.strictEqual(removeRes.error, null);
      assert.deepStrictEqual(removeRes.data, []);

      const publicUrlRes = storage.getPublicUrl('path.png');
      assert.ok(publicUrlRes.data.publicUrl.includes('/api/storage/images/path.png'));
    });

    it('safely handles non-persisted client tables (images, meshes)', async () => {
      const imgRes = await supabase
        .from('images')
        .upsert({ id: 'img-1', conversation_id: 'c-1', user_id: 'u-1' });
      assert.strictEqual(imgRes.error, null);

      const meshRes = await supabase
        .from('meshes')
        .upsert({ id: 'mesh-1', conversation_id: 'c-1', user_id: 'u-1' });
      assert.strictEqual(meshRes.error, null);
    });
  });

  describe('Server supabaseClient fallbacks (src/server/supabaseClient.ts)', () => {
    it('instantiates anon and service role clients without throwing when env vars missing', () => {
      const originalUrl = process.env.VITE_SUPABASE_URL;
      const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        delete process.env.VITE_SUPABASE_URL;
        delete process.env.VITE_SUPABASE_ANON_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        const anonClient = getAnonSupabaseClient();
        assert.ok(anonClient);

        const serviceClient = getServiceRoleSupabaseClient();
        assert.ok(serviceClient);
      } finally {
        if (originalUrl) process.env.VITE_SUPABASE_URL = originalUrl;
        if (originalKey) process.env.VITE_SUPABASE_ANON_KEY = originalKey;
        if (originalServiceKey)
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      }
    });
  });
});
