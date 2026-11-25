/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Batch processing: run a list of steps over many PDFs, entirely in the browser.
// Each step reuses the same function the matching tool uses, so results are identical.

import { PDFDocument } from 'pdf-lib';
import {
  addMarginPdf,
  addPageNumbersToPdf,
  addWatermarkToPdf,
  compressPdfLocal,
  flattenPdf,
  mergePdfs,
  repairPdf,
  resizePdf,
  rotatePdfPages,
} from './pdfUtils';
import { encryptPdf, isEncrypted } from './qpdf';
import { preparePdfA } from './pdfa';

export type BatchStep =
  | { kind: 'compress'; level: 'extreme' | 'recommended' | 'light' }
  | { kind: 'rotate'; degrees: 90 | 180 | 270 }
  | { kind: 'watermark'; text: string; opacity: number }
  | { kind: 'pagenumbers'; format: 'n' | 'page-n' | 'page-n-of-total'; position: 'bottom-center' | 'bottom-right' | 'top-right' }
  | { kind: 'resize'; size: 'A4' | 'Letter' | 'Legal' }
  | { kind: 'margins'; percent: number }
  | { kind: 'flatten' }
  | { kind: 'repair' }
  | { kind: 'stripmetadata' }
  | { kind: 'pdfa' }
  | { kind: 'protect'; password: string };

export type BatchStepKind = BatchStep['kind'];

/** Default options for a newly added step. */
export function defaultStep(kind: BatchStepKind): BatchStep {
  switch (kind) {
    case 'compress': return { kind, level: 'recommended' };
    case 'rotate': return { kind, degrees: 90 };
    case 'watermark': return { kind, text: 'CONFIDENTIAL', opacity: 0.25 };
    case 'pagenumbers': return { kind, format: 'page-n-of-total', position: 'bottom-center' };
    case 'resize': return { kind, size: 'A4' };
    case 'margins': return { kind, percent: 10 };
    case 'protect': return { kind, password: '' };
    default: return { kind } as BatchStep;
  }
}

export const STEP_KINDS: BatchStepKind[] = [
  'compress', 'rotate', 'watermark', 'pagenumbers', 'resize', 'margins', 'flatten', 'stripmetadata', 'repair', 'pdfa', 'protect',
];

const COMPRESS = { extreme: [0.3, 0.6], recommended: [0.6, 0.85], light: [0.85, 1.0] } as const;
const PAGE_FORMAT = { n: '{n}', 'page-n': 'Page {n}', 'page-n-of-total': 'Page {n} of {total}' } as const;

/** Problems that make a list of steps unusable, or [] if it can run. */
export function validateSteps(steps: BatchStep[]): string[] {
  const problems: string[] = [];
  if (steps.length === 0) problems.push('no-steps');
  const protectIndex = steps.findIndex((s) => s.kind === 'protect');
  if (protectIndex !== -1 && protectIndex !== steps.length - 1) problems.push('protect-not-last');
  if (steps.some((s) => s.kind === 'protect' && s.password.length < 1)) problems.push('protect-no-password');
  if (steps.some((s) => s.kind === 'watermark' && !s.text.trim())) problems.push('watermark-no-text');
  return problems;
}

const ab = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

export async function applyStep(bytes: Uint8Array, step: BatchStep): Promise<Uint8Array> {
  switch (step.kind) {
    case 'compress': {
      const [quality, scale] = COMPRESS[step.level];
      return compressPdfLocal(ab(bytes), quality, scale);
    }
    case 'rotate': {
      const count = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
      const rotations: Record<number, number> = {};
      for (let i = 0; i < count; i++) rotations[i] = step.degrees;
      return rotatePdfPages(ab(bytes), rotations);
    }
    case 'watermark':
      return addWatermarkToPdf(ab(bytes), {
        text: step.text,
        fontSize: 60,
        rotation: 45,
        opacity: step.opacity,
        color: '#888888',
        layout: 'diagonal',
      });
    case 'pagenumbers':
      return addPageNumbersToPdf(ab(bytes), {
        format: PAGE_FORMAT[step.format],
        position: step.position,
        fontSize: 11,
        color: '#333333',
        skipFirstPage: false,
      });
    case 'resize':
      return resizePdf(ab(bytes), { targetSize: step.size });
    case 'margins':
      return addMarginPdf(ab(bytes), step.percent);
    case 'flatten':
      return flattenPdf(ab(bytes));
    case 'repair':
      return repairPdf(ab(bytes));
    case 'stripmetadata': {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setCreator('');
      doc.setProducer('');
      return doc.save();
    }
    case 'pdfa':
      return preparePdfA(bytes, 'document.pdf');
    case 'protect':
      return encryptPdf(bytes, step.password);
  }
}

export interface BatchInput {
  name: string;
  bytes: Uint8Array;
}
export interface BatchResult {
  name: string;
  bytes?: Uint8Array;
  /** Error key or message when the file could not be processed */
  error?: string;
}
export interface BatchProgress {
  fileIndex: number;
  fileCount: number;
  stepIndex: number;
  stepCount: number;
  fileName: string;
}

export const outputName = (name: string) => name.replace(/\.pdf$/i, '') + '_processed.pdf';

/**
 * Runs the steps over every file. A file that fails is reported and skipped; the others continue.
 * With `mergeFirst`, all files are merged into one document before the steps run.
 */
export async function runBatch(
  files: BatchInput[],
  steps: BatchStep[],
  options: { mergeFirst?: boolean; onProgress?: (p: BatchProgress) => void } = {}
): Promise<BatchResult[]> {
  const problems = validateSteps(steps);
  if (problems.length) throw new Error(problems.join(','));

  const results: BatchResult[] = [];
  let inputs = files;

  // Password-protected inputs can't be edited; report them instead of producing broken files
  const usable: BatchInput[] = [];
  for (const f of files) {
    if (isEncrypted(f.bytes)) results.push({ name: f.name, error: 'encrypted' });
    else usable.push(f);
  }
  inputs = usable;

  if (options.mergeFirst && inputs.length > 0) {
    try {
      const merged = await mergePdfs(inputs.map((f) => ab(f.bytes)));
      inputs = [{ name: 'merged.pdf', bytes: merged }];
    } catch (err) {
      return [...results, { name: 'merged.pdf', error: (err as Error).message || 'merge-failed' }];
    }
  }

  for (let i = 0; i < inputs.length; i++) {
    const file = inputs[i];
    let bytes = file.bytes;
    try {
      for (let s = 0; s < steps.length; s++) {
        options.onProgress?.({ fileIndex: i, fileCount: inputs.length, stepIndex: s, stepCount: steps.length, fileName: file.name });
        bytes = await applyStep(bytes, steps[s]);
      }
      results.push({ name: outputName(file.name), bytes });
    } catch (err) {
      results.push({ name: file.name, error: (err as Error).message || 'failed' });
    }
  }
  return results;
}
