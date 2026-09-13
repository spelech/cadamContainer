import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import {
  buildAuthorizationUrl,
  createCodeVerifierCookie,
  createOauthStateCookie,
  generatePkce,
  getCallbackUri,
  getPocketIdConfig,
  isSecure,
} from '@/server/auth';

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const config = getPocketIdConfig();
        if (!config.clientId) {
          return json(
            {
              error: 'misconfigured_auth',
              message: 'POCKETID_CLIENT_ID is not configured',
            },
            500,
          );
        }

        const { verifier, challenge, state } = generatePkce();
        const redirectUri = getCallbackUri(request);
        const authUrl = await buildAuthorizationUrl({
          redirectUri,
          state,
          codeChallenge: challenge,
        });

        const headers = new Headers();
        const secure = isSecure(request);
        headers.append('Set-Cookie', createOauthStateCookie(state, { secure }));
        headers.append(
          'Set-Cookie',
          createCodeVerifierCookie(verifier, { secure }),
        );
        headers.set('Location', authUrl);

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
