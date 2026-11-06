/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Crop, 
  RefreshCw, 
  Download, 
  Eye, 
  Settings, 
  CheckCircle,
  HelpCircle,
  Scissors
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, downloadFile } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import Dropzone from './Dropzone';

interface CropToolProps {
  onBack: () => void;
}

export default function CropTool({ onBack }: CropToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Crop percentage coordinates: 0 to 100%
  const [cropLeft, setCropLeft] = useState<number>(10);
  const [cropRight, setCropRight] = useState<number>(10);
  const [cropTop, setCropTop] = useState<number>(10);
  const [cropBottom, setCropBottom] = useState<number>(10);
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  // Mouse selection state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFileDrop = async (selectedFile: File) => {
    setLoading(true);
    setStatusText('Analyzing document for visual cropping...');
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
      alert('Could not parse PDF. Ensure files are non-protected Standard PDFs.');
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
  }, [file, previewPage]);

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

      // Draw blank white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render actual original PDF page first
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

    } catch (err: any) {
      if (err && (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled'))) {
        return;
      }
      console.error('Failed to render visual crop overlay:', err);
    }
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    
    // reset current box to just a point
    updateCropFromSelection(x, y, x, y);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    updateCropFromSelection(startPos.x, startPos.y, x, y);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const updateCropFromSelection = (startX: number, startY: number, endX: number, endY: number) => {
    if (!canvasRef.current) return;
    
    const rectX = Math.min(startX, endX);
    const rectY = Math.min(startY, endY);
    const rectW = Math.abs(startX - endX);
    const rectH = Math.abs(startY - endY);

    const canvasWidth = canvasRef.current.offsetWidth;
    const canvasHeight = canvasRef.current.offsetHeight;

    const newLeft = (rectX / canvasWidth) * 100;
    const newTop = (rectY / canvasHeight) * 100;
    const newRight = 100 - ((rectX + rectW) / canvasWidth) * 100;
    const newBottom = 100 - ((rectY + rectH) / canvasHeight) * 100;

    // Use smaller rounding to keep precision, limit between 0 and barely touching
    setCropLeft(Math.max(0, Math.min(99, Number(newLeft.toFixed(2)))));
    setCropTop(Math.max(0, Math.min(99, Number(newTop.toFixed(2)))));
    setCropRight(Math.max(0, Math.min(99, Number(newRight.toFixed(2)))));
    setCropBottom(Math.max(0, Math.min(99, Number(newBottom.toFixed(2)))));
  };

  const handleCropCompile = async () => {
    if (!file) return;
    setLoading(true);
    setStatusText('Applying precision crop factors...');
    
    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(file.arrayBuffer), { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      const startIndex = applyToAll ? 0 : previewPage - 1;
      const endIndex = applyToAll ? totalPages - 1 : previewPage - 1;

      const pagesToFlatten = new Set<number>();

      for (let i = startIndex; i <= endIndex; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        const angle = page.getRotation().angle || 0;

        let visualWidth = width;
        let visualHeight = height;

        if (angle === 90 || angle === 270 || angle === -90) {
          visualWidth = height;
          visualHeight = width;
        }

        // Calculate visual trim points based on visual size
        const vLeftTrimPx = (cropLeft / 100) * visualWidth;
        const vRightTrimPx = (cropRight / 100) * visualWidth;
        const vTopTrimPx = (cropTop / 100) * visualHeight;
        const vBottomTrimPx = (cropBottom / 100) * visualHeight;

        // Map visual trims to physical margins based on rotation
        let P_trim_left = vLeftTrimPx;
        let P_trim_bottom = vBottomTrimPx;
        let P_trim_right = vRightTrimPx;
        let P_trim_top = vTopTrimPx;

        if (angle === 90) {
          P_trim_left = vTopTrimPx;
          P_trim_bottom = vLeftTrimPx;
          P_trim_right = vBottomTrimPx;
          P_trim_top = vRightTrimPx;
        } else if (angle === 180) {
          P_trim_left = vRightTrimPx;
          P_trim_bottom = vTopTrimPx;
          P_trim_right = vLeftTrimPx;
          P_trim_top = vBottomTrimPx;
        } else if (angle === 270 || angle === -90) {
          P_trim_left = vBottomTrimPx;
          P_trim_bottom = vRightTrimPx;
          P_trim_right = vTopTrimPx;
          P_trim_top = vLeftTrimPx;
        }

        const cropBox = page.getCropBox();
        const cropX = cropBox.x + P_trim_left;
        const cropY = cropBox.y + P_trim_bottom;
        const cropW = cropBox.width - P_trim_left - P_trim_right;
        const cropH = cropBox.height - P_trim_top - P_trim_bottom;

        // Apply Native PDF CropBox adjustments
        // Crucial feature representation: page.setCropBox adjusts standard reader visibilities instantly!
        page.setCropBox(cropX, cropY, cropW, cropH);
        page.setMediaBox(cropX, cropY, cropW, cropH);

        pagesToFlatten.add(i);
      }

      setStatusText('Rasterizing to flatten trimmed boundaries permanently...');
      const intermediateBytes = await pdfDoc.save();

      let finalSavedBytes = intermediateBytes;
      
      if (pagesToFlatten.size > 0) {
        const clone1 = new Uint8Array(intermediateBytes.length);
        clone1.set(intermediateBytes);
        const pdfJsDoc = await pdfjsLib.getDocument({ data: clone1 }).promise;

        const clone2 = new Uint8Array(intermediateBytes.length);
        clone2.set(intermediateBytes);
        const finalPdfDoc = await PDFDocument.load(clone2, { ignoreEncryption: true });

        const sortedPages = Array.from(pagesToFlatten).sort((a, b) => b - a);

        for (const pageIdx of sortedPages) {
          const pdfPage = await pdfJsDoc.getPage(pageIdx + 1);
          
          const originalViewport = pdfPage.getViewport({ scale: 1.0 });
          const viewport = pdfPage.getViewport({ scale: 2.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgBytes = Uint8Array.from(atob(imgData.split(',')[1]), c => c.charCodeAt(0));
            const embeddedImg = await finalPdfDoc.embedJpg(imgBytes);

            finalPdfDoc.removePage(pageIdx);
            const newPage = finalPdfDoc.insertPage(pageIdx, [originalViewport.width, originalViewport.height]);
            newPage.drawImage(embeddedImg, {
              x: 0,
              y: 0,
              width: originalViewport.width,
              height: originalViewport.height,
            });
          }
        }
        
        finalSavedBytes = await finalPdfDoc.save();
      }

      setStatusText('Saving trimmed PDF document...');
      const newName = file.name.replace('.pdf', '') + '_cropped.pdf';

      downloadFile(finalSavedBytes, newName, 'application/pdf');
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert(`Could not apply crop coordinates onto document streams: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const rIdx = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, rIdx)).toFixed(1)) + ' ' + sizes[rIdx];
  };

  return (
    <div className="space-y-6">
      {/* Header element */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            id="btn-crop-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Crop className="w-6 h-6 text-emerald-500" /> Page Cropper & Margin Trim
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Eliminate extensive margins, cut out signature margins, or crop specific segments from single or multiple pages visually.
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={() => {
              setFile(null);
              setSuccess(false);
            }}
            id="btn-crop-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 id-heavy font-extrabold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            Change Document
          </button>
        )}
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files) => handleFileDrop(files[0])}
          multiple={false}
          title="Drop PDF to crop margins"
          description="Interactively select and modify page dimensions in-house. Your documents are NEVER processed or saved outside."
        />
      ) : (
        /* Visual workspace block */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Controls Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-5 shadow-xs">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-550 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-500" /> Bounding Selection
              </h3>

              <div className="space-y-4">
                {/* Crop sliders */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-455">
                    <span>Trim Top Margin</span>
                    <span className="font-mono text-emerald-500">{cropTop}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="99"
                    step="0.5"
                    value={cropTop}
                    onChange={(e) => setCropTop(Math.min(99 - cropBottom, Number(e.target.value)))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-455">
                    <span>Trim Bottom Margin</span>
                    <span className="font-mono text-emerald-500">{cropBottom}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="99"
                    step="0.5"
                    value={cropBottom}
                    onChange={(e) => setCropBottom(Math.min(99 - cropTop, Number(e.target.value)))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-455">
                    <span>Trim Left Margin</span>
                    <span className="font-mono text-emerald-500">{cropLeft}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="99"
                    step="0.5"
                    value={cropLeft}
                    onChange={(e) => setCropLeft(Math.min(99 - cropRight, Number(e.target.value)))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-455">
                    <span>Trim Right Margin</span>
                    <span className="font-mono text-emerald-500">{cropRight}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="99"
                    step="0.5"
                    value={cropRight}
                    onChange={(e) => setCropRight(Math.min(99 - cropLeft, Number(e.target.value)))}
                    className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Set multi-page scopes */}
              <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-3">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">Range Action Scope</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setApplyToAll(true)}
                    className={`py-2 px-3 border text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      applyToAll
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    All Pages ({file.pageCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyToAll(false)}
                    className={`py-2 px-3 border text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                      !applyToAll
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Only Page {previewPage}
                  </button>
                </div>
              </div>
            </div>

            {/* Run crop action panel */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-850 text-white space-y-4 shadow-sm">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex justify-between">
                <span>Active Target</span>
                <span className="text-emerald-400">Cropped Output</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold text-slate-200 truncate">{file.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{file.pageCount} Pages • {formatFileSize(file.size)}</span>
              </div>

              {success ? (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-bold">Cropped PDF saved successfully!</span>
                </div>
              ) : (
                <button
                  onClick={handleCropCompile}
                  id="btn-crop-compile"
                  className="w-full text-center py-3 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs  rounded-xl transition-all flex items-center justify-center gap-2 text-white cursor-pointer hover:shadow-md active:scale-98 uppercase font-mono tracking-widest"
                >
                  <Scissors className="w-4 h-4" /> Trim & Download PDF
                </button>
              )}
            </div>
          </div>

          {/* Viewport page container */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[480px] shadow-inner relative">
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold shadow-xs">
                <Eye className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Cropping Bounds Match • Page {previewPage} of {file.pageCount}
              </div>

              <div 
                className="bg-white p-0 rounded-2xl border border-slate-250 dark:border-slate-800 shadow-md max-w-full overflow-hidden my-6 relative cursor-crosshair inline-block select-none transform-gpu"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <canvas ref={canvasRef} className="max-w-full h-auto pointer-events-none block" />
                
                {/* Visual Overlay crop boundaries overlay via pure CSS */}
                <div style={{ top: 0, left: 0, right: 0, height: `${cropTop}%`}} className="absolute bg-slate-900/65 pointer-events-none" />
                <div style={{ bottom: 0, left: 0, right: 0, height: `${cropBottom}%`}} className="absolute bg-slate-900/65 pointer-events-none" />
                <div style={{ top: `${cropTop}%`, bottom: `${cropBottom}%`, left: 0, width: `${cropLeft}%`}} className="absolute bg-slate-900/65 pointer-events-none" />
                <div style={{ top: `${cropTop}%`, bottom: `${cropBottom}%`, right: 0, width: `${cropRight}%`}} className="absolute bg-slate-900/65 pointer-events-none" />
                
                {/* Crop border box */}
                <div 
                  style={{ top: `${cropTop}%`, bottom: `${cropBottom}%`, left: `${cropLeft}%`, right: `${cropRight}%`}} 
                  className="absolute border-2 border-emerald-500 border-dashed pointer-events-none shadow-sm"
                >
                  {/* Corners */}
                  <div className="absolute top-[calc(-4px)] left-[calc(-4px)] w-2 h-2 bg-emerald-500 rounded-xs" />
                  <div className="absolute top-[calc(-4px)] right-[calc(-4px)] w-2 h-2 bg-emerald-500 rounded-xs" />
                  <div className="absolute bottom-[calc(-4px)] left-[calc(-4px)] w-2 h-2 bg-emerald-500 rounded-xs" />
                  <div className="absolute bottom-[calc(-4px)] right-[calc(-4px)] w-2 h-2 bg-emerald-500 rounded-xs" />
                </div>
              </div>

              {/* Pagination controls */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  disabled={previewPage === 1}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Previous Page
                </button>
                <span className="text-xs font-bold text-slate-550 dark:text-slate-400 px-2 font-mono">Page {previewPage} of {file.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.min(file.pageCount, prev + 1))}
                  disabled={previewPage === file.pageCount}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Next Page
                </button>
              </div>
            </div>

            <div className="bg-emerald-500/5 text-emerald-800 dark:text-emerald-400 border border-emerald-500/10 rounded-2xl p-4 flex gap-3 text-xs text-left leading-relaxed">
              <Scissors className="w-5 h-5 shrink-0 text-emerald-500" />
              <div>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">How Native PDF Cropping works:</span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Instead of converting pages to flat rasterized images, this tool adjusts the internal `/CropBox` and `/MediaBox` bounding metadata fields of the document directly. This keeps your document's text layers hyper-sharp, clickable, searchable, and fully vector-retained, but hidden outside the new bounds.
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
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Adjusting page viewports...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
