import { test, expect } from '@playwright/test';
import { authenticateBrowserContext } from './helpers/auth.js';

const SAMPLE_STL = `solid cube
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 25 0 10
      vertex 25 25 10
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 10
      vertex 25 25 10
      vertex 0 25 10
    endloop
  endfacet
endsolid cube
`;

test.describe('CAD Reference Model Attachment & Overlay', () => {
  test('attaches reference STL and renders feature pill with exact dimensions and assembly toggle', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Trigger file upload via filechooser event
    const fileChooserPromise = page.waitForEvent('filechooser');
    const attachBtn = page.locator(
      'button[aria-label="Attach file or CAD reference model"]',
    );
    await expect(attachBtn).toBeVisible();
    await attachBtn.click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'mounting_plate.stl',
      mimeType: 'model/stl',
      buffer: Buffer.from(SAMPLE_STL, 'utf-8'),
    });

    // Reference pill should appear
    const pill = page.locator('[data-testid="cad-reference-pill"]');
    await expect(pill).toBeVisible({ timeout: 10000 });
    await expect(pill).toContainText('mounting_plate.stl');
    await expect(pill).toContainText('STL');

    // Assert computed bounding box dimensions
    await expect(pill).toContainText('25.0 × 25.0 × 0.0 mm');

    // Verify include in assembly checkbox is interactable
    const assemblyCheckbox = pill.locator('input[type="checkbox"]');
    await expect(assemblyCheckbox).toBeVisible();
    await assemblyCheckbox.check();
    await expect(assemblyCheckbox).toBeChecked();
  });
});
