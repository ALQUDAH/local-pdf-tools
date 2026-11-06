/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Draws text that may mix Latin and Arabic into PDFs made with pdf-lib.
//
// The standard PDF fonts (Helvetica) only cover WinAnsi, so drawing Arabic with them throws
// "WinAnsi cannot encode". This module:
// - embeds Vazirmatn (assets/fonts, SIL OFL) only when the text needs it,
// - picks a font per character run (Helvetica for Latin, Vazirmatn for Arabic),
// - orders runs visually with the Unicode Bidirectional Algorithm (bidi-js),
// - lets fontkit shape Arabic letters (joining forms, lam-alef ligatures) and honors its glyph
//   positions, which pdf-lib's drawText ignores (harakat would otherwise sit beside the letter),
// - right-aligns right-to-left paragraphs,
// - replaces characters no embedded font can show with "?" instead of failing.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import {
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFOperator,
  PDFPage,
  RGB,
  StandardFonts,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  showText,
} from "pdf-lib";

const bidi = bidiFactory();

// Scripts that fontkit lays out right-to-left (it reverses those glyph runs itself)
const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const NEEDS_ARABIC_FONT = /[؀-ۿݐ-ݿࡰ-ࣿﭐ-﷿ﹰ-﻿]/;
// Bidi control characters: they have no glyph and only matter to the bidi algorithm
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;

// Vazirmatn has one precomposed glyph per letter form, so text copied from the PDF maps back to
// the right letters (fonts that build dots from separate marks, like Noto Sans Arabic, do not).
const FONT_FILES = { regular: "Vazirmatn-Regular.ttf", bold: "Vazirmatn-Bold.ttf" };

let fontDirCache: string | null = null;

/** Finds the bundled fonts folder in dev (assets/fonts), in dist/ and in the desktop app. */
function fontDir(): string {
  if (fontDirCache) return fontDirCache;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.PDF_FONTS_DIR,
    path.join(here, "fonts"),
    path.join(here, "assets", "fonts"),
    path.join(here, "..", "assets", "fonts"),
    path.join(process.cwd(), "assets", "fonts"),
  ].filter((p): p is string => !!p);
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, FONT_FILES.regular)));
  if (!found) throw new Error(`Arabic font not found (looked in: ${candidates.join(", ")})`);
  fontDirCache = found;
  return found;
}

const fontBytesCache = new Map<string, Buffer>();
function fontBytes(file: string): Buffer {
  let bytes = fontBytesCache.get(file);
  if (!bytes) {
    bytes = fs.readFileSync(path.join(fontDir(), file));
    fontBytesCache.set(file, bytes);
  }
  return bytes;
}

/** True when the text contains characters Helvetica cannot draw. */
export function needsUnicodeFont(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xff && !WIN_ANSI_EXTRA.has(cp)) return true;
  }
  return false;
}
// Code points above U+00FF that WinAnsi still covers (curly quotes, dashes, euro...)
const WIN_ANSI_EXTRA = new Set([
  0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018,
  0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a,
  0x20ac, 0x2122,
]);

interface FontPair {
  latin: PDFFont;
  latinChars: Set<number>;
  unicode?: PDFFont;
  unicodeHas?: (cp: number) => boolean;
}

interface Segment {
  text: string; // in the order the font should receive it
  font: PDFFont;
  shaped: boolean; // drawn glyph by glyph from fontkit's layout (the embedded Unicode font)
}

// The parts of pdf-lib's (private) subset embedder used to place glyphs one by one.
// pdf-lib 1.17 is stable; ensureEmbedder() checks the shape so a change fails loudly.
interface FontkitGlyph {
  id: number;
  advanceWidth: number;
  codePoints: number[];
}
interface FontkitRun {
  glyphs: FontkitGlyph[];
  positions: { xAdvance: number; xOffset: number; yOffset: number }[];
}
interface SubsetEmbedder {
  font: { layout(text: string, features?: unknown): FontkitRun; unitsPerEm: number };
  fontFeatures?: unknown;
  subset: { includeGlyph(glyph: FontkitGlyph): number };
  glyphs: FontkitGlyph[];
  glyphIdMap: Map<number, number>;
  glyphCache: { invalidate(): void };
}

function ensureEmbedder(font: PDFFont): SubsetEmbedder {
  const emb = (font as unknown as { embedder?: SubsetEmbedder }).embedder;
  if (!emb?.font?.layout || !emb.subset?.includeGlyph || !emb.glyphIdMap || !emb.glyphCache) {
    throw new Error("Unsupported pdf-lib version: cannot place shaped glyphs");
  }
  return emb;
}

/** Same bookkeeping as pdf-lib's CustomFontSubsetEmbedder.encodeText, for given glyphs. */
function encodeGlyphs(emb: SubsetEmbedder, glyphs: FontkitGlyph[], rtl: boolean): PDFHexString {
  const hex = glyphs.map((glyph) => {
    const subsetId = emb.subset.includeGlyph(glyph);
    // pdf-lib builds the ToUnicode map from these glyphs. PDF readers reverse right-to-left
    // text when extracting it, including the letters of a ligature, so store lam-alef as
    // alef+lam to get "لا" back when copying.
    emb.glyphs[subsetId - 1] =
      rtl && glyph.codePoints.length > 1
        ? Object.assign(Object.create(glyph) as FontkitGlyph, { codePoints: [...glyph.codePoints].reverse() })
        : glyph;
    emb.glyphIdMap.set(glyph.id, subsetId);
    return subsetId.toString(16).padStart(4, "0");
  });
  emb.glyphCache.invalidate();
  return PDFHexString.of(hex.join(""));
}

export interface DrawOptions {
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: RGB;
  /** Width of the text box. When set, right-to-left lines are right-aligned inside it. */
  maxWidth?: number;
}

export class PdfTextWriter {
  private constructor(private regular: FontPair, private bold: FontPair) {}

  /**
   * Embeds Helvetica (and Noto Sans Arabic if `sampleText` needs it) into the document.
   * Pass all the text you are going to draw, so the Arabic font is only embedded when used.
   */
  static async create(pdfDoc: PDFDocument, sampleText: string): Promise<PdfTextWriter> {
    const needUnicode = needsUnicodeFont(sampleText);
    const pair = async (std: StandardFonts, file: string): Promise<FontPair> => {
      const latin = await pdfDoc.embedFont(std);
      const result: FontPair = { latin, latinChars: new Set(latin.getCharacterSet()) };
      if (needUnicode) {
        pdfDoc.registerFontkit(fontkit);
        const bytes = fontBytes(file);
        result.unicode = await pdfDoc.embedFont(bytes, { subset: true });
        const probe = fontkit.create(bytes);
        result.unicodeHas = (cp) => probe.hasGlyphForCodePoint(cp);
      }
      return result;
    };
    return new PdfTextWriter(
      await pair(StandardFonts.Helvetica, FONT_FILES.regular),
      await pair(StandardFonts.HelveticaBold, FONT_FILES.bold),
    );
  }

  /** Width of one line of text in points. */
  widthOf(text: string, size: number, bold = false): number {
    return this.layoutLine(text, bold).reduce((w, s) => w + segmentWidth(s, size), 0);
  }

  /** Splits a paragraph into lines that fit `maxWidth` (words longer than a line are kept whole). */
  wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
    const words = clean(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && this.widthOf(test, size, bold) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Draws one line. Returns the width drawn. */
  draw(page: PDFPage, text: string, opts: DrawOptions): number {
    const segments = this.layoutLine(text, !!opts.bold);
    const widths = segments.map((s) => segmentWidth(s, opts.size));
    const total = widths.reduce((a, b) => a + b, 0);
    let x = opts.x;
    if (opts.maxWidth !== undefined && isRtl(text)) x = opts.x + Math.max(0, opts.maxWidth - total);
    segments.forEach((s, i) => {
      if (s.shaped) drawShaped(page, s, x, opts.y, opts.size, opts.color ?? rgb(0, 0, 0));
      else page.drawText(s.text, { x, y: opts.y, size: opts.size, font: s.font, color: opts.color });
      x += widths[i];
    });
    return total;
  }

  /** Breaks a line into font runs in visual (left-to-right) order. */
  private layoutLine(raw: string, bold: boolean): Segment[] {
    const fonts = bold ? this.bold : this.regular;
    const text = clean(raw);
    if (!text) return [];

    // Fast path: plain WinAnsi text needs neither bidi nor a second font
    if (!fonts.unicode && !needsUnicodeFont(text)) return [{ text, font: fonts.latin, shaped: false }];

    const dir = isRtl(text) ? "rtl" : "ltr";
    const embedding = bidi.getEmbeddingLevels(text, dir);
    const mirrored = bidi.getMirroredCharactersMap(text, embedding.levels);

    // 1. Logical runs of (bidi level, font)
    type Run = { level: number; font: PDFFont; chars: string[] };
    const runs: Run[] = [];
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i)!;
      const unit = cp > 0xffff ? 2 : 1;
      const level = embedding.levels[i];
      let ch = mirrored.get(i) ?? text.slice(i, i + unit);
      let font = this.pickFont(fonts, cp, level % 2 === 1);
      if (!font) {
        ch = "?";
        font = fonts.latin;
      }
      const last = runs[runs.length - 1];
      if (last && last.level === level && last.font === font) last.chars.push(ch);
      else runs.push({ level, font, chars: [ch] });
      i += unit - 1;
    }

    // 2. Visual order of runs (Unicode bidi rule L2, applied to whole runs)
    const maxLevel = Math.max(...runs.map((r) => r.level));
    const minOdd = Math.min(...runs.map((r) => (r.level % 2 ? r.level : r.level + 1)));
    for (let lvl = maxLevel; lvl >= minOdd; lvl--) {
      for (let i = 0; i < runs.length; ) {
        if (runs[i].level < lvl) {
          i++;
          continue;
        }
        let j = i;
        while (j < runs.length && runs[j].level >= lvl) j++;
        runs.splice(i, j - i, ...runs.slice(i, j).reverse());
        i = j;
      }
    }

    // 3. Characters inside right-to-left runs: fontkit reverses runs that contain an RTL
    //    script itself, so those get logical order; everything else is reversed here.
    return runs.map((r) => {
      const logical = r.chars.join("");
      const rtl = r.level % 2 === 1;
      const shaped = r.font !== fonts.latin;
      const fontReverses = shaped && RTL_SCRIPT.test(logical);
      const textForFont = rtl && !fontReverses ? [...r.chars].reverse().join("") : logical;
      return { text: textForFont, font: r.font, shaped };
    });
  }

  private pickFont(fonts: FontPair, cp: number, inRtlRun: boolean): PDFFont | null {
    const uni = fonts.unicode && fonts.unicodeHas?.(cp) ? fonts.unicode : null;
    const latin = fonts.latinChars.has(cp) ? fonts.latin : null;
    if (NEEDS_ARABIC_FONT.test(String.fromCodePoint(cp))) return uni;
    // Spaces, digits and punctuation between Arabic words stay in the Arabic font so they
    // join the same shaped run; elsewhere Helvetica is preferred.
    if (inRtlRun && uni) return uni;
    return latin ?? uni;
  }
}

function segmentWidth(seg: Segment, size: number): number {
  if (!seg.shaped) return seg.font.widthOfTextAtSize(seg.text, size);
  const emb = ensureEmbedder(seg.font);
  const run = emb.font.layout(seg.text, emb.fontFeatures);
  const advance = run.positions.reduce((w, p) => w + p.xAdvance, 0);
  return (advance * size) / emb.font.unitsPerEm;
}

/**
 * Draws a shaped run. Glyphs whose position is just their natural advance are shown together
 * (so PDF viewers see whole words); kerned glyphs and harakat get their own text position.
 */
function drawShaped(page: PDFPage, seg: Segment, x: number, y: number, size: number, color: RGB): void {
  const emb = ensureEmbedder(seg.font);
  const run = emb.font.layout(seg.text, emb.fontFeatures);
  const scale = size / emb.font.unitsPerEm;
  const fontKey = page.node.newFontDictionary(seg.font.name, seg.font.ref);
  const rtl = RTL_SCRIPT.test(seg.text);

  const ops: PDFOperator[] = [pushGraphicsState(), beginText(), setFillingColor(color), setFontAndSize(fontKey, size)];
  let pen = x;
  let group: FontkitGlyph[] = [];
  const flush = () => {
    if (group.length) ops.push(showText(encodeGlyphs(emb, group, rtl)));
    group = [];
  };
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const natural = pos.xOffset === 0 && pos.yOffset === 0 && pos.xAdvance === glyph.advanceWidth;
    if (!natural || group.length === 0) {
      flush();
      ops.push(setTextMatrix(1, 0, 0, 1, pen + pos.xOffset * scale, y + pos.yOffset * scale));
    }
    group.push(glyph);
    if (!natural) flush(); // the next glyph starts from an explicit position again
    pen += pos.xAdvance * scale;
  });
  flush();
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

/** Paragraph direction from its first strong character. */
export function isRtl(text: string): boolean {
  for (const ch of text) {
    const type = bidi.getBidiCharTypeName(ch);
    if (type === "L") return false;
    if (type === "R" || type === "AL") return true;
  }
  return false;
}

function clean(text: string): string {
  return text.replace(BIDI_CONTROLS, "").replace(/[\t\r\n]+/g, " ");
}
