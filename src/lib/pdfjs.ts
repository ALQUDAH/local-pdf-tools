/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Configure the PDF.js worker from the locally bundled file so documents are
// parsed without fetching code from a third-party CDN (works offline, too).
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export default pdfjsLib;
