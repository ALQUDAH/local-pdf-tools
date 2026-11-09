/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Tool chaining: the last PDF a tool produced can be passed straight into another tool,
// without downloading and re-uploading it. Everything stays in memory on this device.

import { useSyncExternalStore } from 'react';

let lastResult: File | null = null;
let pending: File | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called when a tool saves a file. Only PDFs can be chained. */
export function recordResult(data: Blob, fileName: string) {
  const isPdf = data.type === 'application/pdf' || /\.pdf$/i.test(fileName);
  if (!isPdf) return;
  lastResult = new File([data], fileName, { type: 'application/pdf' });
  notify();
}

export function clearLastResult() {
  lastResult = null;
  notify();
}

/** Queues the last result for the next tool, which picks it up from its upload box. */
export function continueWithLastResult(): boolean {
  if (!lastResult) return false;
  pending = lastResult;
  lastResult = null;
  notify();
  return true;
}

/** Takes the queued file if the upload box accepts PDFs. Returns null otherwise. */
export function takePendingFile(accept: string): File | null {
  if (!pending || !/pdf/i.test(accept)) return null;
  const file = pending;
  pending = null;
  return file;
}

export function clearPendingFile() {
  pending = null;
}

export function useLastResult(): File | null {
  return useSyncExternalStore(subscribe, () => lastResult, () => null);
}
