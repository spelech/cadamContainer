import type { BrowserContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import { signSession } from '../../src/server/auth.js';
import { query } from '../../src/server/db.js';

export function resolveDatabaseUrl(): string {
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('cadam-db')
  ) {
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

const SESSION_SECRET =
  process.env.CADAM_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  'cadam_session_secret_32_chars_minimum_len';

export interface TestUser {
  id: string;
  email: string;
  display_name: string;
}

export const DEFAULT_TEST_USER: TestUser = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'e2e-tester@cadam.local',
  display_name: 'E2E Automated Tester',
};

/**
 * Ensures the test user exists in PostgreSQL profiles table.
 */
export async function seedTestUser(user = DEFAULT_TEST_USER) {
  try {
    await query(
      `INSERT INTO profiles (id, user_id, email, display_name, full_name, notifications_enabled)
       VALUES ($1, $1, $2, $3, $3, true)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         full_name = EXCLUDED.full_name;`,
      [user.id, user.email, user.display_name],
    );
  } catch (err) {
    console.warn(
      '[e2e/auth] Warning: Failed to seed test profile into DB:',
      err,
    );
  }
}

/**
 * Injects authenticated session cookie into the Playwright browser context.
 */
export async function authenticateBrowserContext(
  context: BrowserContext,
  user = DEFAULT_TEST_USER,
) {
  await seedTestUser(user);
  const token = signSession(user, 86400 * 7, SESSION_SECRET);

  await context.addCookies([
    {
      name: 'cadam_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  return user;
}
