import { test, expect } from '@playwright/test';
import {
  authenticateBrowserContext,
  cleanupTestUserConversations,
} from './helpers/auth.js';

test.describe('Mobile Viewport & Responsive Layout', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14 / modern mobile viewport
    isMobile: true,
    hasTouch: true,
  });

  test.afterEach(async () => {
    await cleanupTestUserConversations();
  });

  test('renders responsive mobile chat layout, shows generation pill, and manages 3D preview sheet', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Submit a prompt
    await textarea.fill('A cylindrical spacer 10mm high and 8mm diameter');
    const submitBtn = page.locator('button:has(svg.lucide-arrow-up)').first();
    await submitBtn.click();

    // Check that the generation indicator appears on mobile
    const mobileIndicator = page.locator(
      '[data-testid="mobile-generating-pill"], [data-testid="assistant-loading-bubble"]',
    );
    await expect(mobileIndicator.first()).toBeVisible({ timeout: 15000 });

    // The mobile preview sheet automatically opens with the generated model
    const mobileSheet = page.locator('[role="dialog"], [data-state="open"]');
    await expect(mobileSheet.first()).toBeVisible({ timeout: 45000 });

    // Closing the sheet reveals the floating View 3D button
    const closeBtn = page
      .locator(
        'button[aria-label="Close preview"], button:has-text("Close preview")',
      )
      .first();
    await expect(closeBtn).toBeVisible({ timeout: 10000 });
    await closeBtn.click();

    // The floating View 3D button is now visible
    const view3dBtn = page.locator('[data-testid="mobile-view-3d-button"]');
    await expect(view3dBtn).toBeVisible({ timeout: 10000 });
  });
});
