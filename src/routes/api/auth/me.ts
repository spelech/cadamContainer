import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { getSessionUser } from '@/server/auth';

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized', user: null }, 401);
        }

        return json({
          user: {
            id: user.id,
            email: user.email,
            display_name: user.display_name ?? null,
            avatar_url: user.avatar_url ?? null,
            user_metadata: {
              full_name: user.display_name ?? null,
              avatar_url: user.avatar_url ?? null,
            },
          },
        });
      },
    },
  },
});
