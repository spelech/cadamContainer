import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { getSessionUser } from '@/server/auth';
import { query } from '@/server/db';

export const Route = createFileRoute('/api/conversations')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const result = await query(
          `SELECT id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at
           FROM conversations
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [user.id],
        );

        return json(result.rows);
      },
      POST: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401);
        }

        const body = (await request.json().catch(() => ({}))) || {};
        const id =
          typeof body.id === 'string' && body.id.trim()
            ? body.id.trim()
            : crypto.randomUUID();
        const title =
          typeof body.title === 'string' && body.title.trim()
            ? body.title.trim()
            : 'New Conversation';
        const type =
          typeof body.type === 'string' && body.type.trim()
            ? body.type.trim()
            : 'parametric';
        const privacy =
          typeof body.privacy === 'string' && body.privacy.trim()
            ? body.privacy.trim()
            : 'private';
        const settings =
          body.settings && typeof body.settings === 'object'
            ? body.settings
            : {};
        const currentMessageLeafId =
          typeof body.current_message_leaf_id === 'string' &&
          body.current_message_leaf_id.trim()
            ? body.current_message_leaf_id.trim()
            : null;

        const result = await query(
          `INSERT INTO conversations (id, user_id, title, type, privacy, settings, current_message_leaf_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
           RETURNING id, user_id, title, type, privacy, settings, current_message_leaf_id, created_at, updated_at`,
          [
            id,
            user.id,
            title,
            type,
            privacy,
            JSON.stringify(settings),
            currentMessageLeafId,
          ],
        );

        return json(result.rows[0], 201);
      },
    },
  },
});
