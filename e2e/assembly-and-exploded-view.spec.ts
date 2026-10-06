import { test, expect } from '@playwright/test';
import {
  authenticateBrowserContext,
  cleanupTestUserConversations,
  DEFAULT_TEST_USER,
  resolveDatabaseUrl,
} from './helpers/auth.js';
import { inspectCanvas } from './helpers/canvas.js';

const MULTIPART_ASSEMBLY_SCAD = `// Parametric two-part snap box assembly
/* [Dimensions] */
width = 40; // [20:100]
depth = 40; // [20:100]
height = 20; // [10:50]
wall = 2; // [1:5]
show_part = "all"; // [all, base, lid]

module part_base() {
  color("#3b82f6") difference() {
    cube([width, depth, height], center=true);
    translate([0, 0, wall])
      cube([width - 2*wall, depth - 2*wall, height], center=true);
  }
}

module part_lid() {
  color("#10b981") translate([0, 0, height/2 + wall/2])
    cube([width, depth, wall], center=true);
}

if (show_part == "base") {
  part_base();
} else if (show_part == "lid") {
  part_lid();
} else {
  part_base();
  part_lid();
}
`;

const AUTO_INFERRED_ASSEMBLY_SCAD = `// Assembly without explicit manifest
/* [Parameters] */
length = 30; // [10:60]

module part_chassis() {
  color("#4f46e5") cube([length, 20, 10], center=true);
}

module part_cover() {
  color("#f59e0b") translate([0, 0, 8])
    cube([length, 20, 4], center=true);
}

part_chassis();
part_cover();
`;

/**
 * Seeds a test conversation with a parametric model tool call in PostgreSQL.
 */
async function seedAssemblyConversation(
  userId: string,
  title: string,
  code: string,
  assemblyManifest?: {
    explodeDistanceMm: number;
    parts: Array<{
      id: string;
      name: string;
      moduleName?: string;
      color?: string;
      explodeVector: [number, number, number];
    }>;
  },
): Promise<string> {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  const { query } = await import('../src/server/db.js');

  const convRes = await query<{ id: string }>(
    `INSERT INTO public.conversations (user_id, title, type, privacy)
     VALUES ($1, $2, 'parametric', 'private')
     RETURNING id;`,
    [userId, title],
  );
  const conversationId = convRes.rows[0].id;

  const artifactInput = {
    title,
    code,
    description: 'Precision parametric multipart assembly',
    ...(assemblyManifest ? { assembly: assemblyManifest } : {}),
  };

  const toolPart = {
    type: 'tool-build_parametric_model',
    state: 'output-available',
    toolCallId: `call_${Date.now()}`,
    input: artifactInput,
    output: artifactInput,
  };

  await query(
    `INSERT INTO public.messages (conversation_id, user_id, role, content, parts, metadata)
     VALUES ($1, $2, 'assistant', '{}'::jsonb, $3::jsonb, '{}'::jsonb);`,
    [conversationId, userId, JSON.stringify([toolPart])],
  );

  return conversationId;
}

test.describe('Multipart Assembly & Exploded View E2E', () => {
  test.afterEach(async () => {
    await cleanupTestUserConversations();
  });

  test('renders Parts & Assembly tab, scrubs explode slider, and toggles part visibility and isolation', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);

    // Seed conversation with two-part assembly manifest
    const convId = await seedAssemblyConversation(
      DEFAULT_TEST_USER.id,
      'Two-Part Snap Box',
      MULTIPART_ASSEMBLY_SCAD,
      {
        explodeDistanceMm: 40,
        parts: [
          {
            id: 'base',
            name: 'Base Enclosure',
            moduleName: 'part_base',
            color: '#3b82f6',
            explodeVector: [0, 0, -1],
          },
          {
            id: 'lid',
            name: 'Top Lid',
            moduleName: 'part_lid',
            color: '#10b981',
            explodeVector: [0, 0, 1],
          },
        ],
      },
    );

    await page.goto(`/cadam/editor/${convId}`);

    // Verify 3D canvas loads and compiles
    const canvasInfo = await inspectCanvas(page, 'canvas', 30000);
    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.hasWebGL).toBe(true);

    // Verify Parts & Assembly tab appears with part count badge (2)
    const assemblyTab = page
      .getByRole('tab', { name: /Parts & Assembly/i })
      .first();
    await expect(assemblyTab).toBeVisible({ timeout: 15000 });
    await assemblyTab.click();

    // Verify Exploded view slider is visible
    const explodeSlider = page
      .locator('[data-testid="explode-slider"], input[type="range"]')
      .first();
    await expect(explodeSlider).toBeVisible();

    // Scrub exploded slider to 50%
    await explodeSlider.fill('50');
    expect(await explodeSlider.inputValue()).toBe('50');

    // Verify part list rows render both parts
    const partRows = page.locator('[data-testid="part-item"]');
    await expect(partRows).toHaveCount(2);

    const baseRow = partRows.nth(0);
    const lidRow = partRows.nth(1);
    await expect(baseRow).toBeVisible();
    await expect(lidRow).toBeVisible();
    await expect(baseRow).toContainText('Base');
    await expect(lidRow).toContainText('Lid');

    // Test visibility toggle on Lid
    const lidEyeBtn = page
      .getByRole('button', { name: /Hide Lid|Show Lid/i })
      .first();
    await expect(lidEyeBtn).toBeVisible();
    await lidEyeBtn.click();

    // Test part isolation on Base
    const baseIsolateBtn = page
      .getByRole('button', { name: /Isolate Base/i })
      .first();
    await expect(baseIsolateBtn).toBeVisible();
    await baseIsolateBtn.click();

    // Verify single-part STL export button exists
    const exportBaseStlBtn = page
      .getByRole('button', { name: /Export Base as STL/i })
      .first();
    await expect(exportBaseStlBtn).toBeVisible();

    // Switch back to Parameters tab
    const paramsTab = page.getByRole('tab', { name: /Parameters/i }).first();
    await expect(paramsTab).toBeVisible();
    await paramsTab.click();

    // Verify parametric sliders (e.g. width) are visible
    await expect(page.locator('text=width').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('auto-detects multipart assembly from OpenSCAD modules when no explicit manifest is provided', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);

    // Seed conversation without manifest; parser should extract modules
    const convId = await seedAssemblyConversation(
      DEFAULT_TEST_USER.id,
      'Auto Inferred Assembly',
      AUTO_INFERRED_ASSEMBLY_SCAD,
    );

    await page.goto(`/cadam/editor/${convId}`);

    // Verify 3D canvas loads and compiles
    const canvasInfo = await inspectCanvas(page, 'canvas', 30000);
    expect(canvasInfo.exists).toBe(true);

    // The Parts & Assembly tab should still appear via auto-inference
    const assemblyTab = page
      .getByRole('tab', { name: /Parts & Assembly/i })
      .first();
    await expect(assemblyTab).toBeVisible({ timeout: 15000 });
    await assemblyTab.click();

    // Part items for inferred chassis and cover should exist
    const partRows = page.locator('[data-testid="part-item"]');
    await expect(partRows).toHaveCount(2);
    await expect(page.getByText(/Chassis/i).first()).toBeVisible();
    await expect(page.getByText(/Cover/i).first()).toBeVisible();
  });
});
