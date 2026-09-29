import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { after, describe, it } from 'node:test';

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  try {
    const ip = execSync(
      "docker inspect cadam-db -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'",
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (ip) {
      return `postgres://cadam:cadam_secret_pass@${ip}:5432/cadam`;
    }
  } catch {
    // fallback
  }
  return 'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';
}

process.env.DATABASE_URL = resolveDatabaseUrl();

const { closePool } = await import('../../server/db.ts');
const { handleSystemSettingsRequest } = await import('./system-settings.ts');

describe('System Settings API Handler (src/routes/api/system-settings.ts)', () => {
  after(async () => {
    await closePool();
  });

  it('handles GET request returning model_roles', async () => {
    const req = new Request('http://localhost/api/system-settings', {
      method: 'GET',
    });
    const res = await handleSystemSettingsRequest(req, { bypassAuth: true });
    interface SettingsResponse {
      settings?: {
        model_roles?: {
          parametricModel?: string;
          creativeModel?: string;
          defaultReasoningEffort?: string;
        };
      };
    }
    const body = (await res.json()) as SettingsResponse;
    assert.ok(body.settings?.model_roles);
    assert.ok(body.settings.model_roles.parametricModel);
    assert.ok(body.settings.model_roles.creativeModel);
  });

  it('handles PATCH request updating model_roles', async () => {
    const req = new Request('http://localhost/api/system-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'model_roles',
        value: {
          defaultReasoningEffort: 'medium',
          parametricModel: 'custom/model-test',
        },
      }),
    });
    const res = await handleSystemSettingsRequest(req, { bypassAuth: true });
    assert.equal(res.status, 200);
    interface PatchResponse {
      settings?: {
        model_roles?: {
          parametricModel?: string;
          defaultReasoningEffort?: string;
        };
      };
    }
    const body = (await res.json()) as PatchResponse;
    assert.equal(body.settings?.model_roles?.defaultReasoningEffort, 'medium');
    assert.equal(
      body.settings?.model_roles?.parametricModel,
      'custom/model-test',
    );
  });

  it('handles auto-detect action', async () => {
    const req = new Request('http://localhost/api/system-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto_detect_model_roles' }),
    });
    const res = await handleSystemSettingsRequest(req, { bypassAuth: true });
    assert.equal(res.status, 200);
    interface AutoDetectResponse {
      settings?: {
        model_roles?: {
          parametricModel?: string;
        };
      };
    }
    const body = (await res.json()) as AutoDetectResponse;
    assert.ok(body.settings?.model_roles?.parametricModel);
  });
});
