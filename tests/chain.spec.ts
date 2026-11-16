import { test, expect } from '@playwright/test';
import { makePdf, openTool, runAndDownload, loadDownloadedPdf, trackExternalRequests } from './helpers';

test('chain Merge → Compress → Protect without re-uploading', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Merge PDF');
  await page.locator('input[type=file]').first().setInputFiles([await makePdf(2), await makePdf(1)]);
  await runAndDownload(page, /^Merge 2 PDFs/);

  // The result is offered to the next tool
  const bar = page.locator('#continue-bar');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: /Compress PDF/ }).click();

  // Compress opens with the merged file already loaded
  await expect(page.getByRole('button', { name: /Run In-Browser Compression/ })).toBeVisible();
  const compressed = await loadDownloadedPdf(await runAndDownload(page, /Run In-Browser Compression/));
  expect(compressed.getPageCount()).toBe(3);

  // ...and on to Protect
  await page.locator('#continue-bar').getByRole('button', { name: /Protect PDF/ }).click();
  await expect(page.locator('input[type=password]').first()).toBeVisible();
  expect(external).toEqual([]);
});

test('continue bar can be dismissed and is hidden on the dashboard', async ({ page }) => {
  await openTool(page, 'Rotate PDF');
  await page.locator('input[type=file]').first().setInputFiles(await makePdf(1));
  await runAndDownload(page, /Apply Rotations/);
  await expect(page.locator('#continue-bar')).toBeVisible();
  await page.getByText('Back to Dashboard').first().click();
  await expect(page.locator('#continue-bar')).toHaveCount(0);
  await page.locator('#card-compress').click();
  await expect(page.locator('#continue-bar')).toBeVisible();
  await page.locator('#continue-bar').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#continue-bar')).toHaveCount(0);
});
