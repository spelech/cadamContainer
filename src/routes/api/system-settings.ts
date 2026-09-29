import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { getSessionUser } from '@/server/auth';
import {
  getModelRoles,
  setModelRoles,
  autoDetectModelRoles,
  getSystemSetting,
  setSystemSetting,
} from '@/server/systemSettings';

export async function handleSystemSettingsRequest(
  request: Request,
  options: { bypassAuth?: boolean } = {},
) {
  if (request.method === 'OPTIONS') {
    return preflight();
  }

  let user = null;
  if (!options.bypassAuth) {
    user = await getSessionUser(request);
    // In self-hosted environment, allow reading settings if unauthenticated or authenticated,
    // but require authentication for write operations if auth is enabled.
    if (!user && (request.method === 'PATCH' || request.method === 'POST')) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const key = url.searchParams.get('key');
    if (key === 'model_roles' || !key) {
      const modelRoles = await getModelRoles();
      return json({
        settings: {
          model_roles: modelRoles,
        },
      });
    }

    const setting = await getSystemSetting(key);
    return json({ settings: { [key]: setting } });
  }

  if (request.method === 'PATCH' || request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) || {};

    if (body.action === 'auto_detect_model_roles') {
      const detected = await autoDetectModelRoles();
      const updated = await setModelRoles(detected, user?.id);
      return json({ settings: { model_roles: updated } });
    }

    if (body.key === 'model_roles' && body.value) {
      const updated = await setModelRoles(body.value, user?.id);
      return json({ settings: { model_roles: updated } });
    }

    if (body.key && body.value !== undefined) {
      const updated = await setSystemSetting(
        body.key,
        body.value,
        body.category || 'general',
        user?.id,
        body.description,
      );
      return json({ settings: { [body.key]: updated } });
    }

    return json({ error: 'Invalid request body' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = (createFileRoute as any)('/api/system-settings')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ request }: { request: Request }) =>
        handleSystemSettingsRequest(request),
      POST: ({ request }: { request: Request }) =>
        handleSystemSettingsRequest(request),
      PATCH: ({ request }: { request: Request }) =>
        handleSystemSettingsRequest(request),
    },
  },
});
