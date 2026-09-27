import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeartbeatManager } from './serverHeartbeat';

test('emits heartbeat every interval until stopped', async () => {
  const pings: string[] = [];
  const manager = createHeartbeatManager((msg) => pings.push(msg), 50);
  await new Promise((r) => setTimeout(r, 130));
  manager.stop();
  const countBefore = pings.length;
  assert.ok(countBefore >= 2, `Expected at least 2 pings, got ${countBefore}`);
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(
    pings.length,
    countBefore,
    'Heartbeat should not emit after being stopped',
  );
});
