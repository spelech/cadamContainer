import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import {
  clearOauthCookies,
  createSessionCookie,
  exchangeCodeForTokens,
  fetchUserInfo,
  getCallbackUri,
  isSecure,
  parseCookies,
  signSession,
  STATE_COOKIE_NAME,
  syncUserProfile,
  VERIFIER_COOKIE_NAME,
} from '@/server/auth';

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get('error');
        const errorDesc = url.searchParams.get('error_description');

        if (error) {
          console.error('[auth] OAuth error from provider:', error, errorDesc);
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/cadam/?auth_error=${encodeURIComponent(error)}`,
            },
          });
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code || !state) {
          return json({ error: 'Missing code or state parameter' }, 400);
        }

        const cookies = parseCookies(request.headers.get('cookie'));
        const storedState = cookies[STATE_COOKIE_NAME];
        const codeVerifier = cookies[VERIFIER_COOKIE_NAME];

        if (!storedState || storedState !== state) {
          return json(
            { error: 'Invalid or missing OAuth state parameter (CSRF protection)' },
            400,
          );
        }

        if (!codeVerifier) {
          return json(
            { error: 'Missing code verifier in session' },
            400,
          );
        }

        const redirectUri = getCallbackUri(request);
        const secure = isSecure(request);

        try {
          // 1. Exchange code for tokens
          const tokens = await exchangeCodeForTokens(
            code,
            codeVerifier,
            redirectUri,
          );

          // 2. Fetch userinfo from PocketID
          const userInfo = await fetchUserInfo(tokens.access_token);

          // 3. Upsert user into database profiles
          const profile = await syncUserProfile(userInfo);

          // 4. Create signed session token
          const sessionToken = signSession(profile);

          // 5. Construct response redirecting to /cadam/ with session cookie set and oauth cookies cleared
          const headers = new Headers();
          headers.append(
            'Set-Cookie',
            createSessionCookie(sessionToken, { secure }),
          );
          for (const clearCookie of clearOauthCookies({ secure })) {
            headers.append('Set-Cookie', clearCookie);
          }

          headers.set('Location', '/cadam/');
          return new Response(null, {
            status: 302,
            headers,
          });
        } catch (err: unknown) {
          console.error('[auth] Callback authentication error:', err);
          const message = err instanceof Error ? err.message : String(err);
          return json(
            {
              error: 'Authentication failed',
              details: message,
            },
            500,
          );
        }
      },
    },
  },
});
