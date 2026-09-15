import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
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
const {
  putStorageObject,
  getStorageObject,
  deleteStorageObject,
  listStorageObjects,
} = await import('./storage');

describe('PostgreSQL Storage Module (src/server/storage.ts)', () => {
  before(async () => {
    await initDatabase();
    await query('DELETE FROM storage_objects WHERE bucket = $1', ['test-bucket']);
  });

  after(async () => {
    await query('DELETE FROM storage_objects WHERE bucket = $1', ['test-bucket']);
    await closePool();
  });

  it('puts and gets a storage binary object', async () => {
    const rawData = Buffer.from('hello world from postgres storage');
    const path = 'previews/test-1.png';
    const contentType = 'image/png';

    await putStorageObject('test-bucket', path, rawData, contentType);

    const retrieved = await getStorageObject('test-bucket', path);
    assert.ok(retrieved, 'Object should be found in storage');
    assert.strictEqual(retrieved.contentType, contentType);
    assert.strictEqual(retrieved.data.toString('utf-8'), 'hello world from postgres storage');
    assert.strictEqual(retrieved.sizeBytes, rawData.length);
  });

  it('upserts an existing object when overwritten', async () => {
    const path = 'previews/test-upsert.png';
    await putStorageObject('test-bucket', path, Buffer.from('initial'), 'text/plain');
    await putStorageObject('test-bucket', path, Buffer.from('updated content'), 'image/png');

    const retrieved = await getStorageObject('test-bucket', path);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.contentType, 'image/png');
    assert.strictEqual(retrieved.data.toString('utf-8'), 'updated content');
  });

  it('returns null for non-existent objects', async () => {
    const retrieved = await getStorageObject('test-bucket', 'nonexistent/file.bin');
    assert.strictEqual(retrieved, null);
  });

  it('lists objects under a bucket and prefix', async () => {
    await putStorageObject('test-bucket', 'photos/cat.jpg', Buffer.from('cat'), 'image/jpeg');
    await putStorageObject('test-bucket', 'photos/dog.jpg', Buffer.from('dog'), 'image/jpeg');
    await putStorageObject('test-bucket', 'docs/readme.txt', Buffer.from('readme'), 'text/plain');

    const allObjects = await listStorageObjects('test-bucket');
    assert.ok(allObjects.length >= 3);

    const photoObjects = await listStorageObjects('test-bucket', 'photos/');
    assert.strictEqual(photoObjects.length, 2);
    const paths = photoObjects.map((o) => o.path).sort();
    assert.deepStrictEqual(paths, ['photos/cat.jpg', 'photos/dog.jpg']);
  });

  it('deletes an object', async () => {
    const path = 'delete-me.bin';
    await putStorageObject('test-bucket', path, Buffer.from('bye'), 'application/octet-stream');

    const deleted = await deleteStorageObject('test-bucket', path);
    assert.strictEqual(deleted, true);

    const check = await getStorageObject('test-bucket', path);
    assert.strictEqual(check, null);

    const deleteAgain = await deleteStorageObject('test-bucket', path);
    assert.strictEqual(deleteAgain, false);
  });

  it('downloadAsBase64 rehydrates stored images from PostgreSQL storage', async () => {
    const { downloadAsBase64 } = await import('./aiChat');
    const path = 'user-1/conv-1/preview-call-123';
    const fakePng = Buffer.from('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRtestpngbytes', 'binary');
    await putStorageObject('images', path, fakePng, 'image/png');

    const result = await downloadAsBase64('images', path);
    assert.ok(result, 'downloadAsBase64 should resolve object');
    assert.strictEqual(result.mediaType, 'image/png');
    assert.strictEqual(typeof result.base64, 'string');
    assert.strictEqual(Buffer.from(result.base64, 'base64').toString('binary'), fakePng.toString('binary'));

    await deleteStorageObject('images', path);
  });
});
