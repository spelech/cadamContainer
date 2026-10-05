import { test, expect } from '@playwright/test';
import { authenticateBrowserContext } from './helpers/auth.js';

test.describe('Mobile Viewport & Responsive Layout', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14 / modern mobile viewport
    isMobile: true,
    hasTouch: true,
  });

  test('renders responsive mobile chat layout and shows floating generation pill on submit', async ({
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

    // Check that either the mobile generating pill or assistant loading bubble is displayed
    const mobileIndicator = page.locator(
      '[data-testid="mobile-generating-pill"], [data-testid="assistant-loading-bubble"]',
    );
    await expect(mobileIndicator.first()).toBeVisible({ timeout: 15000 });
  });
});
