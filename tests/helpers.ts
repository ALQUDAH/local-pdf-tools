import { expect, type Page, type Download } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Creates a small multi-page PDF on disk. No real documents are ever used in tests. */
export async function makePdf(pages = 3, name = `fixture-${pages}p.pdf`): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    doc.addPage([595, 842]).drawText(`Test page ${i}`, { x: 50, y: 760, size: 28, font });
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-')), name);
  fs.writeFileSync(file, await doc.save());
  return file;
}

/** Fails the test if any request leaves localhost: the core privacy promise. */
export function trackExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.protocol.startsWith('blob') && !url.protocol.startsWith('data')) {
      external.push(req.url());
    }
  });
  return external;
}

export async function openTool(page: Page, title: string) {
  await page.goto('/');
  await page.getByText(title, { exact: true }).first().click();
  await expect(page.getByText('Back to Dashboard')).toBeVisible();
}

/**
 * Clicks the tool's action button and returns the resulting download.
 * Some tools download immediately, others show a separate "Download" button first.
 */
export async function runAndDownload(page: Page, action: RegExp): Promise<Download> {
  const first = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await page.getByRole('button', { name: action }).last().click();
  let download = await first;
  if (!download) {
    const second = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: /download/i }).first().click();
    download = await second;
  }
  return download;
}

export async function loadDownloadedPdf(download: Download) {
  const file = await download.path();
  expect(file, 'download should be saved').toBeTruthy();
  return PDFDocument.load(fs.readFileSync(file!), { ignoreEncryption: true });
}

/** Runs qpdf (WASM) in Node: used to create and verify encrypted fixtures. */
async function qpdf(args: string[], input: Uint8Array): Promise<Uint8Array | null> {
  const require = createRequire(import.meta.url);
  const createModule = require('@neslinesli93/qpdf-wasm');
  const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
  const q = await createModule({ locateFile: () => wasm });
  q.FS.writeFile('/in.pdf', input);
  try {
    q.callMain([...args, '/in.pdf', '/out.pdf']);
    return q.FS.readFile('/out.pdf');
  } catch {
    return null;
  }
}

/** Creates a standard AES-256 password-protected PDF. */
export async function makeEncryptedPdf(password: string): Promise<string> {
  const out = await qpdf(['--encrypt', password, password, '256', '--'], fs.readFileSync(await makePdf(3)));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-')), 'locked.pdf');
  fs.writeFileSync(file, out!);
  return file;
}

/** Decrypts a downloaded PDF with the given password; null if the password is wrong. */
export async function decryptDownload(download: Download, password: string): Promise<PDFDocument | null> {
  const bytes = fs.readFileSync((await download.path())!);
  const out = await qpdf([`--password=${password}`, '--decrypt'], bytes);
  return out ? PDFDocument.load(out) : null;
}
