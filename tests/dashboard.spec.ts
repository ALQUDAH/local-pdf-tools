import { test, expect } from '@playwright/test';

test('dashboard lists all tools and search filters them', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Local PDF Tools/);
  await expect(page.getByText('40 tools').first()).toBeVisible();

  await page.getByPlaceholder(/Search 40\+ PDF tools/).fill('merge');
  await expect(page.getByText('Merge PDF', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Rotate PDF', { exact: true })).toHaveCount(0);
});

test('server-backed tools explain they need a server on static hosting', async ({ page }) => {
  await page.goto('/');
  await page.locator('#card-translatepdf').click();
  await expect(page.getByRole('alert')).toContainText('companion server');
  await expect(page.getByRole('button', { name: /Start conversion/i })).toBeDisabled();
});

test('performance metrics panel floats in the corner when opened', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Show Performance Metrics' }).click();
  const panel = page.getByText('Performance Metrics', { exact: true }).locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  // Stays in view while the page scrolls
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(300);
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(box!.y).toBeGreaterThan(viewport.height / 2);
});
