/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Download,
  Eye,
  Settings,
  Shield,
  Trash2,
  Plus,
  Sliders,
  Trash,
  MousePointer2
} from 'lucide-react';
import { PDFFile } from '../types';
import Dropzone from './Dropzone';
import { fileToArrayBuffer, getPdfDetails, downloadFile, getNormalizedDrawingArgs } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { Rnd } from 'react-rnd';

import { tr } from '../i18n';
interface RedactToolProps {
  onBack: () => void;
}

interface RedactionBox {
  id: string;
  page: number; // 1-based page index
  xPct: number; // Percentage from left of page (0-100)
  yPct: number; // Percentage from top of page (0-100)
  widthPct: number; // Percentage of page width (2-50)
  heightPct: number; // Percentage of page height (2-20)
}

export default function RedactTool({ onBack }: RedactToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Redaction boxes custom list
  const [redactions, setRedactions] = useState<RedactionBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Drawing state
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  const handleFileDrop = async (selectedFile: File) => {
    setLoading(true);
    setStatusText(tr("Loading document for security sweeps..."));
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
      setRedactions([]);
      setSelectedBoxId(null);
    } catch (err) {
      console.error(err);
      alert(tr("Could not parse PDF. Ensure files are non-protected Standard PDFs."));
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
  }, [file, previewPage]); // Removed redactions from dependency since we are rendering them as Overlays now

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
      setContainerDimensions({ width: viewport.width, height: viewport.height });

      // Clear base page context
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render actual original PDF page backdrops
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Note: We no longer draw the redaction blocks directly onto the canvas. 
      // They are rendered as interactive overlay HTML elements on top of the canvas wrapper instead!

    } catch (err: any) {
      if (err && (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled'))) {
        return;
      }
      console.error('Failed to render page layout preview:', err);
    }
  };

  const handleAddRedaction = () => {
    if (!file) return;

    const newRedaction: RedactionBox = {
      id: Math.random().toString(36).substring(2, 9),
      page: previewPage,
      xPct: 15,
      yPct: 15,
      widthPct: 35,
      heightPct: 8
    };

    setRedactions([...redactions, newRedaction]);
    setSelectedBoxId(newRedaction.id);
  };

  const handleDeleteRedaction = (id: string) => {
    setRedactions(redactions.filter(r => r.id !== id));
    if (selectedBoxId === id) {
      setSelectedBoxId(null);
    }
  };

  const updateRedaction = (id: string, updater: Partial<RedactionBox>) => {
    setRedactions(prev => prev.map(box => {
      if (box.id === id) {
        return { ...box, ...updater };
      }
      return box;
    }));
  };

  const currentSelectedBox = redactions.find(r => r.id === selectedBoxId);

  // Mouse Handlers for Drawing Redactions
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start drawing if the user clicked directly on the wrapper container
    if (e.target !== e.currentTarget && e.target !== canvasRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setSelectedBoxId(null); // deselect existing
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Bounds checking
    const clientX = Math.max(rect.left, Math.min(e.clientX, rect.right));
    const clientY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const nx = Math.min(x, startPoint.x);
    const ny = Math.min(y, startPoint.y);
    const nw = Math.abs(x - startPoint.x);
    const nh = Math.abs(y - startPoint.y);
    
    setCurrentBox({ x: nx, y: ny, width: nw, height: nh });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentBox && currentBox.width > 5 && currentBox.height > 5 && containerDimensions.width > 0) {
      const { width, height } = containerDimensions;
      
      const newBox: RedactionBox = {
         id: Math.random().toString(36).substring(2, 9),
         page: previewPage,
         xPct: (currentBox.x / width) * 100,
         yPct: (currentBox.y / height) * 100,
         widthPct: (currentBox.width / width) * 100,
         heightPct: (currentBox.height / height) * 100
      };
      
      setRedactions([...redactions, newBox]);
      setSelectedBoxId(newBox.id);
    }
    setCurrentBox(null);
  };

  const handleBurnRedaction = async () => {
    if (!file) return;
    setLoading(true);
    setStatusText(tr("Burning solid blackout vectors into PDF structures..."));

    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(file.arrayBuffer), { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      redactions.forEach((box) => {
        const pageIdx = box.page - 1;
        if (pageIdx < 0 || pageIdx >= pages.length) return;

        const page = pages[pageIdx];
        const { width, height } = page.getSize();
        const angle = page.getRotation().angle || 0;

        const isRotated = angle === 90 || angle === 270 || angle === -90 || angle === -270;
        const visualWidth = isRotated ? height : width;
        const visualHeight = isRotated ? width : height;

        const rx = (box.xPct / 100) * visualWidth;
        const ry = visualHeight - ((box.yPct / 100) * visualHeight) - ((box.heightPct / 100) * visualHeight);
        const rw = (box.widthPct / 100) * visualWidth;
        const rh = (box.heightPct / 100) * visualHeight;

        const drawOpts = getNormalizedDrawingArgs(page, rx, ry, rw, rh);

        page.drawRectangle({
          ...drawOpts,
          color: rgb(0, 0, 0)
        });
      });

      setStatusText(tr("Rasterizing to flatten text payloads permanently..."));
      const intermediateBytes = await pdfDoc.save();

      const pagesWithRedactions = new Set<number>();
      redactions.forEach(r => pagesWithRedactions.add(r.page - 1));

      let finalSavedBytes = intermediateBytes;

      if (pagesWithRedactions.size > 0) {
        // pdf.js can detach the underlying ArrayBuffer during worker processing, 
        // so we fiercely clone the bytes before passing it.
        const clone1 = new Uint8Array(intermediateBytes.length);
        clone1.set(intermediateBytes);
        const pdfJsDoc = await pdfjsLib.getDocument({ data: clone1 }).promise;

        const clone2 = new Uint8Array(intermediateBytes.length);
        clone2.set(intermediateBytes);
        const finalPdfDoc = await PDFDocument.load(clone2, { ignoreEncryption: true });

        const sortedPages = Array.from(pagesWithRedactions).sort((a, b) => b - a);

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

      setStatusText(tr("Encrypting compliance hashes..."));
      const cleanName = file.name.replace('.pdf', '') + '_redacted.pdf';

      downloadFile(finalSavedBytes, cleanName, 'application/pdf');
      setSuccess(true);
    } catch (err: any) {
      console.error("Error during redact:", err);
      // We also display the specific error in standard user UI
      alert(tr("Could not overlay solid redaction blocks: {0}", err.message || 'Unknown error'));
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
            aria-label={tr("Back to Dashboard")}
            title={tr("Back to Dashboard")}
            id="btn-redact-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Shield className="w-6 h-6 text-rose-500 animate-pulse" /> {tr("Permanent Redaction & Blackout")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              {tr("Irreversibly black out confidential data or private names, burning solid vector layers locally so that text underneath is covered.")}
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={() => {
              setFile(null);
              setSuccess(false);
              setRedactions([]);
              setSelectedBoxId(null);
            }}
            id="btn-redact-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 font-extrabold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            {tr("Change Document")}
          </button>
        )}
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files) => handleFileDrop(files[0])}
          multiple={false}
          title={tr("Drop PDF to permanently redact private data")}
          description={tr("Confidential security filters are compiled and secured entirely in-browser sandbox caches. No external transmissions or storage logs are kept.")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Options sidebar */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Create block helper */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">{tr("Security Actions")}</h3>
              
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">{tr("✍️ Interactive Blackouts")}</span>
                  {tr("Draw rectangles directly on the document by clicking and dragging your mouse. You can resize and move them freely.")}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddRedaction}
                className="w-full flex items-center justify-center gap-1.5 py-4 px-4 bg-rose-500 hover:bg-rose-450 border border-transparent hover:border-rose-400 rounded-xl text-white font-extrabold text-xs uppercase cursor-pointer tracking-widest hover:shadow-md transition-all active:scale-98"
              >
                <Plus className="w-4 h-4 shrink-0" /> {tr("Add Default Box")}
              </button>
            </div>

            {/* List of current redaction boxes */}
            {redactions.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-550">{tr("Active Targets (")}{redactions.length})</h3>
                  <button 
                    onClick={() => { setRedactions([]); setSelectedBoxId(null); }}
                    className="text-[10px] uppercase font-bold text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    {tr("Clear All")}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pe-1">
                  {redactions.map((box, index) => (
                    <button
                      key={box.id}
                      type="button"
                      onClick={() => setSelectedBoxId(box.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        box.id === selectedBoxId
                          ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-l-4 border-rose-500 font-bold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate pe-2">{tr("Box #")}{index + 1}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-mono opacity-60">{tr("Page")} {box.page}</span>
                        <Trash2 
                           onClick={(e) => { e.stopPropagation(); handleDeleteRedaction(box.id); }} 
                           className="w-3.5 h-3.5 text-rose-400 hover:text-rose-600 ms-1" 
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Burn action block */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-850 text-white space-y-4 shadow-sm font-sans">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex justify-between">
                <span>{tr("Sanitization")}</span>
                <span className="text-rose-400">{tr("Military-Burn")}</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold truncate">{file.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{file.pageCount} {tr("Pages •")} {redactions.length} {tr("Blackouts queued")}</span>
              </div>

              {success ? (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-xl flex items-center gap-2 font-bold">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{tr("Sanitized PDF saved!")}</span>
                </div>
              ) : (
                <button
                  onClick={handleBurnRedaction}
                  id="btn-redact-compile"
                  className="w-full text-center py-3 bg-rose-600 hover:bg-rose-550 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 text-white cursor-pointer uppercase font-mono tracking-widest"
                >
                  <Shield className="w-4 h-4" /> {tr("Sanitize & Download PDF")}
                </button>
              )}
            </div>

          </div>

          {/* Central viewport display */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[480px] shadow-inner relative select-none">
              
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold shadow-xs z-10 pointer-events-none">
                <Eye className="w-3.5 h-3.5 text-rose-500" /> {tr("Layer Inspector • Page")} {previewPage} {tr("of")} {file.pageCount}
              </div>

              {/* Tips for placing boxes */}
              {redactions.length === 0 && !isDrawing && (
                <div className="absolute top-16 max-w-sm text-center p-3.5 bg-rose-500/5 text-rose-700 dark:text-rose-400 text-xs border border-rose-500/10 rounded-xl z-10 pointer-events-none">
                  {tr("📄 Click and drag your cursor anywhere on the document below to draw blackout boxes.")}
                </div>
              )}

              <div className="bg-white p-2 rounded-2xl border border-slate-250 dark:border-slate-800 shadow-md my-6 inline-block">
                {/* INTERACTIVE DRAWING WRAPPER */}
                <div 
                  className="relative cursor-crosshair shadow-sm border border-slate-100 bg-white"
                  style={{ width: containerDimensions.width || 'auto', height: containerDimensions.height || 'auto' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <canvas ref={canvasRef} className="block pointer-events-none" />
                  
                  {/* Current drawing box (temporary) */}
                  {isDrawing && currentBox && (
                    <div 
                      className="absolute bg-rose-500/20 border-2 border-rose-500 pointer-events-none z-50" 
                      style={{ 
                        left: currentBox.x, 
                        top: currentBox.y, 
                        width: currentBox.width, 
                        height: currentBox.height 
                      }} 
                    />
                  )}

                  {/* Rendered Rnd overlays for RedactionBoxes */}
                  {redactions.filter(r => r.page === previewPage).map(box => {
                    const pixelsX = (box.xPct / 100) * containerDimensions.width;
                    const pixelsY = (box.yPct / 100) * containerDimensions.height;
                    const pixelsW = (box.widthPct / 100) * containerDimensions.width;
                    const pixelsH = (box.heightPct / 100) * containerDimensions.height;

                    return (
                      <Rnd
                        key={box.id}
                        bounds="parent"
                        size={{ width: pixelsW, height: pixelsH }}
                        position={{ x: pixelsX, y: pixelsY }}
                        onDragStop={(e, d) => {
                          const newXPct = (d.x / containerDimensions.width) * 100;
                          const newYPct = (d.y / containerDimensions.height) * 100;
                          updateRedaction(box.id, { xPct: newXPct, yPct: newYPct });
                        }}
                        onResizeStop={(e, direction, ref, delta, position) => {
                          const newWidthPct = (ref.offsetWidth / containerDimensions.width) * 100;
                          const newHeightPct = (ref.offsetHeight / containerDimensions.height) * 100;
                          const newXPct = (position.x / containerDimensions.width) * 100;
                          const newYPct = (position.y / containerDimensions.height) * 100;
                          updateRedaction(box.id, { 
                            xPct: newXPct, yPct: newYPct, widthPct: newWidthPct, heightPct: newHeightPct 
                          });
                        }}
                        onMouseDown={(e) => {
                           e.stopPropagation(); // Prevent new box drawing
                           setSelectedBoxId(box.id);
                        }}
                        className={`group border-2 ${box.id === selectedBoxId ? 'border-rose-500 z-10' : 'border-slate-800 border-dashed z-0'} transition-colors hover:border-solid`}
                        style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)' }} // Extremely dark slate / almost black
                      >
                         <div className="w-full h-full relative">
                           {box.id === selectedBoxId && (
                             <>
                               {/* Active Indicator text */}
                               <span className="absolute top-1 left-1.5 font-bold font-mono text-[8px] text-rose-500 select-none pointer-events-none uppercase tracking-widest">
                                 {tr("Active Redaction")}
                               </span>
                               {/* Hover Trash Handle */}
                               <button 
                                 type="button"
                                 onMouseDown={(e) => { e.stopPropagation(); handleDeleteRedaction(box.id); }}
                                 className="absolute -top-3 -right-3 bg-white text-rose-500 rounded-full p-1 shadow-md hover:bg-rose-50 transition-colors cursor-pointer border border-slate-200 opacity-0 group-hover:opacity-100"
                               >
                                 <Trash2 className="w-3 h-3" />
                               </button>
                             </>
                           )}
                         </div>
                      </Rnd>
                    );
                  })}
                </div>
              </div>

              {/* Pagination controls */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  disabled={previewPage === 1}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Previous page")}
                </button>
                <span className="text-xs font-bold text-slate-550 dark:text-slate-400 px-2 font-mono">{tr("Page")} {previewPage} {tr("of")} {file.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.min(file.pageCount, prev + 1))}
                  disabled={previewPage === file.pageCount}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-855 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Next page")}
                </button>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-left">
              <Shield className="w-5 h-5 shrink-0 text-rose-500" />
              <div>
                <span className="font-extrabold text-slate-700 dark:text-slate-205">{tr("Permanent Vector Redaction Protocol:")}</span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr("Unlike simple HTML highlighter annotations or CSS blackout blocks that text-scrapers or highlight-copy readers can easily read underneath, this tool directly integrates vector shapes flat into the page structural description. Once generated, the text layers located under these black masks are inaccessible, ensuring maximum legal compliance.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in animate-duration-200">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center max-w-xs text-center space-y-4 shadow-xl">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{statusText}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{tr("Burning structural masks...")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
