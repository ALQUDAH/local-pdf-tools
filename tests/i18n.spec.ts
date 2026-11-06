import { test, expect } from '@playwright/test';

test.describe('Arabic', () => {
  test.use({ locale: 'ar-JO' });

  test('uses Arabic and right-to-left layout for Arabic browsers', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByText('دمج PDF', { exact: true })).toBeVisible();
  });

  test('search works with Arabic and English terms', async ({ page }) => {
    await page.goto('/');
    const search = page.getByPlaceholder(/ابحث/);
    await search.fill('دمج');
    await expect(page.locator('#card-merge')).toBeVisible();
    await search.fill('rotate');
    await expect(page.locator('#card-rotate')).toBeVisible();
  });
});

test('language switch is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.locator('#btn-language').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('#btn-language').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
