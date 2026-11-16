/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Sparkles, 
  CheckCircle, 
  RefreshCw, 
  Download, 
  Eye, 
  Info, 
  Sliders, 
  ShieldCheck 
} from 'lucide-react';
import { PDFFile } from '../types';
import Dropzone from './Dropzone';
import { fileToArrayBuffer, getPdfDetails, downloadFile } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import { PDFDocument } from 'pdf-lib';

import { tr } from '../i18n';
interface GrayscaleToolProps {
  onBack: () => void;
}

type FilterType = 'grayscale' | 'monochrome' | 'tint';

export default function GrayscaleTool({ onBack }: GrayscaleToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  
  // Options
  const [filterType, setFilterType] = useState<FilterType>('grayscale');
  const [threshold, setThreshold] = useState<number>(128); // For monochrome (0-255)
  const [tintColor, setTintColor] = useState<string>('#4f46e5'); // To apply branding tint
  const [scale, setScale] = useState<number>(1.0); // Page width scale factor
  const [quality, setQuality] = useState<number>(0.85); // JPEG compression
  
  // Previews
  const [previewPage, setPreviewPage] = useState<number>(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFileDrop = async (selectedFile: File) => {
    setLoading(true);
    setStatusText(tr("Reading PDF content..."));
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
      alert(tr("Could not parse PDF. Secure or corrupted structures cannot compile local frames."));
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
  }, [file, previewPage, filterType, threshold, tintColor, scale]);

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
      
      const viewport = page.getViewport({ scale: 1.2 * scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Draw blank white canvas base
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render standard page to canvas first
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Apply pixel modulation filters entirely in-memory
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imgData.data;

      if (filterType === 'grayscale') {
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i+1];
          const b = pixels[i+2];

          // ITU-R BT.709 grayscale luma weights
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

          pixels[i] = luma;
          pixels[i+1] = luma;
          pixels[i+2] = luma;
        }
      } else if (filterType === 'monochrome') {
        const t = threshold;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i+1];
          const b = pixels[i+2];

          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const finalVal = luma >= t ? 255 : 0;

          pixels[i] = finalVal;
          pixels[i+1] = finalVal;
          pixels[i+2] = finalVal;
        }
      } else if (filterType === 'tint') {
        // Parse branding hex to rgb weights
        const rgbTint = hexToRgb(tintColor) || { r: 79, g: 70, b: 229 };
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i+1];
          const b = pixels[i+2];

          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0.0 to 1.0

          pixels[i] = luma * rgbTint.r;
          pixels[i+1] = luma * rgbTint.g;
          pixels[i+2] = luma * rgbTint.b;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (err: any) {
      if (err && (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled'))) {
        return;
      }
      console.error('Failed to render filter preview:', err);
    }
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const handleCompile = async () => {
    if (!file) return;
    setLoading(true);
    setStatusText(tr("Compiling modified pages..."));
    
    try {
      // 1. Create a fresh pdf-lib destination doc
      const outPdf = await PDFDocument.create();

      // 2. Open PDFJS source
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.arrayBuffer.slice(0)) });
      const doc = await loadingTask.promise;
      const totalPages = doc.numPages;

      // 3. Render and process each frame to compressed JPEG blobs
      for (let i = 1; i <= totalPages; i++) {
        setStatusText(tr("Rendering & Filter-stamping Page {0} of {1}...", i, totalPages));
        
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: scale });

        // Offscreen processing canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render page context
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas
        }).promise;

        // Apply filters
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imgData.data;

        if (filterType === 'grayscale') {
          for (let p = 0; p < pixels.length; p += 4) {
            const luma = 0.2126 * pixels[p] + 0.7152 * pixels[p+1] + 0.0722 * pixels[p+2];
            pixels[p] = luma;
            pixels[p+1] = luma;
            pixels[p+2] = luma;
          }
        } else if (filterType === 'monochrome') {
          const t = threshold;
          for (let p = 0; p < pixels.length; p += 4) {
            const luma = 0.299 * pixels[p] + 0.587 * pixels[p+1] + 0.114 * pixels[p+2];
            const finalVal = luma >= t ? 255 : 0;
            pixels[p] = finalVal;
            pixels[p+1] = finalVal;
            pixels[p+2] = finalVal;
          }
        } else if (filterType === 'tint') {
          const rgbTint = hexToRgb(tintColor) || { r: 79, g: 70, b: 229 };
          for (let p = 0; p < pixels.length; p += 4) {
            const luma = (0.2126 * pixels[p] + 0.7152 * pixels[p+1] + 0.0722 * pixels[p+2]) / 255;
            pixels[p] = luma * rgbTint.r;
            pixels[p+1] = luma * rgbTint.g;
            pixels[p+2] = luma * rgbTint.b;
          }
        }

        ctx.putImageData(imgData, 0, 0);

        // Convert offscreen canvas directly into compiled compressed JPEG blob
        const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
        const res = await fetch(jpegDataUrl);
        const pageImgBuffer = await res.arrayBuffer();

        // Embed back into compilation document
        const embeddedImg = await outPdf.embedJpg(pageImgBuffer);
        const compiledPage = outPdf.addPage([viewport.width, viewport.height]);
        compiledPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height
        });
      }

      setStatusText(tr("Saving final file bytes..."));
      const savedBytes = await outPdf.save();
      const cleanName = file.name.replace('.pdf', '') + '_grayscale.pdf';

      downloadFile(savedBytes, cleanName, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to compile compressed grayscale layers. Ensure security flags are unencrypted."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={tr("Back to Dashboard")}
            title={tr("Back to Dashboard")}
            id="btn-grayscale-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-500 animate-pulse" /> {tr("Grayscale & Monochrome Converter")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              {tr("Reduce printer ink usage, remove visual color noise, or convert scanned documents into clean monochrome layouts.")}
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={() => {
              setFile(null);
              setSuccess(false);
            }}
            id="btn-grayscale-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 font-bold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            {tr("Change Document")}
          </button>
        )}
      </div>

      {!file ? (
        /* Dropzone Upload Layout */
        <Dropzone
          onFilesSelected={(files) => handleFileDrop(files[0])}
          multiple={false}
          title={tr("Drop PDF to convert to Grayscale")}
          description={tr("Upload document to apply ink-saving monochrome photocopy matrixes, desaturate standard layouts, and compress size locally.")}
        />
      ) : (
        /* Workspace Editor Panel */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Options Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-5 shadow-xs">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tr("Shader Options")}
              </h3>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setFilterType('grayscale')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-start cursor-pointer ${
                    filterType === 'grayscale'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>{tr("Premium Grayscale")}</span>
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-400 border border-white" />
                </button>

                <button
                  type="button"
                  onClick={() => setFilterType('monochrome')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-start cursor-pointer ${
                    filterType === 'monochrome'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>{tr("Monochrome Photocopy")}</span>
                  <div className="w-3.5 h-3.5 rounded-full bg-black border border-white" />
                </button>

                <button
                  type="button"
                  onClick={() => setFilterType('tint')}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all text-start cursor-pointer ${
                    filterType === 'tint'
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'border-slate-100 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>{tr("Color Branding Tint")}</span>
                  <div className={`w-3.5 h-3.5 rounded-full border border-white`} style={{ backgroundColor: tintColor }} />
                </button>
              </div>

              {/* Dynamic Sub-Sliders */}
              <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-4">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> {tr("Adjust Parameters")}
                </h4>

                {filterType === 'monochrome' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>{tr("Monochrome Threshold")}</span>
                      <span className="font-mono">{threshold}</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="240"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-400 dark:text-slate-500">{tr("Lower makes document darker; higher yields cleaner margins and brighter canvas areas.")}</p>
                  </div>
                )}

                {filterType === 'tint' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>{tr("Select Tint Hue")}</span>
                    </div>
                    <input
                      type="color"
                      value={tintColor}
                      onChange={(e) => setTintColor(e.target.value)}
                      className="w-full h-8 bg-transparent cursor-pointer rounded-lg border border-slate-100 dark:border-slate-800"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>{tr("Width Resolution Scale")}</span>
                    <span>{(scale * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[9px] text-slate-400 dark:text-slate-500">{tr("Scale the width dimensions. Lower ratios yield tiny file sizes.")}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>{tr("Compression Quality")}</span>
                    <span>{(quality * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="1.0"
                    step="0.05"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Run compile action block */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-850 text-white space-y-4 shadow-sm">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex items-center justify-between">
                <span>{tr("Active File")}</span>
                <span className="text-emerald-400">{tr("Private Sandbox")}</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold text-slate-200 truncate">{file.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{file.pageCount} {tr("Pages •")} {formatFileSize(file.size)}</span>
              </div>

              {success ? (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-bold">{tr("Grayscale PDF downloaded!")}</span>
                </div>
              ) : (
                <button
                  onClick={handleCompile}
                  id="btn-grayscale-compile"
                  className="w-full text-center py-3 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-sm rounded-xl transition-all flex items-center justify-center gap-2 text-white cursor-pointer hover:shadow-md active:scale-98"
                >
                  <Download className="w-4 h-4" /> {tr("Convert & Download")}
                </button>
              )}
            </div>
          </div>

          {/* Canvas Previewer */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[480px] shadow-inner relative">
              <div className="absolute top-4 left-4 flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold">
                <Eye className="w-3.5 h-3.5 text-emerald-500" /> {tr("Live Preview Frame • Page")} {previewPage} {tr("of")} {file.pageCount}
              </div>

              <div className="bg-white p-2 rounded-2xl border border-slate-250 dark:border-slate-800 shadow-md max-w-full overflow-hidden my-6">
                <canvas ref={canvasRef} className="max-w-full h-auto" />
              </div>

              {/* Preview Pagination */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  disabled={previewPage === 1}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Previous Frame")}
                </button>
                <span className="text-xs font-bold text-slate-550 dark:text-slate-400 px-2">{tr("Page")} {previewPage} {tr("of")} {file.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.min(file.pageCount, prev + 1))}
                  disabled={previewPage === file.pageCount}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Next Frame")}
                </button>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 flex gap-3 text-xs text-start leading-relaxed">
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-500" />
              <div>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{tr("Local Privacy Architecture Secured:")}</span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr("Page-by-page color filtration is completely computed natively inside your sandbox container browser canvas contexts. Your source data or processed pixels are never uploaded to our hosting servers, remaining 100% compliant and private.")}
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
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{tr("Applying pixel transformations...")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
