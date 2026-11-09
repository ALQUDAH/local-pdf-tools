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
