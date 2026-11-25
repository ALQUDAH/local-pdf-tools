import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { trackExternalRequests } from './helpers';

// Page 1 has a secret where the default redaction box lands (15% from left/top); page 2 is public.
async function makeRedactionFixture(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('SECRET-ACCOUNT-123456', { x: 100, y: 670, size: 14, font });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('PUBLIC-PAGE-TEXT', { x: 100, y: 670, size: 14, font });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-redact-')), 'contract.pdf');
  fs.writeFileSync(file, await doc.save());
  return file;
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return texts;
}

test('redacted text is really removed, other pages keep their text', async ({ page }) => {
  const external = trackExternalRequests(page);
  const fixture = await makeRedactionFixture();
  expect((await pageTexts(new Uint8Array(fs.readFileSync(fixture))))[0]).toContain('SECRET-ACCOUNT-123456'); // sanity

  await page.goto('/');
  await page.locator('#card-redact').click();
  await page.locator('input[type=file]').first().setInputFiles(fixture);
  await page.getByRole('button', { name: /Add Default Box/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Sanitize & Download PDF/ }).click();
  const bytes = new Uint8Array(fs.readFileSync((await (await download).path())!));

  const [p1, p2] = await pageTexts(bytes);
  expect(p1).not.toContain('SECRET');
  expect(p1.trim()).toBe(''); // the whole redacted page is an image now
  expect(p2).toContain('PUBLIC-PAGE-TEXT');
  expect(external).toEqual([]);
});

test('if a page cannot be rasterized, redaction fails loudly and nothing is downloaded', async ({ page }) => {
  // Simulate the browser refusing a large canvas (memory / size limits in Safari and Firefox)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if ((window as unknown as { __failRedactCanvas?: boolean }).__failRedactCanvas && this.width > 1200) return null;
      return (original as any).apply(this, args);
    };
  });
  const fixture = await makeRedactionFixture();
  await page.goto('/');
  await page.locator('#card-redact').click();
  await page.locator('input[type=file]').first().setInputFiles(fixture);
  await page.getByRole('button', { name: /Add Default Box/ }).click();

  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  const dialog = page.waitForEvent('dialog');
  await page.evaluate(() => ((window as unknown as { __failRedactCanvas: boolean }).__failRedactCanvas = true));
  await page.getByRole('button', { name: /Sanitize & Download PDF/ }).click();
  const d = await dialog;
  expect(d.message()).toMatch(/could not prepare page 1 for permanent redaction/);
  await d.dismiss();
  await page.waitForTimeout(1500);
  expect(downloaded).toBe(false);
  await expect(page.getByText('Sanitized PDF saved!')).toHaveCount(0);
});
