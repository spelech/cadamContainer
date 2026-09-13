import { createFileRoute } from '@tanstack/react-router';
import { corsHeaders, preflight } from '@/server/api';
import { clearSessionCookie, isSecure } from '@/server/auth';

function handleLogout(request: Request) {
  const secure = isSecure(request);
  const cookie = clearSessionCookie({ secure });
  const accept = request.headers.get('accept') || '';

  if (accept.includes('application/json') && request.method === 'POST') {
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', 'application/json');
    headers.append('Set-Cookie', cookie);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  }

  const headers = new Headers(corsHeaders);
  headers.append('Set-Cookie', cookie);
  headers.set('Location', '/cadam/');
  return new Response(null, {
    status: 302,
    headers,
  });
}

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      OPTIONS: preflight,
      POST: ({ request }) => handleLogout(request),
      GET: ({ request }) => handleLogout(request),
    },
  },
});
