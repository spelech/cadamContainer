import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { getSessionUser } from '@/server/auth';
import { query } from '@/server/db';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

function extractConversationId(
  params?: { id?: string },
  request?: Request,
): string | null {
  if (params?.id) return params.id;
  if (request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const convIdx = parts.indexOf('conversations');
    if (convIdx !== -1 && parts[convIdx + 1]) {
      return parts[convIdx + 1];
    }
  }
  return null;
}

export const Route = createFileRoute('/api/conversations/$id')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request, params }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const id = extractConversationId(params, request);
        if (!id || !isValidUuid(id)) {
          return json({ error: 'Invalid conversation id' }, 400);
        }

        const result = await query(
          `SELECT id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
           FROM conversations
           WHERE id = $1 AND (user_id = $2 OR privacy = 'public')
           LIMIT 1`,
          [id, user.id],
        );

        if (result.rows.length === 0) {
          return json({ error: 'Conversation not found' }, 404);
        }

        return json(result.rows[0]);
      },
      PATCH: async ({ request, params }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const id = extractConversationId(params, request);
        if (!id || !isValidUuid(id)) {
          return json({ error: 'Invalid conversation id' }, 400);
        }

        const body = (await request.json().catch(() => ({}))) || {};
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (typeof body.title === 'string') {
          setClauses.push(`title = $${paramIndex++}`);
          values.push(body.title.trim());
        }
        if (typeof body.type === 'string') {
          setClauses.push(`type = $${paramIndex++}`);
          values.push(body.type.trim());
        }
        if (typeof body.privacy === 'string') {
          setClauses.push(`privacy = $${paramIndex++}`);
          values.push(body.privacy.trim());
        }
        if (body.settings !== undefined && typeof body.settings === 'object') {
          setClauses.push(`settings = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(body.settings));
        }
        if (body.current_message_leaf_id !== undefined) {
          setClauses.push(`current_message_leaf_id = $${paramIndex++}`);
          values.push(body.current_message_leaf_id || null);
        }

        if (setClauses.length === 0) {
          // No fields to update, fetch and return current row
          const current = await query(
            `SELECT id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
             FROM conversations
             WHERE id = $1 AND user_id = $2`,
            [id, user.id],
          );
          if (current.rows.length === 0) {
            return json({ error: 'Conversation not found' }, 404);
          }
          return json(current.rows[0]);
        }

        setClauses.push(`updated_at = NOW()`);
        values.push(id);
        const idParam = `$${paramIndex++}`;
        values.push(user.id);
        const userParam = `$${paramIndex++}`;

        const updateSql = `
          UPDATE conversations
          SET ${setClauses.join(', ')}
          WHERE id = ${idParam} AND user_id = ${userParam}
          RETURNING id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
        `;

        const result = await query(updateSql, values);
        if (result.rows.length === 0) {
          return json({ error: 'Conversation not found or not authorized' }, 404);
        }

        return json(result.rows[0]);
      },
      PUT: async ({ request, params }) => {
        // PUT behaves identically to PATCH for partial/full conversation updates
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const id = extractConversationId(params, request);
        if (!id || !isValidUuid(id)) {
          return json({ error: 'Invalid conversation id' }, 400);
        }

        const body = (await request.json().catch(() => ({}))) || {};
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (typeof body.title === 'string') {
          setClauses.push(`title = $${paramIndex++}`);
          values.push(body.title.trim());
        }
        if (typeof body.type === 'string') {
          setClauses.push(`type = $${paramIndex++}`);
          values.push(body.type.trim());
        }
        if (typeof body.privacy === 'string') {
          setClauses.push(`privacy = $${paramIndex++}`);
          values.push(body.privacy.trim());
        }
        if (body.settings !== undefined && typeof body.settings === 'object') {
          setClauses.push(`settings = $${paramIndex++}::jsonb`);
          values.push(JSON.stringify(body.settings));
        }
        if (body.current_message_leaf_id !== undefined) {
          setClauses.push(`current_message_leaf_id = $${paramIndex++}`);
          values.push(body.current_message_leaf_id || null);
        }

        if (setClauses.length === 0) {
          const current = await query(
            `SELECT id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
             FROM conversations
             WHERE id = $1 AND user_id = $2`,
            [id, user.id],
          );
          if (current.rows.length === 0) {
            return json({ error: 'Conversation not found' }, 404);
          }
          return json(current.rows[0]);
        }

        setClauses.push(`updated_at = NOW()`);
        values.push(id);
        const idParam = `$${paramIndex++}`;
        values.push(user.id);
        const userParam = `$${paramIndex++}`;

        const updateSql = `
          UPDATE conversations
          SET ${setClauses.join(', ')}
          WHERE id = ${idParam} AND user_id = ${userParam}
          RETURNING id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
        `;

        const result = await query(updateSql, values);
        if (result.rows.length === 0) {
          return json({ error: 'Conversation not found or not authorized' }, 404);
        }

        return json(result.rows[0]);
      },
      DELETE: async ({ request, params }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const id = extractConversationId(params, request);
        if (!id || !isValidUuid(id)) {
          return json({ error: 'Invalid conversation id' }, 400);
        }

        const result = await query(
          `DELETE FROM conversations
           WHERE id = $1 AND user_id = $2
           RETURNING id`,
          [id, user.id],
        );

        if (result.rows.length === 0) {
          return json({ error: 'Conversation not found or not authorized' }, 404);
        }

        return json({ success: true, id });
      },
    },
  },
});
