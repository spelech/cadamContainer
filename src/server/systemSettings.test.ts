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

const { closePool } = await import('./db.ts');
const { getSystemSetting, setSystemSetting, getModelRoles, setModelRoles } =
  await import('./systemSettings.ts');

describe('System Settings DAO (src/server/systemSettings.ts)', () => {
  after(async () => {
    await closePool();
  });

  it('can set and retrieve an arbitrary JSON setting', async () => {
    const testVal = { key: 'val', number: 123, list: ['a', 'b'] };
    await setSystemSetting('test_setting', testVal, 'test');
    const retrieved = await getSystemSetting('test_setting');
    assert.deepEqual(retrieved, testVal);
  });

  it('retrieves default model roles', async () => {
    const roles = await getModelRoles();
    assert.ok(roles.parametricModel);
    assert.ok(roles.creativeModel);
    assert.ok(roles.inspectionModel);
    assert.ok(roles.auxiliaryModel);
    assert.ok(
      ['off', 'low', 'medium', 'high', 'max'].includes(
        roles.defaultReasoningEffort,
      ),
    );
  });

  it('updates partial model roles', async () => {
    const updated = await setModelRoles({
      defaultReasoningEffort: 'high',
      parametricModel: 'test-parametric-model',
    });
    assert.equal(updated.defaultReasoningEffort, 'high');
    assert.equal(updated.parametricModel, 'test-parametric-model');

    const retrieved = await getModelRoles();
    assert.equal(retrieved.defaultReasoningEffort, 'high');
    assert.equal(retrieved.parametricModel, 'test-parametric-model');
  });
});
