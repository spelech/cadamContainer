import { test, expect } from '@playwright/test';
import {
  authenticateBrowserContext,
  cleanupTestUserConversations,
} from './helpers/auth.js';
import { inspectCanvas } from './helpers/canvas.js';

test.describe('OpenSCAD WASM & Three.js 3D Viewport', () => {
  test.afterEach(async () => {
    await cleanupTestUserConversations();
  });

  test('compiles OpenSCAD in web worker and renders into Three.js canvas', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Submit a prompt that triggers parametric OpenSCAD generation
    await textarea.fill(
      'A simple 15mm cylindrical standoff with a 4mm through-hole',
    );
    const submitBtn = page.locator('button:has(svg.lucide-arrow-up)').first();
    await submitBtn.click();

    // Verify compilation error is not present
    await expect(page.locator('text=Error Compiling Model')).not.toBeVisible({
      timeout: 30000,
    });

    // The canvas should be rendered in the viewport preview pane
    const canvasInfo = await inspectCanvas(page, 'canvas', 40000);
    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.hasWebGL).toBe(true);
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);

    // Verify 3D viewport controls or camera projection switch exist
    const viewportControl = page
      .locator('button[role="switch"], canvas')
      .first();
    await expect(viewportControl).toBeVisible({ timeout: 20000 });
  });
});
