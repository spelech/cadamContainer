import { test, expect } from '@playwright/test';
import {
  authenticateBrowserContext,
  cleanupTestUserConversations,
} from './helpers/auth.js';

test.describe('Authentication and Chat Interface', () => {
  test.afterEach(async () => {
    await cleanupTestUserConversations();
  });

  test('authenticates seamlessly via session cookie and loads main prompt view', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    // Textarea should be present and enabled
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });
    await expect(textarea).toBeEnabled();
  });

  test('submitting prompt renders immediate assistant loading bubble and completes generation', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Type prompt
    await textarea.fill(
      'Create a solid 20mm calibration cube with rounded corners',
    );

    // Find submit button or press Enter
    const submitBtn = page.locator('button:has(svg.lucide-arrow-up)').first();
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify immediate appearance of the loading indicator
    const loadingBubble = page
      .locator('[data-testid="assistant-loading-bubble"]')
      .or(page.getByText('Generating with Adam'))
      .first();
    await expect(loadingBubble).toBeVisible({ timeout: 15000 });

    // Wait for generation to complete: loading indicator disappears
    await expect(loadingBubble).not.toBeVisible({ timeout: 50000 });

    // Verify assistant produced output
    const completedOutput = page
      .locator(
        'button[aria-label*="code" i], button:has-text("Show code"), button:has-text("Hide code"), button:has-text("Calibration Cube")',
      )
      .first();
    await expect(completedOutput).toBeVisible({ timeout: 15000 });
  });
});
