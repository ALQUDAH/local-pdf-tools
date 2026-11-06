import { test, expect } from '@playwright/test';
import { makePdf, makeEncryptedPdf, decryptDownload, openTool, runAndDownload, loadDownloadedPdf, trackExternalRequests } from './helpers';

let threePages: string;
let onePage: string;

test.beforeAll(async () => {
  threePages = await makePdf(3);
  onePage = await makePdf(1);
});

test('Merge combines files', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Merge PDF');
  await page.locator('input[type=file]').first().setInputFiles([threePages, onePage]);
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /^Merge 2 PDFs/));
  expect(pdf.getPageCount()).toBe(4);
  expect(external).toEqual([]);
});

test('Split extracts pages', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Split PDF');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  await page.getByRole('button', { name: 'Odd Pages Only' }).click();
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /^Extract Selected Pages/));
  expect(pdf.getPageCount()).toBe(2);
  expect(external).toEqual([]);
});

test('Rotate rotates every page', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Rotate PDF');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  await page.getByRole('button', { name: 'Rotate File CW' }).click();
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /Apply Rotations/));
  expect(pdf.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 90]);
  expect(external).toEqual([]);
});

test('Compress produces a valid PDF', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Compress PDF');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /Run In-Browser Compression/));
  expect(pdf.getPageCount()).toBe(3);
  expect(external).toEqual([]);
});

test('Add Page Numbers keeps all pages', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Add Page Numbers');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /Add Page Numbers to PDF/));
  expect(pdf.getPageCount()).toBe(3);
  expect(external).toEqual([]);
});

test('Watermark keeps all pages', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Watermark PDF');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /Apply Watermark/));
  expect(pdf.getPageCount()).toBe(3);
  expect(external).toEqual([]);
});

test('Protect encrypts the file', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Protect PDF');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  await page.locator('input[type=password]').first().fill('s3cret-pass');
  const confirm = page.locator('input[type=password]').nth(1);
  if (await confirm.count()) await confirm.fill('s3cret-pass');
  const download = await runAndDownload(page, /Encrypt PDF File/);
  // A real encrypted PDF: wrong password fails, right password opens all pages
  expect(await decryptDownload(download, 'wrong')).toBeNull();
  const pdf = await decryptDownload(download, 's3cret-pass');
  expect(pdf?.getPageCount()).toBe(3);
  expect(external).toEqual([]);
});

test('Unlock removes a standard PDF password', async ({ page }) => {
  const external = trackExternalRequests(page);
  const locked = await makeEncryptedPdf('open-sesame');
  await openTool(page, 'Unlock PDF');
  await page.locator('input[type=file]').first().setInputFiles(locked);
  await page.locator('input[type=password]').first().fill('open-sesame');
  const pdf = await loadDownloadedPdf(await runAndDownload(page, /Unlock PDF File/));
  expect(pdf.isEncrypted).toBe(false);
  expect(pdf.getPageCount()).toBe(3);
  expect(external).toEqual([]);
});

test('Unlock reports a wrong password', async ({ page }) => {
  const locked = await makeEncryptedPdf('right-one');
  await openTool(page, 'Unlock PDF');
  await page.locator('input[type=file]').first().setInputFiles(locked);
  await page.locator('input[type=password]').first().fill('wrong-one');
  await page.getByRole('button', { name: /Unlock PDF File/ }).click();
  await expect(page.getByText('Incorrect password')).toBeVisible();
});

test('OCR recognizes text using the self-hosted Tesseract engine', async ({ page }) => {
  test.slow(); // downloads the English language model (~3 MB) on first run
  const engine: string[] = [];
  page.on('request', (req) => {
    if (/tesseract.*\.js$/.test(req.url())) engine.push(new URL(req.url()).host);
  });
  await openTool(page, 'Optical Character Scanning (OCR)');
  await page.locator('input[type=file]').first().setInputFiles(threePages);
  await page.getByRole('button', { name: /Start Optical Scan/ }).click();
  await expect(page.getByText('characters recognized')).toHaveCount(3, { timeout: 120_000 });
  // Worker and WASM engine must come from the app, not a CDN
  expect(engine.length).toBeGreaterThan(0);
  expect(new Set(engine)).toEqual(new Set([new URL(page.url()).host]));
});
