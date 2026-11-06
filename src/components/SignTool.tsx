/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, FormEvent } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Sliders, Play, Loader2, RefreshCw, PenTool, Type, Upload, Check, Trash2, HelpCircle } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, stampSignatureOnPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface SignToolProps {
  onBack: () => void;
}

type SignMode = 'draw' | 'type' | 'upload';
type InkColor = '#0F172A' | '#1E3A8A' | '#7F1D1D'; // Slate Black, Dark Blue, Dark Red

const SCRIPT_FONTS = [
  { name: 'Elegant Handwriting', value: "'Dancing Script', 'Brush Script MT', cursive, sans-serif" },
  { name: 'Modern Script', value: "'Caveat', 'Comic Sans MS', cursive, sans-serif" },
  { name: 'Classic Script', value: "Georgia, 'Times New Roman', serif" },
];

export default function SignTool({ onBack }: SignToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Core signature states
  const [signMode, setSignMode] = useState<SignMode>('draw');
  const [inkColor, setInkColor] = useState<InkColor>('#1E3A8A'); // Default elegant blue

  // 1. Draw Signature pad states
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // 2. Type signature states
  const [typedName, setTypedName] = useState('John Doe');
  const [selectedFont, setSelectedFont] = useState(SCRIPT_FONTS[0].value);

  // 3. Upload image signature states
  const [uploadedSignatureUrl, setUploadedSignatureUrl] = useState<string | null>(null);

  // Placement parameters
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [xPercent, setXPercent] = useState(50); // 0-100 from left
  const [yPercent, setYPercent] = useState(75); // 0-100 from top (rendered standard)
  const [widthPercent, setWidthPercent] = useState(24); // 5-80% width of page

  // References for coordinate calculations
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Format utility
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  // Import dynamic scripts for gorgeous handwriting fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Dancing+Script:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Set up canvas context values on change of color or initialization
  useEffect(() => {
    if (signMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = inkColor;
      }
    }
  }, [signMode, inkColor]);

  // Handle PDF file arrival
  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 16); // Extract up to 16 pages of preview thumbs

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      setSelectedPageIndex(0);
    } catch (err) {
      console.error(err);
      alert('Could not view PDF layout structure.');
    } finally {
      setLoading(false);
    }
  };

  // Canvas sign pad draw motions
  const getCanvasCoords = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    // Scale because internal width/height might differ from client layout sizes
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const getCanvasTouchCoords = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || e.touches.length === 0) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (coords: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const drawMotion = (coords: { x: number; y: number }) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Signature Image compilation wrapper
  const getSignatureDataUrl = (): string | null => {
    if (signMode === 'upload') {
      return uploadedSignatureUrl;
    }

    if (signMode === 'type') {
      if (!typedName.trim()) return null;
      // Draw typed name onto a canvas dynamically
      const canvas = document.createElement('canvas');
      canvas.width = 450;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw elegant calligraphic base line (subtle grey line represents authentic ledger marker)
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 110);
        ctx.lineTo(410, 110);
        ctx.stroke();

        ctx.font = `italic 42px ${selectedFont}`;
        ctx.fillStyle = inkColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
        
        return canvas.toDataURL('image/png');
      }
      return null;
    }

    if (signMode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      // Check if canvas is completely empty (no drawings drawn)
      const buffer = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (buffer) {
        let hasContent = false;
        for (let i = 0; i < buffer.length; i += 4) {
          if (buffer[i + 3] > 0) {
            hasContent = true;
            break;
          }
        }
        if (!hasContent) return null;
      }
      return canvas.toDataURL('image/png');
    }

    return null;
  };

  // Uploaded signature parser
  const handleSignatureUpload = (e: FormEvent<HTMLInputElement>) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const render = new FileReader();
    render.onload = () => {
      setUploadedSignatureUrl(render.result as string);
    };
    render.readAsDataURL(files[0]);
  };

  // Touch placement target click setup
  const handlePageClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const computedXRatio = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const computedYRatio = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

    // Position signature's top-left so that the signature center is approximately under the mouse cursor
    // Center signature visually at click coordinate:
    const finalX = Math.max(0, Math.min(100 - widthPercent / 2, computedXRatio - widthPercent / 2));
    const finalY = Math.max(0, Math.min(100, computedYRatio - 8)); // 8% average height ratio offset

    setXPercent(Math.round(finalX));
    setYPercent(Math.round(finalY));
  };

  const handleApplySignature = async () => {
    if (!file) return;
    const signatureImg = getSignatureDataUrl();
    if (!signatureImg) {
      alert('Please write, type, or upload a signature to stamp first.');
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      const compiledBytes = await stampSignatureOnPdf(file.arrayBuffer, {
        pageIndex: selectedPageIndex,
        signatureDataUrl: signatureImg,
        xRatio: xPercent / 100,
        yRatio: yPercent / 100,
        widthRatio: widthPercent / 100,
      });

      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_signed.pdf`;

      downloadFile(compiledBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to stamp signature to PDF structure. Ensure file does not have copy locks.');
    } finally {
      setLoading(false);
    }
  };

  const resetTool = () => {
    setFile(null);
    setSuccess(false);
    setUploadedSignatureUrl(null);
    clearCanvas();
  };

  const generatedPreviewImage = getSignatureDataUrl();

  return (
    <div className="space-y-6">
      {/* Header and Back navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-sign-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-full font-semibold">
          Pro ESIGN Engine
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6 animate-fade-in">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Electronic Signature</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Draw handwritten stamps, enter sleek dynamic script typography, or insert transparent scans directly onto pages.
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="sign-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title="Upload PDF to burn custom signatures"
              description="Upload files to authorize corporate audits, legal bindings, or form agreements securely."
            />
          </div>
        )}

        {loading && (
          <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300 mb-6">
            <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />
            <span>Embedding security credentials and stamping PNG channels onto page matrix...</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">Successfully Signed!</span> Your secure signatory copy has been processed and and downloaded.
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-sign-reset"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start New
            </button>
          </div>
        )}

        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            
            {/* L: Page Target Placement Console (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  1. Placement Target Map
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  Click on page to place
                </span>
              </div>

              {/* Active document layout visual placement spot */}
              <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-950/45 rounded-2xl border border-slate-150 dark:border-slate-805 space-y-4">
                
                {/* Page Index Switcher */}
                <div className="w-full flex items-center justify-between">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    Document sheet: <span className="text-slate-950 dark:text-white font-mono font-bold">#{selectedPageIndex + 1}</span> of {file.pageCount}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={selectedPageIndex === 0}
                      onClick={() => setSelectedPageIndex((prev) => Math.max(0, prev - 1))}
                      className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-md font-bold disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={selectedPageIndex === file.pageCount - 1}
                      onClick={() => setSelectedPageIndex((prev) => Math.min(file.pageCount - 1, prev + 1))}
                      className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-md font-bold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Page Stamp Interactive Canvas Frame */}
                <div 
                  ref={previewContainerRef}
                  onClick={handlePageClick}
                  className="relative cursor-crosshair border border-slate-300 dark:border-slate-800 bg-white shadow-md max-w-sm w-full select-none rounded overflow-hidden flex items-center justify-center text-slate-300 transition-shadow hover:shadow-lg inline-block"
                >
                  {file.previews[selectedPageIndex] ? (
                    <img
                      src={file.previews[selectedPageIndex]}
                      alt="Stamp coordinate sheet canvas renderer"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto pointer-events-none block"
                    />
                  ) : (
                    <div className="w-full aspect-[1/1.41] flex items-center justify-center">
                      <FileCode className="w-16 h-16 pointer-events-none" />
                    </div>
                  )}

                  {/* Absolute positioning stamp helper */}
                  {generatedPreviewImage && (
                    <div
                      style={{
                        left: `${xPercent}%`,
                        top: `${yPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      className="absolute border border-dashed border-sky-500 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 flex items-center justify-center p-0.5 rounded transition-transform pointer-events-none"
                    >
                      <img
                        src={generatedPreviewImage}
                        alt="Signature Floating Stamp Marker"
                        referrerPolicy="no-referrer"
                        className="w-full h-auto object-contain brightness-95"
                      />
                      {/* Anchor anchor */}
                      <span className="absolute -top-4 -left-1 px-1 bg-sky-500 text-[8px] font-bold text-white rounded scale-75 whitespace-nowrap">
                        Signature Anchor
                      </span>
                    </div>
                  )}
                </div>

                <div className="w-full text-[10px] text-center text-slate-450 flex items-center gap-1 justify-center italic">
                  <HelpCircle className="w-3.5 h-3.5" /> Hover and click/tap anywhere on the preview sheet to assign custom alignment.
                </div>
              </div>

              {/* Adjusters */}
              <div className="space-y-4 bg-slate-50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-850">
                <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  Alignment Geometry Slider
                </span>
                
                {/* Horizontal */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <label htmlFor="sign-posX-slider">Horizontal Distance (X)</label>
                    <span className="font-mono text-sky-550">{xPercent}%</span>
                  </div>
                  <input
                    type="range"
                    id="sign-posX-slider"
                    min={0}
                    max={100 - widthPercent}
                    value={xPercent}
                    onChange={(e) => setXPercent(parseInt(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-800 accent-sky-500"
                  />
                </div>

                {/* Vertical */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <label htmlFor="sign-posY-slider">Vertical Distance (Y)</label>
                    <span className="font-mono text-sky-550">{yPercent}%</span>
                  </div>
                  <input
                    type="range"
                    id="sign-posY-slider"
                    min={0}
                    max={90}
                    value={yPercent}
                    onChange={(e) => setYPercent(parseInt(e.target.value) || 0)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-800 accent-sky-500"
                  />
                </div>

                {/* Scale Width */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <label htmlFor="sign-width-slider">Signature Size / Width</label>
                    <span className="font-mono text-sky-550">{widthPercent}% of page</span>
                  </div>
                  <input
                    type="range"
                    id="sign-width-slider"
                    min={8}
                    max={60}
                    value={widthPercent}
                    onChange={(e) => setWidthPercent(parseInt(e.target.value) || 20)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-800 accent-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* R: Signature Creation Workshop (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Creator tab toggle */}
              <div className="space-y-3">
                <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  2. Create Signature Stamp
                </span>

                <div className="grid grid-cols-3 gap-2.5 p-1 bg-slate-100 dark:bg-slate-950/60 rounded-xl">
                  {[
                    { id: 'draw', label: 'Draw Pad', icon: PenTool },
                    { id: 'type', label: 'Type Text', icon: Type },
                    { id: 'upload', label: 'Upload PNG', icon: Upload },
                  ].map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSignMode(mode.id as SignMode)}
                        id={`btn-signmode-${mode.id}`}
                        className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          signMode === mode.id
                            ? 'border-sky-500 bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ink Color Selector (Apply black, royal blue, deep red) */}
              {signMode !== 'upload' && (
                <div className="space-y-3">
                  <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    Select Ink Color
                  </span>
                  <div className="flex gap-4">
                    {[
                      { value: '#0F172A', label: 'Slate Black', bg: 'bg-slate-900' },
                      { value: '#1E3A8A', label: 'Ink Blue', bg: 'bg-blue-900' },
                      { value: '#7F1D1D', label: 'Docu Red', bg: 'bg-rose-900' },
                    ].map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setInkColor(color.value as InkColor)}
                        id={`btn-inkcolor-${color.value.replace('#', '')}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          inkColor === color.value
                            ? 'border-sky-550 bg-sky-500/10 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-805 text-slate-500 dark:text-slate-450 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${color.bg}`} />
                        <span>{color.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace Container for active Sign Mode */}
              <div className="p-6 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-150 dark:border-slate-805">
                
                {/* DRAW PAD WORKSPACE */}
                {signMode === 'draw' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Sign below using mouse or touchpad controller
                      </span>
                      <button
                        type="button"
                        onClick={clearCanvas}
                        id="btn-draw-clear"
                        className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear Pad
                      </button>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-250 dark:border-slate-800 shadow-inner p-1">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={220}
                        className="w-full bg-slate-50/50 rounded-lg block cursor-crosshair touch-none"
                        onMouseDown={(e) => startDrawing(getCanvasCoords(e))}
                        onMouseMove={(e) => drawMotion(getCanvasCoords(e))}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={(e) => startDrawing(getCanvasTouchCoords(e))}
                        onTouchMove={(e) => drawMotion(getCanvasTouchCoords(e))}
                        onTouchEnd={stopDrawing}
                      />
                    </div>
                  </div>
                )}

                {/* TYPE SIGNATURE WORKSPACE */}
                {signMode === 'type' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="sign-typed-input" className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                        Enter signature letters
                      </label>
                      <input
                        type="text"
                        id="sign-typed-input"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="e.g. Marie J. Sklodowska"
                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-305 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-medium rounded-xl leading-normal focus:outline-none focus:border-sky-500"
                        maxLength={40}
                      />
                    </div>

                    {/* Font Selector Cards */}
                    <div className="space-y-2 pt-1">
                      <span className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                        Choose Calligraphy Typography Style
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {SCRIPT_FONTS.map((font) => (
                          <button
                            key={font.name}
                            type="button"
                            onClick={() => setSelectedFont(font.value)}
                            id={`btn-scriptfont-${font.name.replace(/\s+/g, '')}`}
                            className={`p-3 rounded-xl border text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                              selectedFont === font.value
                                ? 'border-sky-500 bg-white dark:bg-slate-900 ring-2 ring-sky-500/20'
                                : 'border-slate-200 dark:border-slate-805 bg-white dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">{font.name}</span>
                            <span 
                              style={{ fontFamily: font.value, color: inkColor }} 
                              className="text-lg truncate select-none block"
                            >
                              {typedName || 'John Doe'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* UPLOAD TRANSPARENT PNG SIGNATURE */}
                {signMode === 'upload' && (
                  <div className="space-y-4">
                    <span className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                      Upload transparent PNG of scan written sign
                    </span>

                    {!uploadedSignatureUrl ? (
                      <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-6 text-center bg-white dark:bg-slate-900/40 hover:border-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900 transition-all relative">
                        <input
                          type="file"
                          id="signature-file-upload-input"
                          accept="image/png, image/jpeg"
                          onChange={handleSignatureUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Choose signature image file
                        </span>
                        <span className="block text-[10px] text-slate-450 mt-1">
                          PNG formats with transparent backgrounds work best.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl">
                        <div className="flex items-center gap-3">
                          <img
                            src={uploadedSignatureUrl}
                            alt="Uploaded client signature item"
                            referrerPolicy="no-referrer"
                            className="h-10 w-24 object-contain border border-slate-100 rounded bg-slate-50"
                          />
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold font-mono">
                            Signature loaded successfully
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadedSignatureUrl(null)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-600"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PDF Selection metadata card */}
              <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-lg">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h4>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 font-semibold font-mono">
                      {formatSize(file.size)} • {file.pageCount} Pages Loaded
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetTool}
                  id="btn-sign-change-file"
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Change File
                </button>
              </div>

              {/* Main Submit sign command */}
              <button
                type="button"
                onClick={handleApplySignature}
                disabled={loading || !generatedPreviewImage}
                id="btn-sign-submit"
                className="w-full py-4 bg-sky-600 hover:bg-sky-505 disabled:bg-sky-650/40 text-white text-sm font-semibold rounded-2xl shadow-md tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white shrink-0" />}
                Burn Signatures & Download Protected Copy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
