/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Where OCR assets come from.
// - The Tesseract worker and WASM engine are always served by this app (see vite.config.ts).
// - Language models (*.traineddata, 2-20 MB each) default to the jsDelivr CDN.
//   Set VITE_TESSDATA_URL at build time to serve them yourself (e.g. "/tessdata").
// - Fonts for searchable-PDF output in non-Latin scripts default to jsDelivr.
//   Set VITE_OCR_FONT_URL to a folder containing the same .ttf file names to self-host.

const absolute = (p: string) => new URL(p, window.location.href).href;

export function getTesseractOptions(): { workerPath: string; corePath: string; langPath?: string } {
  const base = import.meta.env.BASE_URL;
  const langPath = import.meta.env.VITE_TESSDATA_URL as string | undefined;
  return {
    workerPath: absolute(`${base}tesseract/worker.min.js`),
    corePath: absolute(`${base}tesseract/`),
    ...(langPath ? { langPath: absolute(langPath) } : {}),
  };
}

export function ocrFontUrl(defaultUrl: string): string {
  const base = import.meta.env.VITE_OCR_FONT_URL as string | undefined;
  if (!base) return defaultUrl;
  return absolute(`${base.replace(/\/?$/, '/')}${defaultUrl.split('/').pop()}`);
}
