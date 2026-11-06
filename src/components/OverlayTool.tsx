/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  Loader2, 
  RefreshCw, 
  Download, 
  FileText, 
  Image as ImageIcon,
  Layers,
  Settings,
  Sliders,
  Maximize,
  HelpCircle,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, applyOverlayToPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import { Rnd } from 'react-rnd';

interface OverlayToolProps {
  onBack: () => void;
}

interface OverlayConfig {
  type: 'image' | 'pdf';
  file: File | null;
  buffer: ArrayBuffer | null;
  mimeType: string;
  sourcePreviews: string[];
  pageCount: number;
  selectedOverlayPage: number; // 0-based index if overlay is PDF
  targetPages: 'all' | 'first' | 'last' | 'custom';
  customRangeString: string;
  scale: number; // 0.1 to 3.0
  fitToPage: boolean;
  offsetX: number; // in pt
  offsetY: number; // in pt
  opacity: number; // 0.0 to 1.0
  rotation: number; // 0, 90, 180, 270 degrees
  positionPreset: 'custom' | 'center' | 'full' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-left';
}

const DEFAULT_CONFIG: OverlayConfig = {
  type: 'image',
  file: null,
  buffer: null,
  mimeType: '',
  sourcePreviews: [],
  pageCount: 0,
  selectedOverlayPage: 0,
  targetPages: 'all',
  customRangeString: '1',
  scale: 1.0,
  fitToPage: false,
  offsetX: 0,
  offsetY: 0,
  opacity: 1.0,
  rotation: 0,
  positionPreset: 'center',
};

export default function OverlayTool({ onBack }: OverlayToolProps) {
  // Primary Document State
  const [primaryFile, setPrimaryFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);

  // Active preview page index (0-based) for primary document preview
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);

  // Overlay Configuration State
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [overlayImageSrc, setOverlayImageSrc] = useState<string | null>(null);

  // Drag logic
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      setOverlayConfig(prev => ({
        ...prev,
        positionPreset: 'custom',
        offsetX: Math.round(dragStart.initialOffsetX + dx * 2.5),
        offsetY: Math.round(dragStart.initialOffsetY - dy * 2.5),
      }));
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Drag and Drop State for Overlay
  const [isDragOverOverlay, setIsDragOverOverlay] = useState(false);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  // 1. Handle Primary PDF selection
  const handlePrimarySelected = async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    setStatusText('Reading primary PDF document...');
    setSuccess(false);

    try {
      const file = files[0];
      const arrayBuffer = await fileToArrayBuffer(file);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 20);

      setPrimaryFile({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      setPreviewPageIndex(0);
    } catch (err) {
      console.error(err);
      alert('Failed to parse primary PDF. It might be corrupt or encrypted.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // 2. Handle Overlay File upload (Image or PDF)
  const handleOverlayFile = async (file: File) => {
    setLoading(true);
    setStatusText('Importing overlay template file...');
    setSuccess(false);

    try {
      const isPdfValue = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const arrayBuffer = await fileToArrayBuffer(file);

      let previews: string[] = [];
      let pagesTotal = 0;

      if (isPdfValue) {
        setStatusText('Analyzing overlay PDF page templates...');
        const details = await getPdfDetails(arrayBuffer, 5);
        previews = details.previews;
        pagesTotal = details.pageCount;
        setOverlayImageSrc(previews[0] || null);
      } else {
        // Read image to show in UI
        const reader = new FileReader();
        reader.onload = (e) => {
          setOverlayImageSrc(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      setOverlayConfig((prev) => ({
        ...prev,
        type: isPdfValue ? 'pdf' : 'image',
        file,
        buffer: arrayBuffer,
        mimeType: file.type,
        sourcePreviews: previews,
        pageCount: pagesTotal,
        selectedOverlayPage: 0,
      }));
    } catch (err) {
      console.error(err);
      alert('Failed to load overlay file. Please upload a valid PDF, PNG, or JPG.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleOverlayDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragOverOverlay(true);
    } else if (e.type === 'dragleave') {
      setIsDragOverOverlay(false);
    }
  };

  const handleOverlayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverOverlay(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleOverlayFile(e.dataTransfer.files[0]);
    }
  };

  // 3. Process and Compile Overlay PDF merging layers
  const handleApplyOverlay = async () => {
    if (!primaryFile || !overlayConfig.buffer) return;
    setLoading(true);
    setStatusText('Stitching layer elements & stitching PDF plates...');

    try {
      const resBytes = await applyOverlayToPdf(primaryFile.arrayBuffer, {
        type: overlayConfig.type,
        buffer: overlayConfig.buffer,
        mimeType: overlayConfig.mimeType,
      }, {
        targetPages: overlayConfig.targetPages,
        customRangeString: overlayConfig.customRangeString,
        scale: overlayConfig.scale,
        fitToPage: overlayConfig.fitToPage,
        offsetX: overlayConfig.offsetX,
        offsetY: overlayConfig.offsetY,
        opacity: overlayConfig.opacity,
        rotation: overlayConfig.rotation,
        positionPreset: overlayConfig.positionPreset,
        overlayPageIndex: overlayConfig.selectedOverlayPage,
      });

      const baseName = primaryFile.name.replace(/\.pdf$/i, '');
      const stampName = overlayConfig.file ? overlayConfig.file.name.replace(/\.[^/.]+$/, '') : 'overlay';
      downloadFile(resBytes, `${baseName}_with_${stampName}.pdf`, 'application/pdf');
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to overlay layers on primary document.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // Dynamic visual preview style calculation
  const getOverlayPreviewStyle = () => {
    const preset = overlayConfig.positionPreset;
    const scale = overlayConfig.scale;
    const opacity = overlayConfig.opacity;
    const rotate = overlayConfig.rotation;
    const offsetX = overlayConfig.offsetX;
    const offsetY = overlayConfig.offsetY;

    // We style relatively centered or aligned using standard percentage layouts
    // Standard Letter ratio is height / width = 1.29 (approx 792/612).
    // Let's formulate responsive alignment
    let style: React.CSSProperties = {
      opacity,
      transition: 'all 0.1s ease-out',
      position: 'absolute',
    };

    if (preset === 'full') {
      return {
        ...style,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        transform: `rotate(${rotate}deg)`,
      };
    }

    // Convert PDF points coordinates (where +Y goes up, +X goes right) to browser style offsets
    // Scale slider corresponds to % of container sizes (approximate scale)
    const baseWidthPercent = 30 * scale; 
    style.width = `${baseWidthPercent}%`;
    style.height = 'auto';

    // Map presets to CSS positions
    switch (preset) {
      case 'center':
        style.top = '50%';
        style.left = '50%';
        style.transform = `translate(-50%, -50%) translate(${offsetX * 0.4}px, ${-offsetY * 0.4}px) rotate(${rotate}deg)`;
        break;
      case 'bottom-left':
        style.bottom = '10%';
        style.left = '10%';
        style.transform = `translate(${offsetX * 0.4}px, ${-offsetY * 0.4}px) rotate(${rotate}deg)`;
        break;
      case 'bottom-right':
        style.bottom = '10%';
        style.right = '10%';
        style.transform = `translate(${offsetX * 0.4}px, ${-offsetY * 0.4}px) rotate(${rotate}deg)`;
        break;
      case 'top-left':
        style.top = '10%';
        style.left = '10%';
        style.transform = `translate(${offsetX * 0.4}px, ${-offsetY * 0.4}px) rotate(${rotate}deg)`;
        break;
      case 'top-right':
        style.top = '10%';
        style.right = '10%';
        style.transform = `translate(${offsetX * 0.4}px, ${-offsetY * 0.4}px) rotate(${rotate}deg)`;
        break;
      case 'custom':
      default:
        // Positioned custom relative to center to avoid overlay falling completely out of bounds initially
        style.top = '40%';
        style.left = '40%';
        style.transform = `translate(${offsetX * 0.5}px, ${-offsetY * 0.5}px) rotate(${rotate}deg)`;
        break;
    }

    return style;
  };

  const updatePreset = (preset: typeof overlayConfig.positionPreset) => {
    setOverlayConfig((prev) => ({
      ...prev,
      positionPreset: preset,
      offsetX: 0,
      offsetY: 0,
      fitToPage: preset === 'full',
    }));
  };

  const resetAll = () => {
    setPrimaryFile(null);
    setOverlayConfig(DEFAULT_CONFIG);
    setOverlayImageSrc(null);
    setSuccess(false);
    setPreviewPageIndex(0);
  };

  const removeOverlayFile = () => {
    setOverlayConfig(DEFAULT_CONFIG);
    setOverlayImageSrc(null);
  };

  // Determine if active page matches the target selection for visual representation helper
  const isOverlayActiveOnPage = (pIdx: number) => {
    if (!primaryFile) return false;
    
    if (overlayConfig.targetPages === 'all') return true;
    if (overlayConfig.targetPages === 'first') return pIdx === 0;
    if (overlayConfig.targetPages === 'last') return pIdx === primaryFile.pageCount - 1;
    
    // Custom check
    try {
      const sourcePdf = primaryFile.arrayBuffer;
      const parsedIndices = new Set(
        // we import split page index parses helper 
        (overlayConfig.customRangeString || '1')
          .split(',')
          .map((s) => s.trim())
          .flatMap((s) => {
            if (s.includes('-')) {
              const [start, end] = s.split('-').map((n) => parseInt(n, 10));
              if (!isNaN(start) && !isNaN(end)) {
                const step = start < end ? 1 : -1;
                const result = [];
                for (let i = start; i !== end + step; i += step) {
                  result.push(i - 1);
                }
                return result;
              }
            }
            const single = parseInt(s, 10);
            return !isNaN(single) ? [single - 1] : [];
          })
      );
      return parsedIndices.has(pIdx);
    } catch {
      return false;
    }
  };

  const isAppliedOnCurrentPage = isOverlayActiveOnPage(previewPageIndex);

  return (
    <div className="space-y-6">
      {/* Navigation Headers and Badge Indicators */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-overlay-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold">
            Overlay Layer Engine
          </span>
          <span className="text-xs font-mono px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-semibold">
            Secure client-side merge
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        
        {/* Core title */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">PDF Layers & Overlay Tool</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Superimpose an image, stamp, signature or document template (like letterhead/seal) on top of an existing PDF layer-by-layer.
          </p>
        </div>

        {/* Loading Progress Bar */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-violet-605 animate-spin shrink-0" />
            <span>{statusText || 'Stitching layout coordinates...'}</span>
          </div>
        )}

        {/* Success Alert component */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold font-sans">Layermerge Applied Successfully!</span>{' '}
                Your processed layout PDF has been saved and downloaded.
              </span>
            </div>
            <button
              onClick={resetAll}
              id="btn-overlay-reset-success"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start new overlay
            </button>
          </div>
        )}

        {/* STEP 1: Upload primary PDF container */}
        {!primaryFile ? (
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-mono text-slate-400 tracking-wider uppercase">
              Step 1: Upload Underlay Base document (Primary PDF)
            </h3>
            <Dropzone
              id="primary-pdf-dropzone"
              onFilesSelected={handlePrimarySelected}
              multiple={false}
              title="Drag & drop primary base PDF document here"
              description="This serves as the underlying target host file. Processing runs inside localized client memory."
            />
          </div>
        ) : (
          /* STEP 2: Main Overlay Workbench Dashboard */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            
            {/* LATER-BY-LAYER CONTROLS SIDEBAR (Col-span 5/12) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Primary file info widget summary */}
              <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <FileText className="w-5 h-5 text-violet-605" />
                  <div className="truncate">
                    <p className="font-semibold text-slate-750 dark:text-slate-250 truncate">{primaryFile.name}</p>
                    <p className="text-slate-400">{formatSize(primaryFile.size)} • {primaryFile.pageCount} Pages</p>
                  </div>
                </div>
                <button
                  onClick={resetAll}
                  id="btn-remove-primary-doc"
                  className="p-1 px-2.5 border border-slate-200 hover:border-rose-500 rounded-lg text-rose-500 text-[10px] hover:bg-rose-500/5 cursor-pointer font-bold"
                >
                  Change Base
                </button>
              </div>

              {/* Upload layer stamp option or settings content */}
              {!overlayConfig.buffer ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold font-mono text-slate-400 tracking-wider uppercase">
                      Step 2: Upload Overlay Item (Stamp, Seal or PDF)
                    </h3>
                  </div>

                  {/* Drag-and-drop region for Stamp file, supports Images or PDFs */}
                  <div
                    onDragEnter={handleOverlayDrag}
                    onDragOver={handleOverlayDrag}
                    onDragLeave={handleOverlayDrag}
                    onDrop={handleOverlayDrop}
                    onClick={() => overlayInputRef.current?.click()}
                    id="overlay-dropzone-custom"
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer group ${
                      isDragOverOverlay
                        ? 'border-violet-500 bg-violet-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-white hover:border-violet-500 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <input
                      ref={overlayInputRef}
                      type="file"
                      id="overlay-file-picker"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleOverlayFile(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="p-3 bg-slate-105 dark:bg-slate-800 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3 text-slate-400 group-hover:scale-110 group-hover:text-violet-500 transition-transform">
                      <Layers className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Upload Signature, Seal, Logo, or PDF
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Supports PNG, JPG, or PDF (Letterhead / Template overlays)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between select-none p-3 border border-slate-100 dark:border-slate-850 bg-violet-500/5 rounded-xl text-xs">
                    <div className="flex items-center gap-2 truncate">
                      {overlayConfig.type === 'pdf' ? (
                        <FileText className="w-4.5 h-4.5 text-violet-600" />
                      ) : (
                        <ImageIcon className="w-4.5 h-4.5 text-violet-650" />
                      )}
                      <div className="truncate">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          Overlay: {overlayConfig.file?.name}
                        </p>
                        <p className="text-[10px] text-slate-450 uppercase font-bold font-mono">
                          Type: {overlayConfig.type} • {overlayConfig.pageCount > 0 ? `${overlayConfig.pageCount} sheets` : 'Image file'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={removeOverlayFile}
                      id="btn-remove-overlay-file"
                      className="p-1 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                      title="Remove overlay model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* PDF source selection multi-page helper */}
                  {overlayConfig.type === 'pdf' && overlayConfig.pageCount > 1 && (
                    <div className="p-4 border border-slate-100 dark:border-slate-850 rounded-xl space-y-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                        Select page of overlay PDF to apply:
                      </label>
                      <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border">
                        {Array.from({ length: Math.min(6, overlayConfig.pageCount) }).map((_, oIdx) => (
                          <button
                            key={oIdx}
                            onClick={() => {
                              setOverlayConfig((prev) => ({ ...prev, selectedOverlayPage: oIdx }));
                              if (overlayConfig.sourcePreviews[oIdx]) {
                                setOverlayImageSrc(overlayConfig.sourcePreviews[oIdx]);
                              }
                            }}
                            id={`btn-select-overlay-page-${oIdx}`}
                            className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                              overlayConfig.selectedOverlayPage === oIdx
                                ? 'bg-white dark:bg-slate-900 text-violet-600 font-bold shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            P. {oIdx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SETTINGS CARD */}
                  <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 space-y-5">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm">
                      <Settings className="w-4 h-4 text-violet-605" />
                      <span>Overlay Coordinates & Position</span>
                    </div>

                    {/* Presets Grid */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Position Preset Anchor
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                        {[
                          { key: 'full', label: 'Full Page (Template)' },
                          { key: 'center', label: 'Center Alignment' },
                          { key: 'top-left', label: 'Top-Left Core' },
                          { key: 'top-right', label: 'Top-Right' },
                          { key: 'bottom-left', label: 'Bottom-Left' },
                          { key: 'bottom-right', label: 'Bottom-Right Stamp' },
                          { key: 'custom', label: 'Coordinate Manual' }
                        ].map((preset) => (
                          <button
                            key={preset.key}
                            onClick={() => updatePreset(preset.key as any)}
                            id={`btn-overlay-preset-${preset.key}`}
                            className={`px-2 py-1.5 text-xs text-center border transition-all rounded-lg cursor-pointer ${
                              overlayConfig.positionPreset === preset.key
                                ? 'bg-violet-500 border-violet-500 text-white font-bold'
                                : 'bg-white hover:bg-slate-55 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-650'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Target range selecting options */}
                    <div className="space-y-3 pt-1 border-t border-slate-150 dark:border-slate-800">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                          Target Primary PDF Pages
                        </label>
                        <select
                          value={overlayConfig.targetPages}
                          onChange={(e: any) => {
                            setOverlayConfig((prev) => ({ ...prev, targetPages: e.target.value }));
                          }}
                          id="select-overlay-target-pages"
                          className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-205 rounded-xl font-semibold text-slate-705 cursor-pointer outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="all">Draw overlay on ALL pages</option>
                          <option value="first">Draw overlay on FIRST page only</option>
                          <option value="last">Draw overlay on LAST page only</option>
                          <option value="custom">Draw overlay on CUSTOM page range...</option>
                        </select>
                      </div>

                      {overlayConfig.targetPages === 'custom' && (
                        <div className="animation-fade-in space-y-1">
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                            Specify Page list (e.g. "1, 2, 4-6"):
                          </label>
                          <input
                            type="text"
                            value={overlayConfig.customRangeString}
                            onChange={(e) => {
                              setOverlayConfig((prev) => ({ ...prev, customRangeString: e.target.value }));
                            }}
                            id="input-overlay-custom-range"
                            placeholder="e.g. 1, 3, 5-8"
                            className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-195 rounded-xl text-slate-800 dark:text-slate-105 outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                          />
                        </div>
                      )}
                    </div>

                    {/* Dimensions / Scaling adjustments sliders */}
                    {overlayConfig.positionPreset !== 'full' && (
                      <div className="space-y-3 pt-1 border-t border-slate-150 dark:border-slate-800">
                        <div>
                          <div className="flex justify-between text-xs font-bold text-slate-550 mb-1">
                            <span>Image/PDF Scale Factor</span>
                            <span className="text-violet-600">{Math.round(overlayConfig.scale * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="3.0"
                            step="0.05"
                            value={overlayConfig.scale}
                            onChange={(e) => {
                              setOverlayConfig((prev) => ({ ...prev, scale: parseFloat(e.target.value) }));
                            }}
                            id="slider-overlay-scale"
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* Coordinates Adjustment grids */}
                    {overlayConfig.positionPreset !== 'full' && (
                      <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-150 dark:border-slate-800">
                        <div>
                          <div className="flex justify-between text-xs font-bold text-slate-550 mb-1">
                            <span>Offset X (pt)</span>
                            <span className="font-mono text-slate-400">{overlayConfig.offsetX}</span>
                          </div>
                          <input
                            type="number"
                            value={overlayConfig.offsetX}
                            onChange={(e) => {
                              setOverlayConfig((prev) => ({ ...prev, offsetX: parseInt(e.target.value, 10) || 0 }));
                            }}
                            id="input-overlay-offsetX"
                            className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-205 rounded-xl outline-none text-slate-800"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs font-bold text-slate-550 mb-1">
                            <span>Offset Y (pt)</span>
                            <span className="font-mono text-slate-400">{overlayConfig.offsetY}</span>
                          </div>
                          <input
                            type="number"
                            value={overlayConfig.offsetY}
                            onChange={(e) => {
                              setOverlayConfig((prev) => ({ ...prev, offsetY: parseInt(e.target.value, 10) || 0 }));
                            }}
                            id="input-overlay-offsetY"
                            className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-205 rounded-xl outline-none text-slate-800"
                          />
                        </div>
                      </div>
                    )}

                    {/* Opacity and Rotation parameters */}
                    <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-150 dark:border-slate-800">
                      <div>
                        <div className="flex justify-between text-xs font-bold text-slate-555 mb-1.5">
                          <span>Layer Opacity</span>
                          <span className="text-violet-600 font-bold">{Math.round(overlayConfig.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={overlayConfig.opacity}
                          onChange={(e) => {
                            setOverlayConfig((prev) => ({ ...prev, opacity: parseFloat(e.target.value) }));
                          }}
                          id="slider-overlay-opacity"
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs font-bold text-slate-555 mb-1.5">
                          <span>Step Rotation</span>
                        </div>
                        <select
                          value={overlayConfig.rotation}
                          onChange={(e) => {
                            setOverlayConfig((prev) => ({ ...prev, rotation: parseInt(e.target.value, 10) }));
                          }}
                          id="select-overlay-rotation"
                          className="w-full text-xs py-1 px-2 pb-1.5 bg-white dark:bg-slate-800 border rounded-xl font-mono"
                        >
                          <option value="0">0° (None)</option>
                          <option value="90">90° CW</option>
                          <option value="180">180° Flat</option>
                          <option value="270">270° CCW</option>
                        </select>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* REAL-TIME DYNAMIC WORKPLACE CANVAS (Col-span 7/12) */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-violet-606" />
                  <span className="text-xs font-bold font-mono text-slate-400 uppercase select-none">
                    Preview Layers Assembly (Standard Plate Page {previewPageIndex + 1} of {primaryFile.pageCount})
                  </span>
                </div>

                {/* Primary page navigation */}
                {primaryFile.pageCount > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPreviewPageIndex((prev) => Math.max(0, prev - 1))}
                      disabled={previewPageIndex === 0}
                      id="btn-overlay-prev-page"
                      className="p-1 text-slate-505 hover:text-slate-805 bg-slate-100 disabled:opacity-30 rounded-lg cursor-pointer"
                      title="See previous page stamp"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-300 font-semibold">
                      P. {previewPageIndex + 1} / {primaryFile.pageCount}
                    </span>
                    <button
                      onClick={() => setPreviewPageIndex((prev) => Math.min(primaryFile.pageCount - 1, prev + 1))}
                      disabled={previewPageIndex === primaryFile.pageCount - 1}
                      id="btn-overlay-next-page"
                      className="p-1 text-slate-505 hover:text-slate-805 bg-slate-100 disabled:opacity-30 rounded-lg cursor-pointer"
                      title="See next page stamp"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Central canvas viewport preview item */}
              <div className="bg-slate-100/50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/50 dark:border-slate-800 p-8 flex items-center justify-center min-h-[460px] relative overflow-hidden select-none">
                
                {/* Paper representation box */}
                <div 
                  id="primary-pdf-preview-sheet"
                  className="w-full max-w-[340px] bg-white border border-slate-200 shadow-md rounded-xs relative flex flex-col justify-between overflow-hidden"
                  style={{
                    aspectRatio: '8.5/11', // letter approximation
                  }}
                >
                  {/* Primary PDF page thumbnail drawing layer */}
                  {primaryFile.previews[previewPageIndex] ? (
                    <img
                      src={primaryFile.previews[previewPageIndex]}
                      alt="Primary document slide"
                      className="w-full h-full object-cover pointer-events-none select-none absolute top-0 left-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300 bg-slate-50">
                      <FileText className="w-12 h-12" />
                    </div>
                  )}

                  {/* Dynamic absolute position CSS overlay preview representing stamp */}
                  {overlayConfig.buffer && isAppliedOnCurrentPage && (
                    <div 
                      className="absolute overflow-hidden cursor-move transition-opacity hover:opacity-90"
                      style={getOverlayPreviewStyle()}
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent image dragging default browser behavior
                        if (overlayConfig.positionPreset === 'full') return;
                        setIsDragging(true);
                        setDragStart({ x: e.clientX, y: e.clientY, initialOffsetX: overlayConfig.offsetX, initialOffsetY: overlayConfig.offsetY });
                      }}
                    >
                      {overlayImageSrc ? (
                        <img 
                          src={overlayImageSrc} 
                          alt="Layout watermark stamp preview" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-16 border-2 border-dashed border-violet-500 bg-violet-500/10 rounded flex items-center justify-center">
                          <Layers className="w-6 h-6 text-violet-500 animate-pulse" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Banner helper indicating overlay status */}
                  <div className="absolute top-2 left-2 z-10 px-2.5 py-1 bg-slate-900/80 text-white rounded text-[9px] font-bold font-mono">
                    {isAppliedOnCurrentPage ? (
                      <span className="text-emerald-400">● OVERLAY ARMED</span>
                    ) : (
                      <span className="text-slate-400">● LAYER PASSTHROUGH</span>
                    )}
                  </div>

                </div>

              </div>
              
              {/* Overlay matching pages summary banner */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-xl flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Target Range layout guide:</p>
                  <p>
                    Layers will draw on: {overlayConfig.targetPages === 'all' ? 'Every page of the base PDF' : 
                    overlayConfig.targetPages === 'first' ? 'First page only' : 
                    overlayConfig.targetPages === 'last' ? 'Last page only' : 
                    `Selected page indicies: "${overlayConfig.customRangeString}"`}. 
                    Adjust position presets or use point coordinates to place stamps exactly without shifting margins.
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Global actions bar */}
        {primaryFile && overlayConfig.buffer && (
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-4 rounded-xl mt-6">
            <button
              onClick={resetAll}
              id="btn-overlay-clear-workspace"
              className="text-xs font-bold text-rose-505 hover:text-rose-600 cursor-pointer transition-colors"
            >
              Clear Workspace
            </button>

            <button
              onClick={handleApplyOverlay}
              disabled={loading}
              id="btn-overlay-submit"
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-500/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Apply Layers & Merge PDF
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
