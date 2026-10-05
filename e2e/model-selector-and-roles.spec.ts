import { test, expect } from '@playwright/test';
import { authenticateBrowserContext } from './helpers/auth.js';

test.describe('Model Selector and Generation Modes', () => {
  test('allows selecting different AI models from dropdown', async ({
    page,
    context,
  }) => {
    await authenticateBrowserContext(context);
    await page.goto('/cadam/');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // Find the model selector trigger button (next to textarea or toolbar)
    const modelSelectorTrigger = page
      .locator('button:has(svg.lucide-chevron-down)')
      .first();
    await expect(modelSelectorTrigger).toBeVisible();

    // Click to open dropdown
    await modelSelectorTrigger.click();

    // Verify dropdown menu content is visible
    const dropdownContent = page.locator(
      '[role="menu"], [data-radix-menu-content]',
    );
    await expect(dropdownContent).toBeVisible();

    // Ensure multiple models or menu items are present
    const menuItems = dropdownContent.locator('[role="menuitem"]');
    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);

    // Click the first available item
    await menuItems.first().click();

    // Dropdown should close
    await expect(dropdownContent).not.toBeVisible();
  });
});
