import { test, expect } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { PdfTextWriter, isRtl, needsUnicodeFont } from '../server/pdfText';

// Server-side text drawing used by the Office / HTML / Translate converters.
// These run in Node only (no browser page).

async function render(lines: string[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const writer = await PdfTextWriter.create(pdfDoc, lines.join(' '));
  const page = pdfDoc.addPage([595.27, 841.89]);
  let y = 780;
  for (const line of lines) {
    for (const wrapped of writer.wrap(line, 495, 12)) {
      writer.draw(page, wrapped, { x: 50, y, size: 12, maxWidth: 495 });
      y -= 18;
    }
  }
  return pdfDoc.save();
}

// True when the PDF embeds a Unicode (Type0) font, i.e. the Arabic font was used
async function embedsUnicodeFont(bytes: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .some(([, obj]) => obj instanceof PDFDict && obj.get(PDFName.of('Subtype')) === PDFName.of('Type0'));
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

test('Arabic text is drawn and extracts back to the same words', async () => {
  const bytes = await render([
    'ملفاتك لا تغادر جهازك أبداً',
    'أدوات PDF المحلية الإصدار 2026',
    'Mixed English سطر مختلط',
  ]);
  expect(await embedsUnicodeFont(bytes)).toBe(true);
  const text = await extractText(bytes);
  for (const word of ['ملفاتك', 'لا', 'تغادر', 'جهازك', 'الإصدار', 'المحلية', 'مختلط', 'PDF', '2026', 'English']) {
    expect(text).toContain(word);
  }
});

test('Latin-only text does not embed the Arabic font', async () => {
  const bytes = await render(['Plain English — “quotes” and € only.']);
  expect(await embedsUnicodeFont(bytes)).toBe(false);
  expect(await extractText(bytes)).toContain('Plain English');
});

test('Characters no font covers become "?" instead of failing', async () => {
  const bytes = await render(['Chinese 中文 and Arabic عربي']);
  const text = await extractText(bytes);
  expect(text).toContain('??');
  expect(text).toContain('عربي');
});

test('Paragraph direction and wrapping', async () => {
  expect(isRtl('مرحبا Hello')).toBe(true);
  expect(isRtl('Hello مرحبا')).toBe(false);
  expect(isRtl('2026 مرحبا')).toBe(true);
  expect(needsUnicodeFont('café – €')).toBe(false);
  expect(needsUnicodeFont('مرحبا')).toBe(true);

  const pdfDoc = await PDFDocument.create();
  const sentence = 'هذا سطر طويل لاختبار التفاف النص على عرض الصفحة '.repeat(6).trim();
  const writer = await PdfTextWriter.create(pdfDoc, sentence);
  const lines = writer.wrap(sentence, 200, 12);
  expect(lines.length).toBeGreaterThan(3);
  for (const line of lines) expect(writer.widthOf(line, 12)).toBeLessThanOrEqual(200);
  expect(lines.join(' ')).toBe(sentence);
});
