import { test, expect } from '@playwright/test';
test.describe('UI Functionality Tests', () => {
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SWU Deck Viewer/);
    await page.click('a:has-text("Deck Comparison")');
    await expect(page).toHaveURL(/compare\.html/);
    await page.click('a:has-text("Settings")');
    await expect(page).toHaveURL(/settings\.html/);
    await page.click('a:has-text("Deck Viewer")');
    const url = page.url();
    expect(url).toMatch(/\/(index\.html)?$/);
  });
  test('should have deck input on index page', async ({ page }) => {
    await page.goto('/');
    const deckInput = page.locator('#deckUrl');
    const loadButton = page.locator('button:has-text("Load Deck")');
    await expect(deckInput).toBeVisible();
    await expect(loadButton).toBeVisible();
  });
  test('compare page - inputs exist', async ({ page }) => {
    await page.goto('/compare.html');
    await expect(page.locator('#deck1Url')).toBeVisible();
    await expect(page.locator('#deck2Url')).toBeVisible();
    await expect(page.locator('button:has-text("Load Deck 1")')).toBeVisible();
    await expect(page.locator('button:has-text("Load Deck 2")')).toBeVisible();
  });
  test('compare page - reverse button exists', async ({ page }) => {
    await page.goto('/compare.html');
    await expect(page.locator('button:has-text("Reverse Order")')).toBeVisible();
  });
  test('settings page - controls visible', async ({ page }) => {
    await page.goto('/settings.html');
    await expect(page.locator('#useDirectFetch')).toBeVisible();
    await expect(page.locator('button:has-text("Test SWUDB")')).toBeVisible();
  });
  test('all pages have navigation', async ({ page }) => {
    for (const url of ['/', '/compare.html', '/settings.html']) {
      await page.goto(url);
      const nav = page.locator('.navigation');
      await expect(nav).toBeVisible();
      const navLinks = nav.locator('a');
      await expect(navLinks.first()).toBeVisible();
    }
  });
  test('css stylesheet loaded', async ({ page }) => {
    await page.goto('/');
    const cssLoaded = await page.evaluate(() => {
      for (let i = 0; i < document.styleSheets.length; i++) {
        if (document.styleSheets[i].href?.includes('styles.css')) return true;
      }
      return false;
    });
    expect(cssLoaded).toBe(true);
  });
  test('shared functions available', async ({ page }) => {
    await page.goto('/');
    const hasFunctions = await page.evaluate(() => {
      return typeof window.getDeckIdFromUrl === 'function' &&
             typeof window.buildDeckCardCounts === 'function' &&
             typeof window.fetchWithRetry === 'function';
    });
    expect(hasFunctions).toBe(true);
  });
});
