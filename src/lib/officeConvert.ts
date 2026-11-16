/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Office, HTML and PDF/A conversions that run entirely in the browser.
// These are text-based conversions: they keep the text and its order, not the
// original layout, fonts or images. Heavy libraries load only when needed.

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import './pdfjs';
import { sanitizeForWinAnsi } from './pdfUtils';

export interface ConversionResult {
  blob: Blob;
  /** True when some characters (e.g. Arabic, CJK) could not be drawn with the built-in PDF fonts */
  replacedCharacters?: boolean;
}

const A4: [number, number] = [595.27, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.27];

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Text drawn with the standard PDF fonts must be WinAnsi; remember when we had to replace characters. */
class SafeText {
  replaced = false;
  clean(text: string): string {
    const out = sanitizeForWinAnsi(text);
    if (out !== text) this.replaced = true;
    return out;
  }
}

function wrapText(text: string, width: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Writes paragraphs onto A4 pages, adding pages as needed. */
async function paragraphsToPdf(paragraphs: string[], title?: string): Promise<ConversionResult> {
  const safe = new SafeText();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  let y = height - margin;

  if (title) {
    page.drawText(safe.clean(title), { x: margin, y, size: 16, font: bold, color: rgb(0.12, 0.22, 0.45) });
    y -= 35;
  }

  for (const para of paragraphs) {
    const trimmed = safe.clean(para.trim());
    if (!trimmed) {
      y -= 12;
      continue;
    }
    for (const line of wrapText(trimmed, width - margin * 2, 11, font)) {
      if (y < margin + 20) {
        page = pdf.addPage(A4);
        y = height - margin;
      }
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 16;
    }
    y -= 8;
  }
  return { blob: new Blob([(await pdf.save()) as BlobPart], { type: MIME.pdf }), replacedCharacters: safe.replaced };
}

/** Extracts the text of every page, one string per page with line breaks kept. */
export async function extractPdfPages(data: ArrayBuffer): Promise<string[]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      lastY = y;
    }
    pages.push(text.trim());
  }
  await task.destroy();
  return pages;
}

// ---------------------------------------------------------------------------
// PDF -> Office
// ---------------------------------------------------------------------------

export async function pdfToWord(data: ArrayBuffer): Promise<ConversionResult> {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx');
  const pages = await extractPdfPages(data);
  const children = pages.flatMap((pageText, i) => {
    const paras = pageText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 24 })] }));
    if (i < pages.length - 1) paras.push(new Paragraph({ children: [new PageBreak()] }));
    return paras;
  });
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return { blob: await Packer.toBlob(doc) };
}

export async function pdfToPowerPoint(data: ArrayBuffer): Promise<ConversionResult> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pages = await extractPdfPages(data);
  const pptx = new PptxGenJS();
  if (pages.length === 0) {
    pptx.addSlide().addText('No text content found in the PDF', { x: 1, y: 1, fontSize: 16 });
  }
  pages.forEach((text, i) => {
    const slide = pptx.addSlide();
    slide.addText(`Page ${i + 1}`, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 22, bold: true, color: '2D3748' });
    slide.addText(text.replace(/\s+/g, ' ').slice(0, 1200) || ' ', {
      x: 0.5,
      y: 1.4,
      w: 9,
      h: 5,
      fontSize: 14,
      color: '4A5568',
      valign: 'top',
    });
  });
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { blob };
}

export async function pdfToExcel(data: ArrayBuffer): Promise<ConversionResult> {
  const ExcelJS = (await import('exceljs')).default;
  const pages = await extractPdfPages(data);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Converted Data');
  for (const page of pages) {
    for (const line of page.split('\n').map((l) => l.trim()).filter(Boolean)) {
      // Columns are guessed from runs of 2+ spaces or tabs
      sheet.addRow(line.split(/\s{2,}|\t/));
    }
  }
  sheet.columns.forEach((col) => {
    if (col) col.width = 18;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return { blob: new Blob([buffer], { type: MIME.xlsx }) };
}

// ---------------------------------------------------------------------------
// Office / HTML -> PDF
// ---------------------------------------------------------------------------

export async function wordToPdf(data: ArrayBuffer): Promise<ConversionResult> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return paragraphsToPdf((value || '').split('\n'));
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function powerPointToPdf(data: ArrayBuffer): Promise<ConversionResult> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const slides: { num: number; text: string }[] = [];
  for (const name of Object.keys(zip.files)) {
    const m = name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (!m) continue;
    const xml = await zip.files[name].async('text');
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => decodeXml(x[1])).join(' ').trim();
    slides.push({ num: Number(m[1]), text });
  }
  slides.sort((a, b) => a.num - b.num);

  const safe = new SafeText();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (slides.length === 0) {
    pdf.addPage(A4_LANDSCAPE).drawText('No slide content found', { x: 50, y: 300, size: 14, font });
  }
  for (const slide of slides) {
    const page = pdf.addPage(A4_LANDSCAPE);
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: 25,
      y: 25,
      width: width - 50,
      height: height - 50,
      borderColor: rgb(0.8, 0.82, 0.85),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 0.99),
    });
    page.drawText(`Slide ${slide.num}`, { x: 60, y: height - 60, size: 20, font: bold, color: rgb(0.12, 0.22, 0.45) });
    let y = height - 100;
    for (const line of wrapText(safe.clean(slide.text), width - 120, 12, font)) {
      if (y < 60) break;
      page.drawText(line, { x: 60, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 20;
    }
  }
  return { blob: new Blob([(await pdf.save()) as BlobPart], { type: MIME.pdf }), replacedCharacters: safe.replaced };
}

export async function excelToPdf(data: ArrayBuffer): Promise<ConversionResult> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const safe = new SafeText();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  workbook.worksheets.forEach((sheet) => {
    let page = pdf.addPage(A4_LANDSCAPE);
    const { width, height } = page.getSize();
    let y = height - 55;
    page.drawText(safe.clean(sheet.name || 'Sheet'), { x: 35, y, size: 18, font: bold, color: rgb(0.1, 0.45, 0.3) });
    y -= 35;
    sheet.eachRow((row, rowNumber) => {
      if (y < 45) {
        page = pdf.addPage(A4_LANDSCAPE);
        y = height - 55;
      }
      const values: string[] = [];
      row.eachCell((cell) => values.push(cell.text || String(cell.value ?? '')));
      page.drawText(safe.clean(values.join('  |  ')).slice(0, 160), {
        x: 35,
        y,
        size: 10,
        font: rowNumber === 1 ? bold : font,
        color: rgb(0.18, 0.18, 0.18),
      });
      page.drawLine({ start: { x: 35, y: y - 4 }, end: { x: width - 35, y: y - 4 }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) });
      y -= 20;
    });
  });
  return { blob: new Blob([(await pdf.save()) as BlobPart], { type: MIME.pdf }), replacedCharacters: safe.replaced };
}

/** HTML code or file to PDF. Keeps headings, paragraphs and list items as text. */
export async function htmlToPdf(html: string): Promise<ConversionResult> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach((el) => el.remove());

  const safe = new SafeText();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  let y = height - margin;

  const blocks = [...doc.body.querySelectorAll('h1, h2, h3, h4, p, li, pre, blockquote, td, th')];
  const items = blocks.length
    ? blocks.map((el) => ({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').replace(/\s+/g, ' ').trim() }))
    : [{ tag: 'p', text: (doc.body.textContent || '').replace(/\s+/g, ' ').trim() }];

  for (const { tag, text } of items) {
    if (!text) continue;
    const heading = /^h[1-4]$/.test(tag);
    const size = tag === 'h1' ? 18 : tag === 'h2' ? 15 : heading ? 13 : 10.5;
    const f = heading ? bold : font;
    const indent = tag === 'li' ? 15 : 0;
    for (const line of wrapText(safe.clean(tag === 'li' ? `• ${text}` : text), width - margin * 2 - indent, size, f)) {
      if (y < margin + 25) {
        page = pdf.addPage(A4);
        y = height - margin;
      }
      page.drawText(line, { x: margin + indent, y, size, font: f, color: heading ? rgb(0.1, 0.15, 0.35) : rgb(0.2, 0.2, 0.2) });
      y -= size + 7;
    }
    y -= heading ? 8 : 5;
  }
  return { blob: new Blob([(await pdf.save()) as BlobPart], { type: MIME.pdf }), replacedCharacters: safe.replaced };
}

// PDF/A lives in its own module so the Node server can reuse it
export async function pdfToPdfA(data: ArrayBuffer, fileName: string): Promise<ConversionResult> {
  const { preparePdfA } = await import('./pdfa');
  return { blob: new Blob([(await preparePdfA(data, fileName)) as BlobPart], { type: MIME.pdf }) };
}
