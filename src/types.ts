/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PDFFile {
  id: string;
  file: File;
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
  pageCount: number;
  previews: string[]; // Base64 data URLs of page thumbnails
}

export type ActiveTool = 
  | 'dashboard' 
  | 'merge' 
  | 'split' 
  | 'images' 
  | 'protect'
  | 'imagestopdf'
  | 'rotate'
  | 'organize'
  | 'pagenumbers'
  | 'compress'
  | 'watermark'
  | 'metadata'
  | 'sign'
  | 'ocr'
  | 'nup'
  | 'overlay'
  | 'scanner'
  | 'formfiller'
  | 'batchconverter'
  | 'extractor'
  | 'compare'
  | 'grayscale'
  | 'crop'
  | 'formbuilder'
  | 'bates'
  | 'redact'
  | 'flatten'
  | 'repair'
  | 'resize'
  | 'addmargin'
  | 'pdftoword'
  | 'pdftopowerpoint'
  | 'pdftoexcel'
  | 'wordtopdf'
  | 'powerpointtopdf'
  | 'exceltopdf'
  | 'editpdf'
  | 'htmltopdf'
  | 'unlockpdf'
  | 'pdftopdfa'
  | 'translatepdf';

export interface SplitRange {
  start: number;
  end: number;
}
