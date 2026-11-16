/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import './pdfjs';
import { recordResult } from './handoff';


/**
 * Sanitizes a string, replacing or removing characters that cannot be encoded by standard PDF fonts 
 * in pdf-lib (WinAnsi / Windows-1252) with safe representations to prevent runtime crashes.
 */
export function sanitizeForWinAnsi(text: string): string {
  if (!text) return '';
  
  const winAnsiSafeCodes = new Set<number>([
    9, 10, 13, // controls
    352, 353, // Š, š
    381, 382, // Ž, ...
    338, 339, // Œ, œ
    376, // Ÿ
    8211, 8212, // en dash, em dash
    8216, 8217, 8218, // single quotes
    8220, 8221, 8222, // double quotes
    8224, 8225, // dagger, double dagger
    8226, // bullet
    8230, // ellipsis
    8364, // €
    8482, // ™
  ]);

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    
    // Check if within basic printable ASCII:
    if (code >= 32 && code <= 126) {
      result += char;
    } else if (code === 10 || code === 13 || code === 9) {
      result += char;
    } else if (code >= 160 && code <= 255) {
      result += char;
    } else if (winAnsiSafeCodes.has(code)) {
      result += char;
    } else {
      // Common look-alikes
      if (code === 8216 || code === 8217) result += "'";
      else if (code === 8220 || code === 8221) result += '"';
      else if (code === 8211 || code === 8212) result += '-';
      else if (code === 8230) result += '...';
      else {
        // Fallback for non-Latin characters (like Arabic, Russian, Chinese, Hebrew etc.)
        // This avoids crashing the standard Helvetica font drawing!
        result += '?';
      }
    }
  }
  return result;
}

/**
 * Loads a file into an ArrayBuffer
 */
export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Loads a PDF and returns page count and previews of the first few pages
 */
export async function getPdfDetails(arrayBuffer: ArrayBuffer, maxPreviews = 3): Promise<{ pageCount: number; previews: string[] }> {
  try {
    // 1. Get info using pdfjs for previews
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;
    const previews: string[] = [];

    // Render first few pages as previews
    const previewCount = Math.min(pageCount, maxPreviews);
    for (let i = 1; i <= previewCount; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 }); // low scale for thumbnail
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          };
          await page.render(renderContext).promise;
          previews.push(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch (err) {
        console.error(`Failed to render preview for page ${i}:`, err);
      }
    }

    return { pageCount, previews };
  } catch (err) {
    console.error('Error in getPdfDetails:', err);
    // If it fails (e.g. encrypted or invalid), we fall back to pdf-lib for count if possible
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      return { pageCount: pdfDoc.getPageCount(), previews: [] };
    } catch (fallbackErr) {
      console.error('Fallback pdf-lib check failed too:', fallbackErr);
      throw err;
    }
  }
}

/**
 * Renders all pages of a PDF into high quality image data URLs
 */
export async function renderAllPdfPages(
  arrayBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  const imageUrls: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High scale for clear images
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      };
      await page.render(renderContext).promise;
      imageUrls.push(canvas.toDataURL('image/jpeg', 0.95));
    }
    if (onProgress) {
      onProgress(i, pageCount);
    }
  }

  return imageUrls;
}

/**
 * Merges multiple PDFs into one
 */
export async function mergePdfs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageIndices = pdfDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

/**
 * Parses and processes a string with page ranges (e.g., "1-3, 5, 8-10")
 * To return an array of 0-based page indices.
 */
export function parsePageRanges(rangeStr: string, maxPages: number): number[] {
  const pages = new Set<number>();
  const segments = rangeStr.split(',');

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 2) {
        const start = parseInt(parts[0].trim(), 10);
        const end = parseInt(parts[1].trim(), 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, maxPages));
          const to = Math.max(1, Math.min(end, maxPages));
          const min = Math.min(from, to);
          const max = Math.max(from, to);
          for (let p = min; p <= max; p++) {
            pages.add(p - 1); // convert to 0-indexed
          }
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        pages.add(p - 1); // convert to 0-indexed
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Splits a single PDF by extracting specific page ranges
 */
export async function splitPdf(arrayBuffer: ArrayBuffer, pageIndices: number[]): Promise<Uint8Array> {
  if (pageIndices.length === 0) {
    throw new Error('No pages selected to extract.');
  }

  const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  
  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));

  return await newPdf.save();
}

/**
 * Derives a cryptographic AES key from a human passphrase using PBKDF2 (100,000 iterations)
 */
async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Applies military-grade AES-GCM-256 browser-native password protection
 * Combines 16-byte PBKDF2 salt + 12-byte IV + encrypted cipher bytes.
 */
export async function protectPdf(arrayBuffer: ArrayBuffer, password: string): Promise<Uint8Array> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);

  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    arrayBuffer
  );

  const finalBuffer = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  finalBuffer.set(salt, 0);
  finalBuffer.set(iv, salt.length);
  finalBuffer.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return finalBuffer;
}

/**
 * Decrypts AES-GCM-256 password-protected files client-side back to normal standard PDF bytes
 */
export async function unprotectPdf(encryptedBuffer: ArrayBuffer, password: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(encryptedBuffer);
  if (bytes.length < 28) {
    throw new Error('Invalid protected file metadata payload.');
  }

  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);

  const key = await deriveAesKey(password, salt);

  const decryptedContent = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );

  return new Uint8Array(decryptedContent);
}

/**
 * Trigger browser file download
 */
export function downloadFile(data: Uint8Array | string, fileName: string, mimeType: string) {
  let blob: Blob;
  if (typeof data === 'string') {
    // It's a base64 / data URL
    const fetchRes = fetch(data);
    fetchRes
      .then((res) => res.blob())
      .then((blobData) => {
        const url = URL.createObjectURL(blobData);
        triggerDownload(url, fileName);
      });
    return;
  } else {
    blob = new Blob([data as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
    recordResult(blob, fileName); // lets the user continue with this PDF in another tool
  }
}

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Compiles a list of image files into a single PDF document
 */
export async function imagesToPdf(imageBuffers: { data: ArrayBuffer; name: string; type: string }[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const img of imageBuffers) {
    let embeddedImg;
    try {
      if (img.type === 'image/png') {
        embeddedImg = await pdfDoc.embedPng(img.data);
      } else if (img.type === 'image/jpeg' || img.type === 'image/jpg') {
        embeddedImg = await pdfDoc.embedJpg(img.data);
      } else {
        // Fallback: assume JPG, or skip
        try {
          embeddedImg = await pdfDoc.embedJpg(img.data);
        } catch {
          continue;
        }
      }

      const { width, height } = embeddedImg.scale(1.0);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width,
        height,
      });
    } catch (err) {
      console.error('Failed to embed image:', img.name, err);
    }
  }

  return await pdfDoc.save();
}

/**
 * Rotates specific PDF pages by the given degree factors (e.g. 90, 180, 270)
 */
export async function rotatePdfPages(arrayBuffer: ArrayBuffer, rotations: Record<number, number>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  pages.forEach((page, index) => {
    let addRotation = rotations[index] || 0;
    if (isNaN(addRotation)) addRotation = 0;
    if (addRotation !== 0) {
      let currentRotation = page.getRotation().angle || 0;
      if (isNaN(currentRotation)) currentRotation = 0;
      page.setRotation(degrees((currentRotation + addRotation) % 360));
    }
  });

  return await pdfDoc.save();
}

/**
 * Reorders, replicates, deletes pages or appends blank sheets to a PDF
 */
export async function organizePdfPages(
  arrayBuffer: ArrayBuffer,
  pageOperations: { type: 'existing' | 'blank'; originalIndex?: number }[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  for (const op of pageOperations) {
    if (op.type === 'existing' && op.originalIndex !== undefined) {
      const copied = await newPdf.copyPages(sourcePdf, [op.originalIndex]);
      newPdf.addPage(copied[0]);
    } else {
      // Create standard letter size blank page (612 x 792 pt, 8.5 x 11 in)
      newPdf.addPage([612, 792]);
    }
  }

  return await newPdf.save();
}

/**
 * Stamps professional numbered index text at custom coordinates on each page
 */
export async function addPageNumbersToPdf(
  arrayBuffer: ArrayBuffer,
  options: {
    format: string; // "Page {n} of {total}" or "Page {n}" or "{n}"
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    fontSize: number;
    color: string; // hex
    skipFirstPage: boolean;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const standardFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Parse color hex to rgb decimal format
  const hex = options.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

  pages.forEach((page, index) => {
    if (options.skipFirstPage && index === 0) return;

    const n = index + 1;
    const rawLabel = options.format
      .replace('{n}', n.toString())
      .replace('{total}', total.toString());
    const textLabel = sanitizeForWinAnsi(rawLabel);

    const { width, height } = page.getSize();
    const textWidth = standardFont.widthOfTextAtSize(textLabel, options.fontSize);
    
    let vx = width / 2 - textWidth / 2;
    let vy = 30; // default margin

    switch (options.position) {
      case 'bottom-left':
        vx = 30;
        vy = 30;
        break;
      case 'bottom-right':
        vx = width - textWidth - 30;
        vy = 30;
        break;
      case 'bottom-center':
        vx = width / 2 - textWidth / 2;
        vy = 30;
        break;
      case 'top-left':
        vx = 30;
        vy = height - 45;
        break;
      case 'top-right':
        vx = width - textWidth - 30;
        vy = height - 45;
        break;
      case 'top-center':
        vx = width / 2 - textWidth / 2;
        vy = height - 45;
        break;
    }

    const opts = getNormalizedDrawingArgs(page, vx, vy, 0, 0, 0);

    page.drawText(textLabel, {
      x: opts.x,
      y: opts.y,
      size: options.fontSize,
      font: standardFont,
      color: rgb(r, g, b),
      rotate: opts.rotate,
    });
  });

  return await pdfDoc.save();
}

/**
 * Dynamic Client-Side Optimizer/Compressor
 * Scales pages to a lower dimension rendering, reduces resolution factor in-canvas
 * and bundles back together to shrink the final file footprint.
 */
export async function compressPdfLocal(
  arrayBuffer: ArrayBuffer,
  quality: number, // 0.1 to 1.0
  scaleFactor: number, // 0.5 to 1.0
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;

  const optimizedPdf = await PDFDocument.create();

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: scaleFactor });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const context = canvas.getContext('2d');
    if (context) {
      // Draw white background so transparent parts turn white instead of solid black when saving to jpeg
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      };
      await page.render(renderContext).promise;
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const res = await fetch(compressedDataUrl);
      const imgBuffer = await res.arrayBuffer();
      
      const embedded = await optimizedPdf.embedJpg(imgBuffer);
      const newPage = optimizedPdf.addPage([viewport.width, viewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      });
    }

    if (onProgress) {
      onProgress(i, pageCount);
    }
  }

  return await optimizedPdf.save();
}

/**
 * Stamps custom text watermarks onto PDF pages with custom rotations and opacities
 */
export async function addWatermarkToPdf(
  arrayBuffer: ArrayBuffer,
  options: {
    text: string;
    fontSize: number;
    rotation: number; // degrees
    opacity: number; // 0.1 to 1.0
    color: string; // hex
    layout: 'center' | 'diagonal' | 'grid' | 'custom';
    customX?: number; // 0-1 percentage
    customY?: number; // 0-1 percentage
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const standardFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const sanitizedText = sanitizeForWinAnsi(options.text) || "Watermark";

  // Parse color hex to rgb decimal
  const hex = options.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = standardFont.widthOfTextAtSize(sanitizedText, options.fontSize);
    const textHeight = options.fontSize; // rough estimate

    const drawVisualText = (vx: number, vy: number, vRot: number) => {
      const opts = getNormalizedDrawingArgs(page, vx, vy, 0, 0, vRot);
      page.drawText(sanitizedText, {
        x: opts.x,
        y: opts.y,
        size: options.fontSize,
        font: standardFont,
        color: rgb(r, g, b),
        opacity: options.opacity,
        rotate: opts.rotate,
      });
    };

    if (options.layout === 'center') {
      // Draw a single giant watermark in the absolute middle
      const vx = width / 2 - (textWidth / 2) * Math.cos((options.rotation * Math.PI) / 180);
      const vy = height / 2;
      drawVisualText(vx, vy, options.rotation);
    } else if (options.layout === 'diagonal') {
      // Calculate corner-to-corner angle and size
      const diagAngle = (Math.atan2(height, width) * 180) / Math.PI;
      const vx = (width - textWidth * Math.cos((diagAngle * Math.PI) / 180)) / 2;
      const vy = (height - textWidth * Math.sin((diagAngle * Math.PI) / 180)) / 2;
      drawVisualText(vx, vy, diagAngle);
    } else if (options.layout === 'grid') {
      // Repeated matrix pattern across pages
      const cols = 3;
      const rows = 4;
      const colStep = width / cols;
      const rowStep = height / rows;

      for (let c = 0; c < cols; c++) {
        for (let rIdx = 0; rIdx < rows; rIdx++) {
          const vx = c * colStep + colStep / 2 - textWidth / 2;
          const vy = rIdx * rowStep + rowStep / 2 - textHeight / 2;
          drawVisualText(vx, vy, options.rotation);
        }
      }
    } else if (options.layout === 'custom') {
      const vx = width * (options.customX || 0);
      const vy = height * (options.customY || 0);
      drawVisualText(vx, vy, options.rotation);
    }
  });

  return await pdfDoc.save();
}

/**
 * Interface representing standard PDF metadata
 */
export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

/**
 * Retrieves the existing metadata fields of an uploaded PDF
 */
export async function getPdfMetadata(arrayBuffer: ArrayBuffer): Promise<PdfMetadata> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const rawKeywords = pdfDoc.getKeywords() as any;
  
  let keywordsStr = '';
  if (typeof rawKeywords === 'string') {
    keywordsStr = rawKeywords;
  } else if (Array.isArray(rawKeywords)) {
    keywordsStr = (rawKeywords as string[]).join(', ');
  }

  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: keywordsStr,
    creator: pdfDoc.getCreator() || '',
    producer: pdfDoc.getProducer() || '',
  };
}

/**
 * Updates the standard PDF metadata fields with custom values
 */
export async function updatePdfMetadata(
  arrayBuffer: ArrayBuffer,
  metadata: PdfMetadata
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  
  pdfDoc.setTitle(metadata.title || '');
  pdfDoc.setAuthor(metadata.author || '');
  pdfDoc.setSubject(metadata.subject || '');
  
  const kwList = metadata.keywords
    ? metadata.keywords.split(',').map((k) => k.trim()).filter(Boolean)
    : [];
  pdfDoc.setKeywords(kwList);
  pdfDoc.setCreator(metadata.creator || '');
  pdfDoc.setProducer(metadata.producer || '');

  return await pdfDoc.save();
}

/**
 * Stamps a signature image on a specified page of the PDF at normalized coordinates
 */
export async function stampSignatureOnPdf(
  arrayBuffer: ArrayBuffer,
  options: {
    pageIndex: number; // 0-based
    signatureDataUrl: string; // "data:image/png;base64,..."
    xRatio: number; // 0.0 to 1.0 from left
    yRatio: number; // 0.0 to 1.0 from top (rendered)
    widthRatio: number; // width of signature as a ratio of page width, e.g. 0.25 (25% of page width)
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  if (options.pageIndex < 0 || options.pageIndex >= pageCount) {
    throw new Error('Page index out of bounds');
  }

  const page = pdfDoc.getPages()[options.pageIndex];
  const { width, height } = page.getSize();
  const angle = page.getRotation().angle || 0;

  const isRotated = angle === 90 || angle === 270 || angle === -90 || angle === -270;
  const visualWidth = isRotated ? height : width;
  const visualHeight = isRotated ? width : height;

  // Load the PNG signature image
  const base64Data = options.signatureDataUrl.split(',')[1];
  const responseBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const embeddedImage = await pdfDoc.embedPng(responseBytes);

  // Calculate signature dimensions preserved from aspect ratio
  const imgWidth = visualWidth * options.widthRatio;
  const aspectRatio = embeddedImage.height / embeddedImage.width;
  const imgHeight = imgWidth * aspectRatio;

  // Visual coordinates from visual bottom-left
  const vx = options.xRatio * visualWidth;
  const vy = visualHeight - (options.yRatio * visualHeight) - imgHeight;

  // Use orientation-agnostic drawer
  const drawOpts = getNormalizedDrawingArgs(page, vx, vy, imgWidth, imgHeight);

  page.drawImage(embeddedImage, drawOpts);

  return await pdfDoc.save();
}

/**
 * Normalizes visual coordinates targeting a PDFPage into internal pdf-lib coordinates, 
 * securely handling intrinsic CropBox offsets and rendering Rotations (0, 90, 180, 270)
 */
export function getNormalizedDrawingArgs(page: any, vx: number, vy: number, vWidth: number, vHeight: number, userRotationDeg: number = 0) {
  const { width: pw, height: ph } = page.getSize();
  let angle = page.getRotation().angle || 0;
  if (isNaN(angle)) angle = 0;
  let safeUserRot = userRotationDeg || 0;
  if (isNaN(safeUserRot)) safeUserRot = 0;
  const cropBox = page.getCropBox(); 
  
  let px = vx, py = vy;

  if (angle === 0 || angle === 360) {
    px = vx;
    py = vy;
  } else if (angle === 90) {
    px = pw - vy;
    py = vx;
  } else if (angle === 180) {
    px = pw - vx;
    py = ph - vy;
  } else if (angle === 270 || angle === -90) {
    px = vy;
    py = ph - vx;
  }

  return {
    x: cropBox.x + px,
    y: cropBox.y + py,
    width: vWidth,
    height: vHeight,
    rotate: degrees(angle + safeUserRot)
  };
}

/**
 * Normalizes visual rectangles for PDF Fields, ensuring width/height are mapped correctly
 * and the bounding box is physically aligned
 */
export function getNormalizedFieldRect(page: any, vx: number, vy: number, vw: number, vh: number) {
  const { width: pw, height: ph } = page.getSize();
  const angle = page.getRotation().angle || 0;
  const cropBox = page.getCropBox(); 

  // Coordinates of the 4 visual corners:
  const pts = [
    { vx: vx, vy: vy },
    { vx: vx + vw, vy: vy },
    { vx: vx, vy: vy + vh },
    { vx: vx + vw, vy: vy + vh }
  ];

  // Map to physical
  const physicalPts = pts.map(pt => {
    let px = pt.vx, py = pt.vy;
    if (angle === 90) {
      px = pw - pt.vy;
      py = pt.vx;
    } else if (angle === 180) {
      px = pw - pt.vx;
      py = ph - pt.vy;
    } else if (angle === 270 || angle === -90) {
      px = pt.vy;
      py = ph - pt.vx;
    }
    return { px: cropBox.x + px, py: cropBox.y + py };
  });

  const minX = Math.min(...physicalPts.map(p => p.px));
  const minY = Math.min(...physicalPts.map(p => p.py));
  const maxX = Math.max(...physicalPts.map(p => p.px));
  const maxY = Math.max(...physicalPts.map(p => p.py));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
export async function generateNUpPdf(
  arrayBuffer: ArrayBuffer,
  options: {
    rows: number;
    cols: number;
    pageSize: 'A4' | 'Letter' | 'SameAsSource';
    orientation: 'portrait' | 'landscape';
    margin: number;
    gap: number;
    drawBorders: boolean;
    pageOrder: 'horizontal' | 'vertical';
  }
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const destPdf = await PDFDocument.create();

  const sourcePages = sourcePdf.getPages();
  const sourcePageCount = sourcePages.length;

  if (sourcePageCount === 0) {
    throw new Error('This PDF has no pages.');
  }

  // Determine Sheet Size
  let sheetWidth = 612; // Letter width
  let sheetHeight = 792; // Letter height

  if (options.pageSize === 'A4') {
    sheetWidth = 595.27;
    sheetHeight = 841.89;
  } else if (options.pageSize === 'SameAsSource') {
    const firstPage = sourcePages[0];
    const { width, height } = firstPage.getSize();
    sheetWidth = width;
    sheetHeight = height;
  }

  // Adjust for orientation
  if (options.orientation === 'landscape') {
    const minDim = Math.min(sheetWidth, sheetHeight);
    const maxDim = Math.max(sheetWidth, sheetHeight);
    sheetWidth = maxDim;
    sheetHeight = minDim;
  } else {
    const minDim = Math.min(sheetWidth, sheetHeight);
    const maxDim = Math.max(sheetWidth, sheetHeight);
    sheetWidth = minDim;
    sheetHeight = maxDim;
  }

  const R = options.rows;
  const C = options.cols;
  const pagesPerSheet = R * C;

  const sourceIndices = Array.from({ length: sourcePageCount }, (_, i) => i);
  const embeddedPages = await destPdf.embedPdf(sourcePdf, sourceIndices);

  const margin = options.margin;
  const gap = options.gap;
  const gridW = sheetWidth - (2 * margin);
  const gridH = sheetHeight - (2 * margin);

  const cellW = (gridW - (C - 1) * gap) / C;
  const cellH = (gridH - (R - 1) * gap) / R;

  if (cellW <= 0 || cellH <= 0) {
    throw new Error('Margins and spaces are wider than the sheet. Decrease margins or gaps.');
  }

  let sheetPage = destPdf.addPage([sheetWidth, sheetHeight]);

  for (let i = 0; i < sourcePageCount; i++) {
    const sheetIndex = Math.floor(i / pagesPerSheet);
    const indexOnSheet = i % pagesPerSheet;

    if (sheetIndex > 0 && indexOnSheet === 0) {
      sheetPage = destPdf.addPage([sheetWidth, sheetHeight]);
    }

    let r = 0;
    let c = 0;

    if (options.pageOrder === 'horizontal') {
      r = Math.floor(indexOnSheet / C);
      c = indexOnSheet % C;
    } else {
      c = Math.floor(indexOnSheet / R);
      r = indexOnSheet % R;
    }

    const cellX = margin + c * (cellW + gap);
    const cellY = sheetHeight - margin - (r + 1) * cellH - r * gap;

    const emb = embeddedPages[i];
    const srcRatio = emb.width / emb.height;
    const cellRatio = cellW / cellH;

    let drawW = cellW;
    let drawH = cellH;

    if (srcRatio > cellRatio) {
      drawW = cellW;
      drawH = cellW / srcRatio;
    } else {
      drawH = cellH;
      drawW = cellH * srcRatio;
    }

    const offsetX = (cellW - drawW) / 2;
    const offsetY = (cellH - drawH) / 2;

    const drawX = cellX + offsetX;
    const drawY = cellY + offsetY;

    sheetPage.drawPage(emb, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });

    if (options.drawBorders) {
      sheetPage.drawRectangle({
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.5,
      });
    }
  }

  return await destPdf.save();
}

/**
 * Flattens all PDF form fields and annotations into static content.
 */
export async function flattenPdf(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  form.flatten();
  return await pdfDoc.save();
}

/**
 * Repairs a PDF by trying to rebuild it through standard reading/writing processes
 */
export async function repairPdf(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return await pdfDoc.save();
}

/**
 * Resizes pages to standard page sizes
 */
export async function resizePdf(
  arrayBuffer: ArrayBuffer,
  options: { targetSize: 'A4' | 'Letter' | 'Legal' }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  let targetWidth = 595.28;
  let targetHeight = 841.89; // A4

  if (options.targetSize === 'Letter') {
    targetWidth = 612.0;
    targetHeight = 792.0;
  } else if (options.targetSize === 'Legal') {
    targetWidth = 612.0;
    targetHeight = 1008.0;
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    
    // Maintain orientation (if original is landscape, make target landscape)
    let w = targetWidth;
    let h = targetHeight;
    if (width > height) {
      w = targetHeight;
      h = targetWidth;
    }

    page.setSize(w, h);
    const scale = Math.min(w / width, h / height);
    
    // Scale from the origin
    page.scaleContent(scale, scale);
    
    // Shift to center
    const xOffset = (w - width * scale) / 2;
    const yOffset = (h - height * scale) / 2;
    page.translateContent(xOffset, yOffset);
  }

  return await pdfDoc.save();
}

/**
 * Adds custom physical margin by downscaling the content and maintaining sheet size.
 */
export async function addMarginPdf(
  arrayBuffer: ArrayBuffer,
  marginPercent: number // 0 to 50
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const scaleFactor = 1.0 - (marginPercent / 100);

  for (const page of pages) {
    const { width, height } = page.getSize(); // visual size
    const angle = page.getRotation().angle || 0;
    
    let pw = width;
    let ph = height;
    
    if (angle === 90 || angle === 270 || angle === -90 || angle === -270) {
      pw = height;
      ph = width;
    }
    
    // Scale content down
    page.scaleContent(scaleFactor, scaleFactor);
    
    // Compute required shift to bring it back to center utilizing PHYSICAL width scaling
    const xOffset = (pw - pw * scaleFactor) / 2;
    const yOffset = (ph - ph * scaleFactor) / 2;
    page.translateContent(xOffset, yOffset);
  }

  return await pdfDoc.save();
}
export async function applyOverlayToPdf(
  primaryBuffer: ArrayBuffer,
  overlay: {
    type: 'image' | 'pdf';
    buffer: ArrayBuffer;
    mimeType?: string;
  },
  options: {
    targetPages: 'all' | 'first' | 'last' | 'custom';
    customRangeString?: string;
    scale: number; // scale multiplier, e.g. 1.0 is original size
    fitToPage: boolean;
    offsetX: number;
    offsetY: number;
    opacity: number; // 0.0 to 1.0
    rotation: number; // degrees
    positionPreset: 'custom' | 'center' | 'full' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-left';
    overlayPageIndex?: number; // 0-based index for PDF overlays
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(primaryBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  if (pageCount === 0) {
    throw new Error('The primary PDF has no pages.');
  }

  // Determine target pages to overlay
  let targetIndices: number[] = [];
  if (options.targetPages === 'all') {
    targetIndices = Array.from({ length: pageCount }, (_, i) => i);
  } else if (options.targetPages === 'first') {
    targetIndices = [0];
  } else if (options.targetPages === 'last') {
    targetIndices = [pageCount - 1];
  } else if (options.targetPages === 'custom' && options.customRangeString) {
    targetIndices = parsePageRanges(options.customRangeString, pageCount);
  } else {
    targetIndices = Array.from({ length: pageCount }, (_, i) => i);
  }

  if (targetIndices.length === 0) {
    throw new Error('No target pages matched the selection.');
  }

  // Embed the overlay item
  let embeddedImage: any = null;
  let embeddedPdfPage: any = null;
  let overlayWidth = 100;
  let overlayHeight = 100;

  if (overlay.type === 'image') {
    const isPng = overlay.mimeType === 'image/png' || (!overlay.mimeType && overlay.buffer.byteLength > 4); // basic guess or PNG default
    try {
      if (isPng) {
        embeddedImage = await pdfDoc.embedPng(overlay.buffer);
      } else {
        embeddedImage = await pdfDoc.embedJpg(overlay.buffer);
      }
    } catch {
      // Fallback
      try {
        if (isPng) {
          embeddedImage = await pdfDoc.embedJpg(overlay.buffer);
        } else {
          embeddedImage = await pdfDoc.embedPng(overlay.buffer);
        }
      } catch (err) {
        throw new Error('Failed to embed overlay image. Please ensure it is a valid PNG or JPG.');
      }
    }
    overlayWidth = embeddedImage.width;
    overlayHeight = embeddedImage.height;
  } else {
    // PDF overlay
    const overlayPdf = await PDFDocument.load(overlay.buffer, { ignoreEncryption: true });
    const overlayPageCount = overlayPdf.getPageCount();
    if (overlayPageCount === 0) {
      throw new Error('The overlay PDF has no pages.');
    }
    const oIdx = Math.max(0, Math.min(options.overlayPageIndex || 0, overlayPageCount - 1));
    const embeddedPages = await pdfDoc.embedPdf(overlayPdf, [oIdx]);
    embeddedPdfPage = embeddedPages[0];
    overlayWidth = embeddedPdfPage.width;
    overlayHeight = embeddedPdfPage.height;
  }

  // For each target page, apply overlay drawing
  for (const idx of targetIndices) {
    const page = pages[idx];
    const { width: pw, height: ph } = page.getSize();
    const angle = page.getRotation().angle || 0;
    const isRotated = angle === 90 || angle === 270 || angle === -90 || angle === -270;
    
    // visual dimensions of the page space
    const pWidth = isRotated ? ph : pw;
    const pHeight = isRotated ? pw : ph;

    let drawW = overlayWidth * (options.scale || 1.0);
    let drawH = overlayHeight * (options.scale || 1.0);

    if (options.fitToPage || options.positionPreset === 'full') {
      drawW = pWidth;
      drawH = pHeight;
    }

    let drawX = options.offsetX;
    let drawY = options.offsetY;

    // Relative to the standard Cartesian coordinates where origin (0,0) is bottom-left
    switch (options.positionPreset) {
      case 'center':
        drawX = (pWidth - drawW) / 2 + options.offsetX;
        drawY = (pHeight - drawH) / 2 + options.offsetY;
        break;
      case 'full':
        drawX = 0;
        drawY = 0;
        break;
      case 'bottom-right':
        drawX = pWidth - drawW - 30 + options.offsetX;
        drawY = 30 + options.offsetY;
        break;
      case 'top-left':
        drawX = 30 + options.offsetX;
        drawY = pHeight - drawH - 30 + options.offsetY;
        break;
      case 'top-right':
        drawX = pWidth - drawW - 30 + options.offsetX;
        drawY = pHeight - drawH - 30 + options.offsetY;
        break;
      case 'bottom-left':
        drawX = 30 + options.offsetX;
        drawY = 30 + options.offsetY;
        break;
      case 'custom':
      default:
        // Use custom offsets directly
        break;
    }

    const drawOpts = getNormalizedDrawingArgs(page, drawX, drawY, drawW, drawH, options.rotation || 0);

    if (overlay.type === 'image' && embeddedImage) {
      page.drawImage(embeddedImage, {
        ...drawOpts,
        opacity: options.opacity,
      });
    } else if (overlay.type === 'pdf' && embeddedPdfPage) {
      page.drawPage(embeddedPdfPage, {
        ...drawOpts,
        opacity: options.opacity,
      });
    }
  }

  return await pdfDoc.save();
}




