import { Buffer } from 'node:buffer';
import { query } from './db';

export interface StorageObjectRecord {
  bucket: string;
  path: string;
  contentType: string;
  data: Buffer;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageObjectMeta {
  path: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Stores or updates a binary object in the storage_objects table.
 */
export async function putStorageObject(
  bucket: string,
  path: string,
  data: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream',
): Promise<void> {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sizeBytes = buf.length;

  await query(
    `INSERT INTO storage_objects (bucket, path, content_type, data, size_bytes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (bucket, path) DO UPDATE
     SET content_type = EXCLUDED.content_type,
         data = EXCLUDED.data,
         size_bytes = EXCLUDED.size_bytes,
         updated_at = NOW()`,
    [bucket, path, contentType, buf, sizeBytes],
  );
}

/**
 * Retrieves a binary object and its content type from storage_objects.
 */
export async function getStorageObject(
  bucket: string,
  path: string,
): Promise<{ data: Buffer; contentType: string; sizeBytes: number } | null> {
  const result = await query<{
    data: Buffer;
    content_type: string;
    size_bytes: string | number;
  }>(
    `SELECT data, content_type, size_bytes
     FROM storage_objects
     WHERE bucket = $1 AND path = $2
     LIMIT 1`,
    [bucket, path],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const sizeBytes =
    typeof row.size_bytes === 'string'
      ? parseInt(row.size_bytes, 10)
      : Number(row.size_bytes);

  return {
    data: row.data,
    contentType: row.content_type,
    sizeBytes,
  };
}

/**
 * Deletes a storage object if present. Returns true if an object was deleted.
 */
export async function deleteStorageObject(
  bucket: string,
  path: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM storage_objects
     WHERE bucket = $1 AND path = $2`,
    [bucket, path],
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Lists metadata for objects in a bucket, optionally filtering by path prefix.
 */
export async function listStorageObjects(
  bucket: string,
  prefix?: string,
): Promise<StorageObjectMeta[]> {
  let sql = `
    SELECT path, content_type, size_bytes, created_at, updated_at
    FROM storage_objects
    WHERE bucket = $1
  `;
  const params: unknown[] = [bucket];

  if (prefix) {
    sql += ' AND path LIKE $2';
    params.push(`${prefix}%`);
  }

  sql += ' ORDER BY path ASC';

  const result = await query<{
    path: string;
    content_type: string;
    size_bytes: string | number;
    created_at: Date;
    updated_at: Date;
  }>(sql, params);

  return result.rows.map((row) => ({
    path: row.path,
    contentType: row.content_type,
    sizeBytes:
      typeof row.size_bytes === 'string'
        ? parseInt(row.size_bytes, 10)
        : Number(row.size_bytes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
