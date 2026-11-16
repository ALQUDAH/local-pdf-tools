import { test, expect } from '@playwright/test';
import { makePdf, runAndDownload, loadDownloadedPdf, trackExternalRequests } from './helpers';

test('run the "Merge, compress & protect" workflow end to end', async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto('/');
  await page.locator('[data-workflow="preset-merge-compress-protect"]').getByRole('button', { name: 'Start workflow' }).click();

  // Step 1: Merge
  await expect(page.locator('#workflow-progress')).toContainText('Step 1 of 3');
  await page.locator('input[type=file]').first().setInputFiles([await makePdf(2), await makePdf(2)]);
  await runAndDownload(page, /^Merge 2 PDFs/);
  await expect(page.locator('#continue-bar')).toContainText('Step 1 of 3 done.');

  // Step 2: Compress, with the merged file already loaded
  await page.locator('#continue-bar').getByRole('button', { name: /Next: Compress PDF/ }).click();
  await expect(page.locator('#workflow-progress')).toContainText('Step 2 of 3');
  const compressed = await loadDownloadedPdf(await runAndDownload(page, /Run In-Browser Compression/));
  expect(compressed.getPageCount()).toBe(4);

  // Step 3: Protect
  await page.locator('#continue-bar').getByRole('button', { name: /Next: Protect PDF/ }).click();
  await expect(page.locator('#workflow-progress')).toContainText('Step 3 of 3');
  await page.locator('input[type=password]').first().fill('workflow-pass');
  await runAndDownload(page, /Encrypt PDF File/);
  await expect(page.locator('#continue-bar')).toContainText('Workflow complete');
  await page.locator('#continue-bar').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#continue-bar')).toHaveCount(0);
  await expect(page.locator('#workflow-progress')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('create a custom workflow; it is saved in the browser and can be deleted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create workflow' }).click();
  const builder = page.locator('#workflow-builder');
  await builder.getByPlaceholder('Workflow name').fill('Monthly report');
  await expect(builder.getByRole('button', { name: 'Save workflow' })).toBeDisabled();
  await builder.getByRole('button', { name: '+ Add Page Numbers' }).click();
  await builder.getByRole('button', { name: '+ Protect PDF' }).click();
  await builder.getByRole('button', { name: 'Save workflow' }).click();

  await page.reload();
  const card = page.locator('[data-workflow^="wf-"]', { hasText: 'Monthly report' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Start workflow' }).click();
  await expect(page.locator('#workflow-progress')).toContainText('Step 1 of 2');

  await page.getByText('Back to Dashboard').first().click();
  await expect(page.locator('#workflow-progress')).toHaveCount(0);
  await page.locator('[data-workflow^="wf-"]', { hasText: 'Monthly report' }).getByRole('button', { name: 'Delete workflow' }).click();
  await expect(page.locator('[data-workflow^="wf-"]')).toHaveCount(0);
});

test('stopping a workflow returns to normal chaining', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-workflow="preset-clean-scan"]').getByRole('button', { name: 'Start workflow' }).click();
  await page.locator('input[type=file]').first().setInputFiles(await makePdf(1));
  await runAndDownload(page, /Apply Rotations/);
  await page.locator('#continue-bar').getByRole('button', { name: 'Stop workflow' }).click();
  await expect(page.locator('#workflow-progress')).toHaveCount(0);
  await expect(page.locator('#continue-bar')).toContainText('Continue with:');
});
