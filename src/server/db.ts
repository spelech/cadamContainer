import pg, { type QueryResult, type QueryResultRow } from 'pg';

const { Pool } = pg;

export const DEFAULT_DATABASE_URL =
  'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';

export function getConnectionString(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

let pool: pg.Pool | null = null;

/**
 * Returns the singleton PostgreSQL connection pool.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = getConnectionString();
    pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err: Error) => {
      console.error('[db] Unexpected error on idle PostgreSQL client:', err);
    });
  }
  return pool;
}

/**
 * Closes the connection pool and resets initialized state (useful for tests and shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    initPromise = null;
  }
}

export const SCHEMA_SQL = `
BEGIN;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  full_name TEXT,
  avatar_url TEXT,
  avatar_path TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

CREATE OR REPLACE FUNCTION sync_profile_fields()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  IF NEW.id IS NULL THEN
    NEW.id := NEW.user_id;
  END IF;
  IF NEW.full_name IS NULL AND NEW.display_name IS NOT NULL THEN
    NEW.full_name := NEW.display_name;
  END IF;
  IF NEW.display_name IS NULL AND NEW.full_name IS NOT NULL THEN
    NEW.display_name := NEW.full_name;
  END IF;
  IF NEW.avatar_url IS NULL AND NEW.avatar_path IS NOT NULL THEN
    NEW.avatar_url := NEW.avatar_path;
  END IF;
  IF NEW.avatar_path IS NULL AND NEW.avatar_url IS NOT NULL THEN
    NEW.avatar_path := NEW.avatar_url;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_fields ON profiles;
CREATE TRIGGER trg_sync_profile_fields
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_fields();

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  type TEXT NOT NULL DEFAULT 'parametric',
  privacy TEXT NOT NULL DEFAULT 'private',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_message_leaf_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations(updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID,
  parent_message_id UUID,
  role TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_parent_id_idx ON messages(parent_id);
CREATE INDEX IF NOT EXISTS messages_parent_message_id_idx ON messages(parent_message_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);

CREATE OR REPLACE FUNCTION sync_message_fields()
RETURNS trigger AS $$
BEGIN
  IF NEW.parent_message_id IS NULL AND NEW.parent_id IS NOT NULL THEN
    NEW.parent_message_id := NEW.parent_id;
  END IF;
  IF NEW.parent_id IS NULL AND NEW.parent_message_id IS NOT NULL THEN
    NEW.parent_id := NEW.parent_message_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_message_fields ON messages;
CREATE TRIGGER trg_sync_message_fields
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_message_fields();

CREATE OR REPLACE FUNCTION update_conversation_leaf()
RETURNS trigger AS $$
BEGIN
  UPDATE conversations SET 
    current_message_leaf_id = NEW.id,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_leaf_trigger ON messages;
CREATE TRIGGER update_leaf_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_leaf();

CREATE OR REPLACE FUNCTION set_conversation_suggestions(
  p_conversation_id uuid,
  p_suggestions jsonb
) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER AS $$
  UPDATE conversations
  SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{suggestions}',
    p_suggestions,
    true
  )
  WHERE id = p_conversation_id;
$$;

CREATE TABLE IF NOT EXISTS storage_objects (
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket, path)
);

CREATE INDEX IF NOT EXISTS storage_objects_bucket_idx ON storage_objects(bucket);
CREATE INDEX IF NOT EXISTS storage_objects_created_at_idx ON storage_objects(created_at);

COMMIT;
`;

let initPromise: Promise<void> | null = null;

/**
 * Initializes database tables and triggers if they do not already exist.
 * Thread-safe singleton promise avoids duplicate migration runs.
 */
export async function initDatabase(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(SCHEMA_SQL);
      console.log('[db] PostgreSQL schema auto-migrated successfully');
    } catch (err) {
      initPromise = null;
      console.error('[db] Error initializing database schema:', err);
      throw err;
    } finally {
      client.release();
    }
  })();

  return initPromise;
}

/**
 * Executes a parameterized SQL query against the connection pool.
 * Automatically ensures the schema is initialized prior to execution.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  await initDatabase();
  const p = getPool();
  return p.query<R>(text, params);
}

// Auto-migrate on boot in non-test runtime environments
if (
  typeof process !== 'undefined' &&
  process.env?.NODE_ENV !== 'test' &&
  !process.env?.VITEST
) {
  initDatabase().catch((err) => {
    console.warn('[db] Background auto-migration pending/deferred:', err?.message || err);
  });
}
