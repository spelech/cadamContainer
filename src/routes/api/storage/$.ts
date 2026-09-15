import { createFileRoute } from '@tanstack/react-router';
import { Buffer } from 'node:buffer';
import {
  corsHeaders,
  isUnauthorizedError,
  json,
  preflight,
  requireUser,
} from '@/server/api';
import {
  deleteStorageObject,
  getStorageObject,
  listStorageObjects,
  putStorageObject,
} from '@/server/storage';

export function extractBucketAndPath(url: URL): {
  bucket: string;
  path: string;
} | null {
  const routePath = '/api/storage/';
  const idx = url.pathname.indexOf(routePath);
  if (idx === -1) return null;
  const remainder = url.pathname.slice(idx + routePath.length);
  const slashIdx = remainder.indexOf('/');
  if (slashIdx === -1) {
    // Might be listing a bucket, e.g. /api/storage/images
    const bucket = decodeURIComponent(remainder);
    return bucket ? { bucket, path: '' } : null;
  }
  const bucket = decodeURIComponent(remainder.slice(0, slashIdx));
  const path = decodeURIComponent(remainder.slice(slashIdx + 1));
  if (!bucket) return null;
  return { bucket, path };
}

export const Route = createFileRoute('/api/storage/$')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = extractBucketAndPath(url);
        if (!parsed) {
          return json({ error: 'invalid_storage_path' }, 400);
        }

        const { bucket, path } = parsed;

        // If path is empty, list bucket objects
        if (!path) {
          const prefix = url.searchParams.get('prefix') || undefined;
          const items = await listStorageObjects(bucket, prefix);
          return json(items);
        }

        const obj = await getStorageObject(bucket, path);
        if (!obj) {
          return json({ error: 'object_not_found' }, 404);
        }

        return new Response(obj.data, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': obj.contentType,
            'Content-Length': String(obj.sizeBytes),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      },

      POST: handleUpload,
      PUT: handleUpload,

      DELETE: async ({ request }) => {
        try {
          await requireUser(request);
        } catch (err) {
          if (isUnauthorizedError(err)) {
            return json({ error: 'Unauthorized' }, 401);
          }
          throw err;
        }

        const url = new URL(request.url);
        const parsed = extractBucketAndPath(url);
        if (!parsed || !parsed.path) {
          return json({ error: 'invalid_storage_path' }, 400);
        }

        const deleted = await deleteStorageObject(parsed.bucket, parsed.path);
        return json({ success: true, deleted });
      },
    },
  },
});

async function handleUpload({ request }: { request: Request }) {
  try {
    await requireUser(request);
  } catch (err) {
    if (isUnauthorizedError(err)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    throw err;
  }

  const url = new URL(request.url);
  const parsed = extractBucketAndPath(url);
  if (!parsed || !parsed.path) {
    return json({ error: 'invalid_storage_path' }, 400);
  }

  const { bucket, path } = parsed;
  const rawContentType = request.headers.get('content-type') || '';
  let contentType = rawContentType || 'application/octet-stream';

  let dataBuffer: Buffer;

  // Handle FormData vs raw binary
  if (rawContentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') || formData.get('data');
    if (file instanceof Blob) {
      contentType = file.type || 'application/octet-stream';
      const arr = await file.arrayBuffer();
      dataBuffer = Buffer.from(arr);
    } else {
      return json({ error: 'missing_file_in_form_data' }, 400);
    }
  } else {
    const arrayBuffer = await request.arrayBuffer();
    dataBuffer = Buffer.from(arrayBuffer);
  }

  await putStorageObject(bucket, path, dataBuffer, contentType);

  return json({
    key: path,
    path,
    size: dataBuffer.length,
    contentType,
  });
}
