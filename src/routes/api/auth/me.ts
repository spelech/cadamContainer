import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import {
  createSessionCookie,
  getSessionUser,
  isSecure,
  parseCookies,
  SESSION_COOKIE_NAME,
  signSession,
} from '@/server/auth';

export const Route = createFileRoute('/api/auth/me')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const user = await getSessionUser(request);
        if (!user) {
          return json({ error: 'Unauthorized', user: null }, 401);
        }

        const res = json({
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

        const cookies = parseCookies(request.headers.get('cookie'));
        if (!cookies[SESSION_COOKIE_NAME]) {
          const sessionToken = signSession(user);
          const secure = isSecure(request);
          res.headers.append(
            'Set-Cookie',
            createSessionCookie(sessionToken, { secure }),
          );
        }

        return res;
      },
    },
  },
});
