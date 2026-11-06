/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  GitCompare, 
  HelpCircle, 
  Eye, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Sliders, 
  Columns, 
  Layers, 
  Move,
  Info 
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';

interface CompareToolProps {
  onBack: () => void;
}

type DiffMode = 'sidebar' | 'side-by-side' | 'swipe' | 'pixel-diff' | 'blend';

export default function CompareTool({ onBack }: CompareToolProps) {
  const [fileA, setFileA] = useState<PDFFile | null>(null);
  const [fileB, setFileB] = useState<PDFFile | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [diffMode, setDiffMode] = useState<DiffMode>('side-by-side');
  
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  
  // Controls
  const [swipePosition, setSwipePosition] = useState<number>(50); // 0 to 100
  const [blendOpacity, setBlendOpacity] = useState<number>(50); // 0 to 100
  const [sensitivity, setSensitivity] = useState<number>(20); // pixel threshold
  const [zoom, setZoom] = useState<number>(1.0); // canvas display zoom

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const outCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskARef = useRef<any>(null);
  const renderTaskBRef = useRef<any>(null);

  // Reset page when document loaded
  const maxPage = Math.min(fileA?.pageCount || 1, fileB?.pageCount || 1);

  useEffect(() => {
    if (currentPage > maxPage && maxPage > 0) {
      setCurrentPage(1);
    }
  }, [maxPage, currentPage]);

  const handleFileDrop = async (file: File, target: 'A' | 'B') => {
    setLoading(true);
    setStatusText(`Parsing document ${target}...`);
    try {
      const arrayBuffer = await fileToArrayBuffer(file);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);
      
      const parsedFile: PDFFile = {
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        arrayBuffer,
        pageCount,
        previews
      };

      if (target === 'A') {
        setFileA(parsedFile);
      } else {
        setFileB(parsedFile);
      }
    } catch (err) {
      console.error(err);
      alert(`Could not process PDF file ${file.name}. Secure password protection or standard stream corruption could block locally. Ensure the file is not protected.`);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleClear = () => {
    setFileA(null);
    setFileB(null);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (!fileA || !fileB) return;
    renderPages();
    return () => {
      if (renderTaskARef.current) {
        try { renderTaskARef.current.cancel(); } catch (e) {}
        renderTaskARef.current = null;
      }
      if (renderTaskBRef.current) {
        try { renderTaskBRef.current.cancel(); } catch (e) {}
        renderTaskBRef.current = null;
      }
    };
  }, [fileA, fileB, currentPage, diffMode, swipePosition, blendOpacity, sensitivity, zoom]);

  const renderPages = async () => {
    try {
      // Cancel previous rendering tasks if running
      if (renderTaskARef.current) {
        try { renderTaskARef.current.cancel(); } catch (e) {}
        renderTaskARef.current = null;
      }
      if (renderTaskBRef.current) {
        try { renderTaskBRef.current.cancel(); } catch (e) {}
        renderTaskBRef.current = null;
      }

      // 1. Get raw documents
      const loadingTaskA = pdfjsLib.getDocument({ data: new Uint8Array(fileA!.arrayBuffer.slice(0)) });
      const docA = await loadingTaskA.promise;

      const loadingTaskB = pdfjsLib.getDocument({ data: new Uint8Array(fileB!.arrayBuffer.slice(0)) });
      const docB = await loadingTaskB.promise;

      // 2. Load pages
      const pageNum = Math.min(currentPage, docA.numPages, docB.numPages);
      const pageA = await docA.getPage(pageNum);
      const pageB = await docB.getPage(pageNum);

      // 3. Render setup
      const viewportA = pageA.getViewport({ scale: 1.5 * zoom });
      const viewportB = pageB.getViewport({ scale: 1.5 * zoom });

      // Match sizes for math comparison bounds (normalize layout size to viewport A width/height)
      const targetWidth = Math.round(viewportA.width);
      const targetHeight = Math.round(viewportA.height);

      // Prepare canvas A
      const canvasA = canvasARef.current || document.createElement('canvas');
      canvasA.width = targetWidth;
      canvasA.height = targetHeight;
      const ctxA = canvasA.getContext('2d');
      if (ctxA) {
        ctxA.fillStyle = '#ffffff';
        ctxA.fillRect(0, 0, targetWidth, targetHeight);
        
        const renderTaskA = pageA.render({
          canvasContext: ctxA,
          viewport: viewportA,
          canvas: canvasA
        });
        renderTaskARef.current = renderTaskA;
        await renderTaskA.promise;
        renderTaskARef.current = null;
      }

      // Prepare canvas B
      const canvasB = canvasBRef.current || document.createElement('canvas');
      canvasB.width = targetWidth;
      canvasB.height = targetHeight;
      const ctxB = canvasB.getContext('2d');
      if (ctxB) {
        ctxB.fillStyle = '#ffffff';
        ctxB.fillRect(0, 0, targetWidth, targetHeight);
        
        // Scale viewport B slightly if dimensions differ from viewport A
        const viewportBScale = pageB.getViewport({ 
          scale: (1.5 * zoom) * (viewportA.width / viewportB.width) 
        });
        
        const renderTaskB = pageB.render({
          canvasContext: ctxB,
          viewport: viewportBScale,
          canvas: canvasB
        });
        renderTaskBRef.current = renderTaskB;
        await renderTaskB.promise;
        renderTaskBRef.current = null;
      }

      // Render Outputs based on compare modes
      const outCanvas = outCanvasRef.current;
      if (!outCanvas) return;
      outCanvas.width = targetWidth;
      outCanvas.height = targetHeight;
      const ctxOut = outCanvas.getContext('2d');
      if (!ctxOut || !ctxA || !ctxB) return;

      // Clean output canvas
      ctxOut.fillStyle = '#ffffff';
      ctxOut.fillRect(0, 0, targetWidth, targetHeight);

      if (diffMode === 'swipe') {
        // Draw canvas A first
        ctxOut.drawImage(canvasA, 0, 0);

        // Clip and draw canvas B over it
        ctxOut.save();
        ctxOut.beginPath();
        const clipX = (swipePosition / 100) * targetWidth;
        ctxOut.rect(clipX, 0, targetWidth - clipX, targetHeight);
        ctxOut.clip();
        ctxOut.drawImage(canvasB, 0, 0);
        ctxOut.restore();

        // Draw swipe bar boundary line
        ctxOut.beginPath();
        const lineX = (swipePosition / 100) * targetWidth;
        ctxOut.moveTo(lineX, 0);
        ctxOut.lineTo(lineX, targetHeight);
        ctxOut.lineWidth = 3;
        ctxOut.strokeStyle = '#22c55e'; // emerald line
        ctxOut.stroke();

        // Handle knob marker
        ctxOut.beginPath();
        ctxOut.arc(lineX, targetHeight / 2, 14, 0, 2 * Math.PI);
        ctxOut.fillStyle = '#22c55e';
        ctxOut.fill();
        ctxOut.lineWidth = 2;
        ctxOut.strokeStyle = '#ffffff';
        ctxOut.stroke();
      } else if (diffMode === 'blend') {
        const opacity = blendOpacity / 100;
        
        // Draw A base
        ctxOut.globalAlpha = 1.0;
        ctxOut.drawImage(canvasA, 0, 0);
        
        // Overlay B
        ctxOut.globalAlpha = opacity;
        ctxOut.drawImage(canvasB, 0, 0);
        
        ctxOut.globalAlpha = 1.0;
      } else if (diffMode === 'pixel-diff') {
        // Compute visual pixel variance subtraction
        const imgDataA = ctxA.getImageData(0, 0, targetWidth, targetHeight);
        const imgDataB = ctxB.getContext('2d')?.getImageData(0, 0, targetWidth, targetHeight);
        
        if (imgDataA && imgDataB) {
          const pixelsA = imgDataA.data;
          const pixelsB = imgDataB.data;
          
          const resultImgData = ctxOut.createImageData(targetWidth, targetHeight);
          const resultPixels = resultImgData.data;

          const threshold = sensitivity; 

          for (let i = 0; i < pixelsA.length; i += 4) {
            const rA = pixelsA[i], gA = pixelsA[i+1], bA = pixelsA[i+2], aA = pixelsA[i+3];
            const rB = pixelsB[i], gB = pixelsB[i+1], bB = pixelsB[i+2], aB = pixelsB[i+3];

            const diffR = Math.abs(rA - rB);
            const diffG = Math.abs(gA - gB);
            const diffB = Math.abs(bA - bB);
            const diffA = Math.abs(aA - aB);

            if (diffR > threshold || diffG > threshold || diffB > threshold || diffA > threshold) {
              // Highlight difference in bright crimson red
              resultPixels[i] = 239;     // R
              resultPixels[i+1] = 68;    // G
              resultPixels[i+2] = 68;    // B
              resultPixels[i+3] = 240;   // A
            } else {
              // Fade original unchanged background to mono watermarks
              const gray = (rA + gA + bA) / 3;
              resultPixels[i] = gray;
              resultPixels[i+1] = gray;
              resultPixels[i+2] = gray;
              resultPixels[i+3] = 40; // light background opacity
            }
          }
          ctxOut.putImageData(resultImgData, 0, 0);
        }
      }
    } catch (err) {
      console.error('Error rendering page views:', err);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(maxPage, prev + 1));
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
      {/* Header section */}
      <div className="flex md:flex-row flex-col md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            id="btn-compare-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-emerald-500" /> Page Comparison Tool
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Analyze physical layout updates, paragraph revisions, and page element modifications side-by-side or combined entirely in-browser.
            </p>
          </div>
        </div>

        {fileA && fileB && (
          <button
            onClick={handleClear}
            id="btn-compare-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 font-bold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            Reset Documents
          </button>
        )}
      </div>

      {/* Intro drop zones when no document is uploaded */}
      {(!fileA || !fileB) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Document A Upload */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-sans font-bold text-xs">A</span>
              Base Document (Original)
            </h3>
            {fileA ? (
              <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex flex-col items-center text-center space-y-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate max-w-xs">{fileA.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{fileA.pageCount} Pages • {formatFileSize(fileA.size)}</p>
                </div>
                <button
                  onClick={() => setFileA(null)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  Change File
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-850 rounded-2xl hover:border-emerald-500 dark:hover:border-emerald-400 bg-white dark:bg-slate-900/40 p-6 text-center cursor-pointer transition-all hover:bg-emerald-500/5">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileDrop(file, 'A');
                  }}
                />
                <Upload className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-3" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Load Base PDF</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">Select from device folders</span>
              </label>
            )}
          </div>

          {/* Document B Upload */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-500 flex items-center justify-center font-sans font-bold text-xs">B</span>
              Target Document (Modified)
            </h3>
            {fileB ? (
              <div className="p-6 bg-sky-500/5 border border-sky-500/20 rounded-2xl flex flex-col items-center text-center space-y-3">
                <div className="p-3 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl">
                  <Check className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate max-w-xs">{fileB.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{fileB.pageCount} Pages • {formatFileSize(fileB.size)}</p>
                </div>
                <button
                  onClick={() => setFileB(null)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  Change File
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-slate-850 rounded-2xl hover:border-sky-500 dark:hover:border-sky-400 bg-white dark:bg-slate-900/40 p-6 text-center cursor-pointer transition-all hover:bg-sky-500/5">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileDrop(file, 'B');
                  }}
                />
                <Upload className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-3" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Load Compare PDF</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">Select from device folders</span>
              </label>
            )}
          </div>
        </div>
      ) : (
        /* Workspace */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Left panel: comparing options */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-5 shadow-xs">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Workspace Compare Modes
              </h3>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setDiffMode('side-by-side')}
                  className={`flex items-center gap-3 p-3 rounded-xl justify-start grow text-left cursor-pointer transition-all ${
                    diffMode === 'side-by-side'
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400 font-medium'
                  }`}
                >
                  <Columns className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-xs">Side-by-Side Split</p>
                    <p className="text-[10px] font-medium opacity-70">Compare document pages next to each other</p>
                  </div>
                </button>

                <button
                  onClick={() => setDiffMode('swipe')}
                  className={`flex items-center gap-3 p-3 rounded-xl justify-start grow text-left cursor-pointer transition-all ${
                    diffMode === 'swipe'
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400 font-medium'
                  }`}
                >
                  <Move className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-xs">Sliding Wipe Curtain</p>
                    <p className="text-[10px] font-medium opacity-70">Slide divider to dynamically inspect changes</p>
                  </div>
                </button>

                <button
                  onClick={() => setDiffMode('blend')}
                  className={`flex items-center gap-3 p-3 rounded-xl justify-start grow text-left cursor-pointer transition-all ${
                    diffMode === 'blend'
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400 font-medium'
                  }`}
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-xs">Crossfade Alpha Blend</p>
                    <p className="text-[10px] font-medium opacity-70">Overlay transparency with opacity slider</p>
                  </div>
                </button>

                <button
                  onClick={() => setDiffMode('pixel-diff')}
                  className={`flex items-center gap-3 p-3 rounded-xl justify-start grow text-left cursor-pointer transition-all ${
                    diffMode === 'pixel-diff'
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/60 text-slate-600 dark:text-slate-400 font-medium'
                  }`}
                >
                  <GitCompare className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-xs">Visual Pixel Difference</p>
                    <p className="text-[10px] font-medium opacity-70">Contrast highlighting modifications in red ink</p>
                  </div>
                </button>
              </div>

              {/* Dynamic Sub-Inputs depend on active compare mode */}
              <div className="border-t border-slate-100 dark:border-slate-850 pt-4 space-y-4">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> Filter Parameters
                </h4>

                {diffMode === 'swipe' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>Curtain Wipe Position</span>
                      <span>{swipePosition}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swipePosition}
                      onChange={(e) => setSwipePosition(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                )}

                {diffMode === 'blend' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>Overlay B Opacity</span>
                      <span>{blendOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={blendOpacity}
                      onChange={(e) => setBlendOpacity(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                )}

                {diffMode === 'pixel-diff' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>Sensitivity/Threshold</span>
                      <span>{sensitivity} units</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={sensitivity}
                      onChange={(e) => setSensitivity(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 text-left">Sets the visual threshold to isolate subtle shifts or compression artifacts.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                    <span>Viewport scale factor</span>
                    <span>{zoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <span>Navigate Pages</span>
                <span className="text-emerald-400">Page {currentPage} of {maxPage}</span>
              </div>

              {fileA && fileB && fileA.pageCount !== fileB.pageCount && (
                <div className="p-3 bg-amber-500/10 rounded-xl text-[10px] text-amber-400 flex items-start gap-2 border border-amber-500/20">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>The files contain different lengths (A: {fileA.pageCount}, B: {fileB.pageCount}). Compare mode aligns the first {maxPage} sheets.</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-xs font-mono transition-colors border border-slate-750 cursor-pointer"
                >
                  Previous Page
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={currentPage === maxPage}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-xs font-mono transition-colors border border-slate-750 cursor-pointer"
                >
                  Next Page
                </button>
              </div>
            </div>
          </div>

          {/* Right workspace canvas displays */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Viewports Container */}
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[500px] shadow-inner relative">
              
              {/* Keep background canvas cache off-screen or rendered for calculations */}
              <div className="hidden">
                <canvas ref={canvasARef} />
                <canvas ref={canvasBRef} />
              </div>

              {diffMode === 'side-by-side' ? (
                /* Side-by-side comparative canvases */
                <div className="flex flex-col md:flex-row gap-6 w-full items-center justify-center">
                  <div className="flex flex-col space-y-2 items-center">
                    <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 font-bold text-[10px] font-mono border border-emerald-500/20">A: DEFAULT / BASE</span>
                    <div className="bg-white p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-full overflow-hidden">
                      <canvas 
                        // Synchronize to draw offscreen canvas A directly
                        ref={(el) => {
                          if (el && canvasARef.current) {
                            el.width = canvasARef.current.width;
                            el.height = canvasARef.current.height;
                            const ctx = el.getContext('2d');
                            if (ctx) ctx.drawImage(canvasARef.current, 0, 0);
                          }
                        }}
                        className="max-w-full h-auto"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2 items-center">
                    <span className="px-2.5 py-1 rounded bg-sky-500/10 text-sky-500 font-bold text-[10px] font-mono border border-sky-500/20">B: TARGET / MODIFIED</span>
                    <div className="bg-white p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-full overflow-hidden">
                      <canvas 
                        ref={(el) => {
                          if (el && canvasBRef.current) {
                            el.width = canvasBRef.current.width;
                            el.height = canvasBRef.current.height;
                            const ctx = el.getContext('2d');
                            if (ctx) ctx.drawImage(canvasBRef.current, 0, 0);
                          }
                        }}
                        className="max-w-full h-auto"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Composite output result canvas */
                <div className="flex flex-col items-center space-y-3 w-full">
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 px-3 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold">
                    <Eye className="w-3 h-3 text-emerald-500" />
                    <span>Mode:</span>
                    <span className="capitalize text-slate-800 dark:text-slate-200">{diffMode.replace('-', ' ')} view</span>
                  </div>
                  
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md max-w-full overflow-hidden">
                    <canvas ref={outCanvasRef} className="max-w-full h-auto" />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Tips footer */}
            <div className="bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border border-emerald-500/10 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-left items-start">
              <Info className="w-5 h-5 shrink-0 text-emerald-500" />
              <div>
                <span className="font-bold">Comparative Tip:</span>
                <p className="mt-0.5 font-medium">
                  Use the **Visual Pixel Difference** filter mode to isolate precisely which pixels change color, revealing relocated words, new legal signature stamps, modified pricing coordinates, and hidden watermark lines instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center max-w-xs text-center space-y-4 shadow-xl">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{statusText}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">This operation matches layout structures entirely locally.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
