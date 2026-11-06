/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Download,
  Eye,
  Settings,
  Hash,
  Sliders,
  Type
} from 'lucide-react';
import { PDFFile } from '../types';
import Dropzone from './Dropzone';
import { fileToArrayBuffer, getPdfDetails, downloadFile, sanitizeForWinAnsi, getNormalizedDrawingArgs } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

interface BatesToolProps {
  onBack: () => void;
}

export default function BatesTool({ onBack }: BatesToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Bates options
  const [prefix, setPrefix] = useState<string>('LIT-CASE-');
  const [suffix, setSuffix] = useState<string>('');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [digitPadding, setDigitPadding] = useState<number>(6); // e.g., 000001
  const [fontSize, setFontSize] = useState<number>(10);
  const [fontColor, setFontColor] = useState<string>('#b91c1c'); // red default
  const [skipFirstPage, setSkipFirstPage] = useState<boolean>(false);
  const [position, setPosition] = useState<'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right' | 'top-center' | 'top-left'>('bottom-right');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFileDrop = async (selectedFile: File) => {
    setLoading(true);
    setStatusText('Reading case documents...');
    setSuccess(false);

    try {
      const arrayBuffer = await fileToArrayBuffer(selectedFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: selectedFile,
        name: selectedFile.name,
        size: selectedFile.size,
        arrayBuffer,
        pageCount,
        previews
      });
      setPreviewPage(1);
    } catch (err) {
      console.error(err);
      alert('Could not parse PDF. Secure or corrupted structures cannot compile local frames.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  useEffect(() => {
    if (!file) return;
    renderPreview();
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [file, previewPage, prefix, suffix, startNumber, digitPadding, fontSize, fontColor, skipFirstPage, position]);

  const generateBatesString = (pageNumIndex: number): string => {
    // pageNumIndex is 0-based page index
    if (skipFirstPage && pageNumIndex === 0) {
      return '';
    }

    const offsetNumber = skipFirstPage ? startNumber + pageNumIndex - 1 : startNumber + pageNumIndex;
    const numStr = offsetNumber.toString().padStart(digitPadding, '0');
    return `${prefix}${numStr}${suffix}`;
  };

  const renderPreview = async () => {
    if (!file || !canvasRef.current) return;
    try {
      // Cancel previous task if any
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
        renderTaskRef.current = null;
      }

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.arrayBuffer.slice(0)) });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(previewPage);
      
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render base page first
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Draw virtual bates stamp guide overlays
      const stampText = generateBatesString(previewPage - 1);
      if (!stampText) return;

      ctx.fillStyle = fontColor;
      ctx.font = `bold ${fontSize + 1}px monospace`;
      const textWidth = ctx.measureText(stampText).width;

      let x = canvas.width - textWidth - 25;
      let y = canvas.height - 25;

      switch (position) {
        case 'bottom-left':
          x = 25;
          y = canvas.height - 25;
          break;
        case 'bottom-center':
          x = (canvas.width / 2) - (textWidth / 2);
          y = canvas.height - 25;
          break;
        case 'bottom-right':
          x = canvas.width - textWidth - 25;
          y = canvas.height - 25;
          break;
        case 'top-left':
          x = 25;
          y = 35;
          break;
        case 'top-center':
          x = (canvas.width / 2) - (textWidth / 2);
          y = 35;
          break;
        case 'top-right':
          x = canvas.width - textWidth - 25;
          y = 35;
          break;
      }

      // Draw highlighted stamp guide border backdrop
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // light transparent red
      ctx.fillRect(x - 4, y - fontSize - 2, textWidth + 8, fontSize + 8);
      
      ctx.strokeStyle = '#ef4444'; // solid crimson
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x - 4, y - fontSize - 2, textWidth + 8, fontSize + 8);

      // Draw actual text on top
      ctx.fillStyle = fontColor;
      ctx.fillText(stampText, x, y);

    } catch (err: any) {
      if (err && (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled'))) {
        return;
      }
      console.error('Failed to render Bates stamp preview:', err);
    }
  };

  const handleApplyBates = async () => {
    if (!file) return;
    setLoading(true);
    setStatusText('Stamping case files sequentially...');

    try {
      const pdfDoc = await PDFDocument.load(file.arrayBuffer, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const standardFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Parse color hex to rgb
      const hex = fontColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
      const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
      const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;

      pages.forEach((page, index) => {
        const stampText = generateBatesString(index);
        if (!stampText) return;

        const sanitizedLabel = sanitizeForWinAnsi(stampText);
        const { width, height } = page.getSize();
        const textWidth = standardFont.widthOfTextAtSize(sanitizedLabel, fontSize);

        let vx = width - textWidth - 30;
        let vy = 30; // default margin

        switch (position) {
          case 'bottom-left':
            vx = 30;
            vy = 30;
            break;
          case 'bottom-center':
            vx = (width / 2) - (textWidth / 2);
            vy = 30;
            break;
          case 'bottom-right':
            vx = width - textWidth - 30;
            vy = 30;
            break;
          case 'top-left':
            vx = 30;
            vy = height - 40;
            break;
          case 'top-center':
            vx = (width / 2) - (textWidth / 2);
            vy = height - 40;
            break;
          case 'top-right':
            vx = width - textWidth - 30;
            vy = height - 40;
            break;
        }

        const opts = getNormalizedDrawingArgs(page, vx, vy, 0, 0, 0);

        page.drawText(sanitizedLabel, {
          x: opts.x,
          y: opts.y,
          size: fontSize,
          font: standardFont,
          color: rgb(r, g, b),
          rotate: opts.rotate
        });
      });

      setStatusText('Saving stamped PDF sequence...');
      const savedBytes = await pdfDoc.save();
      const cleanName = file.name.replace('.pdf', '') + '_stamped.pdf';

      downloadFile(savedBytes, cleanName, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Could not apply Bates stamps onto PDF layers.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const idx = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, idx)).toFixed(1)) + ' ' + sizes[idx];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            id="btn-bates-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Hash className="w-6 h-6 text-emerald-500" /> Bates Numbering & Legal Stamp
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Stamp structured legal, commercial, or medical indexing series (e.g., LIT-CASE-000042) sequentially across multi-page corporate files.
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={() => {
              setFile(null);
              setSuccess(false);
            }}
            id="btn-bates-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 font-extrabold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            Change Document
          </button>
        )}
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files) => handleFileDrop(files[0])}
          multiple={false}
          title="Drop PDF to place Bates stamps"
          description="
            Formulate prefixes, serial pad sizes, starting indexes, and positioning. Processing compiles completely locally.
          "
        />
      ) : (
        /* Workspace layout */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Options side panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-5 shadow-xs">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-500" /> Series Parameters
              </h3>

              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Series Prefix Word</label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Series Suffix Word</label>
                  <input
                    type="text"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Start Num</label>
                    <input
                      type="number"
                      min="1"
                      value={startNumber}
                      onChange={(e) => setStartNumber(Math.max(1, Number(e.target.value)))}
                      className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Digit Pad Width</label>
                    <input
                      type="number"
                      min="2"
                      max="10"
                      value={digitPadding}
                      onChange={(e) => setDigitPadding(Math.max(2, Math.min(10, Number(e.target.value))))}
                      className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-850">
                  <span className="block text-[10px] font-bold font-mono uppercase text-slate-400">Template Stamp Preview</span>
                  <p className="p-2.5 bg-slate-50 dark:bg-slate-950 text-xs font-bold font-mono border border-slate-100 dark:border-slate-800 rounded-xl text-center text-rose-600 truncate">
                    {generateBatesString(0) || '[skipped page first]'}
                  </p>
                </div>
              </div>

              {/* Set multi-page placements */}
              <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-4">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> Adjust Coordinates
                </h4>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Page placement Position</label>
                  <select
                    value={position}
                    onChange={(e: any) => setPosition(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl cursor-pointer"
                  >
                    <option value="top-right">Top-Right Margins</option>
                    <option value="top-center">Top-Center Margins</option>
                    <option value="top-left">Top-Left Margins</option>
                    <option value="bottom-right">Bottom-Right Margins</option>
                    <option value="bottom-center">Bottom-Center Margins</option>
                    <option value="bottom-left">Bottom-Left Margins</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Font size</label>
                    <input
                      type="number"
                      min="6"
                      max="24"
                      value={fontSize}
                      onChange={(e) => setFontSize(Math.max(6, Math.min(24, Number(e.target.value))))}
                      className="w-full text-xs font-bold p-2.5 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono uppercase text-slate-400">Stamp color</label>
                    <input
                      type="color"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      className="w-full h-10 border border-slate-100 dark:border-slate-800 bg-transparent cursor-pointer rounded-xl"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipFirstPage}
                    onChange={(e) => setSkipFirstPage(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-100 dark:border-slate-800 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Skip First Page Title</span>
                </label>
              </div>
            </div>

            {/* Apply and run stamp processes */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-850 text-white space-y-4 shadow-sm">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex justify-between">
                <span>Active File</span>
                <span className="text-emerald-400">Legal Stamping</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold text-slate-200 truncate">{file.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{file.pageCount} Pages • {file.pageCount} stamps queued</span>
              </div>

              {success ? (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-bold">Bates document exported!</span>
                </div>
              ) : (
                <button
                  onClick={handleApplyBates}
                  id="btn-bates-compile"
                  className="w-full text-center py-3 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 text-white cursor-pointer uppercase font-mono tracking-widest"
                >
                  <Hash className="w-4 h-4" /> Stamp & Download
                </button>
              )}
            </div>

          </div>

          {/* Central Page View panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[480px] shadow-inner relative">
              
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold shadow-xs">
                <Eye className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Real-time Stamp Guide • Page {previewPage} of {file.pageCount}
              </div>

              <div className="bg-white p-2 rounded-2xl border border-slate-250 dark:border-slate-800 shadow-md max-w-full overflow-hidden my-6">
                <canvas ref={canvasRef} className="max-w-full h-auto" />
              </div>

              {/* Pagination controls */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  disabled={previewPage === 1}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Previous page
                </button>
                <span className="text-xs font-bold text-slate-550 dark:text-slate-400 px-2 font-mono">Page {previewPage} of {file.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.min(file.pageCount, prev + 1))}
                  disabled={previewPage === file.pageCount}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Next page
                </button>
              </div>
            </div>

            <div className="bg-emerald-500/5 text-emerald-800 dark:text-emerald-400 border border-emerald-500/10 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-left">
              <Type className="w-5 h-5 shrink-0 text-emerald-500" />
              <div>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">Legal indexing vector standards:</span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Bates indexing utilizes embedded TrueType vectors which are fully scale-independent. Your final document preserves maximum visual fidelity and alignment accuracy when compressed, reviewed, printed, or compiled across standard document architectures.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in animate-duration-200">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center max-w-xs text-center space-y-4 shadow-xl">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{statusText}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Applying Bates vectors sequentially...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
