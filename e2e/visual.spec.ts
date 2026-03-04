import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('index page layout should match snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('index-page.png', {
      fullPage: true,
    });
  });

  test('compare page layout should match snapshot', async ({ page }) => {
    await page.goto('/compare.html');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('compare-page.png', {
      fullPage: true,
    });
  });

  test('settings page layout should match snapshot', async ({ page }) => {
    await page.goto('/settings.html');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('settings-page.png', {
      fullPage: true,
    });
  });

  test('index page header should be visible', async ({ page }) => {
    await page.goto('/');

    const title = page.locator('h1');
    await expect(title).toBeVisible();
    await expect(title).toContainText('SWU Deck Viewer');

    await expect(title).toHaveScreenshot('header.png');
  });

  test('compare page inputs should be visible', async ({ page }) => {
    await page.goto('/compare.html');

    const deck1Input = page.locator('#deck1Url');
    const deck2Input = page.locator('#deck2Url');
    const loadBtn1 = page.locator('button:has-text("Load Deck 1")');
    const loadBtn2 = page.locator('button:has-text("Load Deck 2")');

    await expect(deck1Input).toBeVisible();
    await expect(deck2Input).toBeVisible();
    await expect(loadBtn1).toBeVisible();
    await expect(loadBtn2).toBeVisible();
  });

  test('settings page controls should be visible', async ({ page }) => {
    await page.goto('/settings.html');

    const checkbox = page.locator('#useDirectFetch');
    const testButton = page.locator('button:has-text("Test SWUDB")');

    await expect(checkbox).toBeVisible();
    await expect(testButton).toBeVisible();
  });

  test('navigation links should be present on all pages', async ({ page }) => {
    await page.goto('/');

    const deckViewerLink = page.locator('a:has-text("Deck Viewer")');
    const comparisonLink = page.locator('a:has-text("Deck Comparison")');
    const settingsLink = page.locator('a:has-text("Settings")');

    await expect(deckViewerLink).toBeVisible();
    await expect(comparisonLink).toBeVisible();
    await expect(settingsLink).toBeVisible();

    const navigation = page.locator('.navigation');
    await expect(navigation).toHaveScreenshot('navigation.png');
  });

  test('deck input form should be visible', async ({ page }) => {
    await page.goto('/');

    const deckInput = page.locator('#deckUrl');
    const loadButton = page.locator('button:has-text("Load Deck")');

    await expect(deckInput).toBeVisible();
    await expect(loadButton).toBeVisible();
  });

  test('compare page reverse button should be visible', async ({ page }) => {
    await page.goto('/compare.html');

    const reverseBtn = page.locator('button:has-text("Reverse Order")');
    await expect(reverseBtn).toBeVisible();
  });

  test('responsive design - mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const title = page.locator('h1');
    await expect(title).toBeVisible();

    await expect(page).toHaveScreenshot('index-mobile.png', {
      fullPage: true,
    });
  });

  test('responsive design - tablet view', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/compare.html');
    await page.waitForLoadState('networkidle');

    const inputs = page.locator('input[type="text"]');
    await expect(inputs.first()).toBeVisible();

    await expect(page).toHaveScreenshot('compare-tablet.png', {
      fullPage: true,
    });
  });

  test('all pages should have proper structure', async ({ page }) => {
    const pages = ['/', '/compare.html', '/settings.html'];

    for (const pagePath of pages) {
      await page.goto(pagePath);

      const body = page.locator('body');
      const heading = page.locator('h1');
      const nav = page.locator('.navigation');

      await expect(body).toBeAttached();
      await expect(heading).toBeVisible();
      await expect(nav).toBeVisible();
    }
  });
});

