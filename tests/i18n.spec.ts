import { test, expect } from '@playwright/test';

test.describe('Arabic', () => {
  test.use({ locale: 'ar-JO' });

  test('uses Arabic and right-to-left layout for Arabic browsers', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('#card-merge')).toContainText('دمج PDF');
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

test.describe('Arabic tool screens', () => {
  test.use({ locale: 'ar-JO' });

  const tools: Array<[string, string]> = [
    ['merge', 'دمج ملفات PDF'],
    ['split', 'تقسيم صفحات PDF'],
    ['compress', 'ضغط حجم PDF'],
    ['protect', 'أدوات حماية PDF'],
    ['ocr', 'التعرّف الضوئي على النصوص (OCR)'],
    ['sign', 'التوقيع الإلكتروني'],
    ['watermark', 'علامة مائية على PDF'],
    ['redact', 'الحجب الدائم'],
  ];

  for (const [id, heading] of tools) {
    test(`${id} is translated and right-to-left`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await page.locator(`#card-${id}`).click();
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'العودة إلى الأدوات' }).first()).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(errors).toEqual([]);
    });
  }
});

test('switching language updates an open tool screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#card-merge').click();
  await expect(page.getByText('Merge PDF Files')).toBeVisible();
  await page.locator('#btn-language').click();
  await expect(page.getByText('دمج ملفات PDF')).toBeVisible();
  await page.locator('#btn-language').click();
  await expect(page.getByText('Merge PDF Files')).toBeVisible();
});
