import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument } from 'pdf-lib';
import { makePdf, trackExternalRequests } from './helpers';

// Office conversions run in the browser: these tests use the static build with no server.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-office-'));

async function makeDocx(): Promise<string> {
  const doc = new Document({ sections: [{ children: [new Paragraph('Hello from Word'), new Paragraph('Second paragraph')] }] });
  const file = path.join(tmp(), 'sample.docx');
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  return file;
}

async function makeXlsx(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Prices');
  ws.addRow(['Item', 'Price']);
  ws.addRow(['Apples', 3]);
  const file = path.join(tmp(), 'sample.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

async function makePptx(): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.addSlide().addText('Hello from slides', { x: 1, y: 1 });
  pptx.addSlide().addText('Second slide', { x: 1, y: 1 });
  const file = path.join(tmp(), 'sample.pptx');
  fs.writeFileSync(file, (await pptx.write({ outputType: 'nodebuffer' })) as Buffer);
  return file;
}

async function convert(page: Page, cardId: string, file: string | null): Promise<Buffer> {
  await page.goto('/');
  await page.locator(`#card-${cardId}`).click();
  if (file) await page.locator('input[type=file]').first().setInputFiles(file);
  await page.getByRole('button', { name: /Start conversion/ }).click();
  await expect(page.getByText(/Processed Successfully/i)).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download converted file/ }).click();
  return fs.readFileSync((await (await download).path())!);
}

const zipText = async (buf: Buffer, pattern: RegExp) => {
  const zip = await JSZip.loadAsync(buf);
  const texts = await Promise.all(Object.keys(zip.files).filter((n) => pattern.test(n)).map((n) => zip.files[n].async('text')));
  return texts.join('\n');
};

test('PDF to Word', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'pdftoword', await makePdf(2));
  expect(await zipText(out, /word\/document\.xml/)).toContain('Test page 2');
  expect(external).toEqual([]);
});

test('PDF to PowerPoint', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'pdftopowerpoint', await makePdf(2));
  const slides = await zipText(out, /ppt\/slides\/slide\d+\.xml/);
  expect(slides).toContain('Test page 1');
  expect(slides).toContain('Test page 2');
  expect(external).toEqual([]);
});

test('PDF to Excel', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'pdftoexcel', await makePdf(1));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(out as unknown as ArrayBuffer);
  expect(wb.worksheets[0].getCell('A1').text).toContain('Test page 1');
  expect(external).toEqual([]);
});

test('Word to PDF', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'wordtopdf', await makeDocx());
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  expect(external).toEqual([]);
});

test('PowerPoint to PDF', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'powerpointtopdf', await makePptx());
  expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  expect(external).toEqual([]);
});

test('Excel to PDF', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'exceltopdf', await makeXlsx());
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  expect(external).toEqual([]);
});

test('HTML code to PDF', async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto('/');
  await page.locator('#card-htmltopdf').click();
  await page.getByRole('button', { name: 'HTML Editor code' }).click();
  await page.getByRole('button', { name: /Start conversion/ }).click();
  await expect(page.getByText(/Processed Successfully/i)).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download converted file/ }).click();
  const out = fs.readFileSync((await (await download).path())!);
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  expect(external).toEqual([]);
});

test('HTML by URL still explains it needs the server', async ({ page }) => {
  await page.goto('/');
  await page.locator('#card-htmltopdf').click();
  await expect(page.getByRole('alert')).toContainText('companion server');
});

test('PDF to PDF/A adds archival metadata and color profile', async ({ page }) => {
  const external = trackExternalRequests(page);
  const out = await convert(page, 'pdftopdfa', await makePdf(2));
  const raw = out.toString('latin1');
  expect(raw).toContain('<pdfaid:part>2</pdfaid:part>');
  expect(raw).toContain('/OutputIntents');
  expect(raw).toContain('/GTS_PDFA1');
  expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  expect(external).toEqual([]);
});
