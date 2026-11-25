import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { decryptBytes, makeEncryptedPdf, makePdf, openTool, trackExternalRequests } from './helpers';

let a: string;
let b: string;
let c: string;

test.beforeAll(async () => {
  a = await makePdf(2, 'batch-a.pdf');
  b = await makePdf(3, 'batch-b.pdf');
  c = await makePdf(1, 'batch-c.pdf');
});

async function setSteps(page, kinds: string[]) {
  // Start from an empty list (the tool remembers the last steps)
  while ((await page.locator('#batch-steps li').count()) > 0) {
    await page.locator('#batch-steps li').first().getByRole('button', { name: 'Remove step' }).click();
  }
  for (const k of kinds) await page.getByRole('button', { name: k, exact: true }).click();
}

test('Batch runs every step on every file and zips the results', async ({ page }) => {
  const external = trackExternalRequests(page);
  await openTool(page, 'Batch Processing');
  await page.locator('input[type=file]').first().setInputFiles([a, b, c]);
  await setSteps(page, ['Rotate all pages', 'Page numbers', 'Password-protect']);
  await page.getByLabel('Passphrase to Encrypt PDF').fill('s3cret');
  await page.getByRole('button', { name: /^Process 3 files/ }).click();
  await expect(page.locator('#batch-results')).toContainText('3 processed, 0 failed', { timeout: 60_000 });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download all as ZIP' }).click()]);
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  const names = Object.keys(zip.files).sort();
  expect(names).toEqual(['batch-a_processed.pdf', 'batch-b_processed.pdf', 'batch-c_processed.pdf']);

  const expected = { 'batch-a_processed.pdf': 2, 'batch-b_processed.pdf': 3, 'batch-c_processed.pdf': 1 };
  for (const name of names) {
    const bytes = await zip.file(name)!.async('uint8array');
    expect(await decryptBytes(bytes, 'wrong')).toBeNull();
    const pdf = await decryptBytes(bytes, 's3cret');
    expect(pdf).not.toBeNull();
    expect(pdf!.getPageCount()).toBe(expected[name]);
    expect(pdf!.getPages().every((p) => p.getRotation().angle === 90)).toBe(true);
  }
  expect(external).toEqual([]);
});

test('Batch can merge everything first', async ({ page }) => {
  await openTool(page, 'Batch Processing');
  await page.locator('input[type=file]').first().setInputFiles([a, b, c]);
  await setSteps(page, ['Watermark']);
  await page.locator('#batch-merge-first').check();
  await page.getByRole('button', { name: /^Process 1 files/ }).click();
  await expect(page.locator('#batch-results')).toContainText('1 processed, 0 failed', { timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#batch-results').getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('merged_processed.pdf');
  const pdf = await PDFDocument.load(fs.readFileSync((await download.path())!));
  expect(pdf.getPageCount()).toBe(6);
});

test('Batch skips password-protected files and processes the rest', async ({ page }) => {
  const locked = await makeEncryptedPdf('x');
  await openTool(page, 'Batch Processing');
  await page.locator('input[type=file]').first().setInputFiles([a, locked]);
  await setSteps(page, ['Compress']);
  await page.getByRole('button', { name: /^Process 2 files/ }).click();
  await expect(page.locator('#batch-results')).toContainText('1 processed, 1 failed', { timeout: 60_000 });
  await expect(page.locator('#batch-results')).toContainText('Password-protected: unlock it first');
});

test('Batch blocks a protection step that is not last', async ({ page }) => {
  await openTool(page, 'Batch Processing');
  await page.locator('input[type=file]').first().setInputFiles([a]);
  await setSteps(page, ['Password-protect', 'Compress']);
  await expect(page.getByRole('alert')).toContainText('Password protection must be the last step.');
  await expect(page.getByRole('button', { name: /^Process 1 files/ })).toBeDisabled();
});
