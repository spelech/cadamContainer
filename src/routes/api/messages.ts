import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { getSessionUser } from '@/server/auth';
import { query } from '@/server/db';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

export const Route = createFileRoute('/api/messages')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const url = new URL(request.url);
        const conversationId =
          url.searchParams.get('conversationId') ||
          url.searchParams.get('conversation_id');

        if (!conversationId || !isValidUuid(conversationId)) {
          return json(
            { error: 'Valid conversationId query parameter is required' },
            400,
          );
        }

        // Verify conversation access (must belong to user or be public)
        const convCheck = await query(
          `SELECT id, user_id, privacy FROM conversations WHERE id = $1 LIMIT 1`,
          [conversationId],
        );

        if (convCheck.rows.length === 0) {
          return json({ error: 'Conversation not found' }, 404);
        }

        const conv = convCheck.rows[0];
        if (conv.user_id !== user.id && conv.privacy !== 'public') {
          return json({ error: 'Forbidden' }, 403);
        }

        const result = await query(
          `SELECT id, conversation_id, user_id, role, content, parts, metadata, rating, created_at, parent_id, parent_message_id
           FROM messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC`,
          [conversationId],
        );

        return json(result.rows);
      },
      POST: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          return json({ error: 'Invalid request body' }, 400);
        }

        const conversationId = body.conversation_id || body.conversationId;
        if (!conversationId || !isValidUuid(conversationId)) {
          return json({ error: 'Valid conversation_id is required' }, 400);
        }

        if (!body.role || typeof body.role !== 'string') {
          return json({ error: 'role is required' }, 400);
        }

        // Verify user owns conversation
        const convCheck = await query(
          `SELECT id FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
          [conversationId, user.id],
        );

        if (convCheck.rows.length === 0) {
          return json(
            { error: 'Conversation not found or not authorized' },
            404,
          );
        }

        const id =
          typeof body.id === 'string' && isValidUuid(body.id.trim())
            ? body.id.trim()
            : crypto.randomUUID();
        const role = body.role.trim();
        const content =
          body.content && typeof body.content === 'object' ? body.content : {};
        const parts = Array.isArray(body.parts) ? body.parts : [];
        const metadata =
          body.metadata && typeof body.metadata === 'object'
            ? body.metadata
            : {};
        const parentId =
          body.parent_id || body.parent_message_id || null;
        const rating =
          typeof body.rating === 'number' && Number.isFinite(body.rating)
            ? body.rating
            : 0;

        const result = await query(
          `INSERT INTO messages (id, conversation_id, user_id, role, content, parts, metadata, parent_id, parent_message_id, rating)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)
           RETURNING id, conversation_id, user_id, role, content, parts, metadata, rating, created_at, parent_id, parent_message_id`,
          [
            id,
            conversationId,
            user.id,
            role,
            JSON.stringify(content),
            JSON.stringify(parts),
            JSON.stringify(metadata),
            parentId,
            parentId,
            rating,
          ],
        );

        return json(result.rows[0], 201);
      },
      PATCH: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const url = new URL(request.url);
        const body = (await request.json().catch(() => ({}))) || {};
        const messageId =
          url.searchParams.get('id') ||
          (typeof body.id === 'string' ? body.id : null);

        if (!messageId || !isValidUuid(messageId)) {
          return json({ error: 'Valid message id is required' }, 400);
        }

        // Verify message belongs to user's conversation
        const msgCheck = await query(
          `SELECT m.id, m.conversation_id
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           WHERE m.id = $1 AND c.user_id = $2
           LIMIT 1`,
          [messageId, user.id],
        );

        if (msgCheck.rows.length === 0) {
          return json({ error: 'Message not found or not authorized' }, 404);
        }

        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (body.parts !== undefined && Array.isArray(body.parts)) {
          setClauses.push(`parts = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(body.parts));
        }
        if (body.metadata !== undefined && typeof body.metadata === 'object') {
          setClauses.push(`metadata = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(body.metadata));
        }
        if (body.content !== undefined && typeof body.content === 'object') {
          setClauses.push(`content = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(body.content));
        }
        if (typeof body.rating === 'number' && Number.isFinite(body.rating)) {
          setClauses.push(`rating = $${paramIndex++}`);
          values.push(body.rating);
        }

        if (setClauses.length === 0) {
          const current = await query(
            `SELECT id, conversation_id, user_id, role, content, parts, metadata, rating, created_at, parent_id, parent_message_id
             FROM messages
             WHERE id = $1`,
            [messageId],
          );
          return json(current.rows[0]);
        }

        values.push(messageId);
        const idParam = `$${paramIndex++}`;

        const updateSql = `
          UPDATE messages
          SET ${setClauses.join(', ')}
          WHERE id = ${idParam}
          RETURNING id, conversation_id, user_id, role, content, parts, metadata, rating, created_at, parent_id, parent_message_id
        `;

        const result = await query(updateSql, values);
        return json(result.rows[0]);
      },
      DELETE: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const url = new URL(request.url);
        const body = (await request.json().catch(() => ({}))) || {};
        const messageId =
          url.searchParams.get('id') ||
          (typeof body.id === 'string' ? body.id : null);

        if (!messageId || !isValidUuid(messageId)) {
          return json({ error: 'Valid message id is required' }, 400);
        }

        const result = await query(
          `DELETE FROM messages
           WHERE id = $1 AND conversation_id IN (
             SELECT id FROM conversations WHERE user_id = $2
           )
           RETURNING id`,
          [messageId, user.id],
        );

        if (result.rows.length === 0) {
          return json({ error: 'Message not found or not authorized' }, 404);
        }

        return json({ success: true, id: messageId });
      },
    },
  },
});
