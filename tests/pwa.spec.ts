import { test, expect } from '@playwright/test';
import { makePdf, runAndDownload, loadDownloadedPdf } from './helpers';

test('app is installable and works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  // Manifest is linked and valid
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(new URL(manifestHref!, page.url()).href)).json();
  expect(manifest.name).toBe('Local PDF Tools');
  expect(manifest.display).toBe('standalone');

  // Wait until the service worker controls the page (precache complete)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('40 tools').first()).toBeVisible();

  // A browser tool still works with no network at all
  await page.getByText('Merge PDF', { exact: true }).first().click();
  await page.locator('input[type=file]').first().setInputFiles([await makePdf(2), await makePdf(1)]);
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /^Merge 2 PDFs/));
  expect(pdf.getPageCount()).toBe(3);
});
