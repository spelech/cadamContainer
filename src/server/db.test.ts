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

// Dynamic import after setting DATABASE_URL
const {
  query,
  getPool,
  initDatabase,
  closePool,
  getConnectionString,
  DEFAULT_DATABASE_URL,
} = await import('./db.ts');

describe('Database Module (src/server/db.ts)', () => {
  after(async () => {
    await closePool();
  });

  describe('Configuration and Pool', () => {
    it('returns the configured connection string', () => {
      const url = getConnectionString();
      assert.ok(url.startsWith('postgres://'));
      assert.ok(url.includes('cadam'));
      assert.ok(DEFAULT_DATABASE_URL.startsWith('postgres://'));
    });

    it('returns a singleton pool instance', () => {
      const pool1 = getPool();
      const pool2 = getPool();
      assert.strictEqual(pool1, pool2);
    });
  });

  describe('Schema Initialization & Auto-Migration', () => {
    it('executes initDatabase without error and is idempotent', async () => {
      await initDatabase();
      // Run second time to verify idempotency
      await initDatabase();
    });

    it('verifies profiles, conversations, and messages tables exist', async () => {
      const res = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
           AND table_name IN ('profiles', 'conversations', 'messages')
         ORDER BY table_name;`,
      );
      const tableNames = res.rows.map((r) => r.table_name);
      assert.deepStrictEqual(tableNames, ['conversations', 'messages', 'profiles']);
    });
  });

  describe('Table Schema and Triggers', () => {
    const testEmail = `test_runner_${Date.now()}@example.com`;
    let profileId: string;
    let conversationId: string;

    before(async () => {
      // Clean up any stale records
      await query(`DELETE FROM profiles WHERE email LIKE 'test_runner_%'`);
    });

    after(async () => {
      if (profileId) {
        await query(`DELETE FROM profiles WHERE id = $1`, [profileId]);
      }
    });

    it('inserts profile and synchronizes display_name/full_name and user_id', async () => {
      const res = await query(
        `INSERT INTO profiles (email, display_name, avatar_url)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, email, display_name, full_name, avatar_url, avatar_path`,
        [testEmail, 'Test Runner', 'https://example.com/avatar.png'],
      );

      assert.strictEqual(res.rowCount, 1);
      const row = res.rows[0];
      profileId = row.id;

      assert.strictEqual(row.email, testEmail);
      assert.strictEqual(row.display_name, 'Test Runner');
      assert.strictEqual(row.full_name, 'Test Runner');
      assert.strictEqual(row.avatar_url, 'https://example.com/avatar.png');
      assert.strictEqual(row.avatar_path, 'https://example.com/avatar.png');
      assert.strictEqual(row.user_id, row.id);
    });

    it('creates a conversation linked to the profile', async () => {
      const res = await query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id, user_id, title, current_message_leaf_id, settings`,
        [profileId, 'Unit Test Conversation'],
      );

      assert.strictEqual(res.rowCount, 1);
      const row = res.rows[0];
      conversationId = row.id;

      assert.strictEqual(row.user_id, profileId);
      assert.strictEqual(row.title, 'Unit Test Conversation');
      assert.strictEqual(row.current_message_leaf_id, null);
      assert.deepStrictEqual(row.settings, {});
    });

    it('inserts a message and updates conversations.current_message_leaf_id via trigger', async () => {
      const messageParts = [{ type: 'text', text: 'Create a 20mm test cube' }];
      const res = await query(
        `INSERT INTO messages (conversation_id, user_id, role, parts, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, conversation_id, role, parent_id, parent_message_id, parts`,
        [
          conversationId,
          profileId,
          'user',
          JSON.stringify(messageParts),
          JSON.stringify({ text: 'Create a 20mm test cube' }),
        ],
      );

      assert.strictEqual(res.rowCount, 1);
      const messageId = res.rows[0].id;

      // Verify conversation leaf was updated automatically
      const convRes = await query(
        `SELECT current_message_leaf_id FROM conversations WHERE id = $1`,
        [conversationId],
      );
      assert.strictEqual(convRes.rows[0].current_message_leaf_id, messageId);
    });

    it('updates conversation suggestions via set_conversation_suggestions()', async () => {
      const suggestions = ['add filleted edges', 'export to STL'];
      await query(
        `SELECT set_conversation_suggestions($1, $2::jsonb)`,
        [conversationId, JSON.stringify(suggestions)],
      );

      const convRes = await query(
        `SELECT settings FROM conversations WHERE id = $1`,
        [conversationId],
      );
      assert.deepStrictEqual(convRes.rows[0].settings, { suggestions });
    });

    it('cascades deletion from profile to conversations and messages', async () => {
      await query(`DELETE FROM profiles WHERE id = $1`, [profileId]);

      const convRes = await query(
        `SELECT COUNT(*) FROM conversations WHERE id = $1`,
        [conversationId],
      );
      assert.strictEqual(Number(convRes.rows[0].count), 0);

      const msgRes = await query(
        `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`,
        [conversationId],
      );
      assert.strictEqual(Number(msgRes.rows[0].count), 0);

      profileId = '';
    });
  });
});
