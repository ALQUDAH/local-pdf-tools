/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  FileCode, 
  Loader2, 
  RefreshCw, 
  Download, 
  Trash2, 
  FilePlus2, 
  Info,
  ChevronRight,
  Grid,
  Sparkles,
  LayoutGrid,
  ChevronLeft
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, generateNUpPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import JSZip from 'jszip';

interface NUpToolProps {
  onBack: () => void;
}

export default function NUpTool({ onBack }: NUpToolProps) {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);

  // N-Up Settings
  const [rows, setRows] = useState<number>(2);
  const [cols, setCols] = useState<number>(2);
  const [pageSize, setPageSize] = useState<'A4' | 'Letter' | 'SameAsSource'>('Letter');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [margin, setMargin] = useState<number>(20);
  const [gap, setGap] = useState<number>(10);
  const [drawBorders, setDrawBorders] = useState<boolean>(true);
  const [pageOrder, setPageOrder] = useState<'horizontal' | 'vertical'>('horizontal');

  // Preview Pagination
  const [previewSheetIndex, setPreviewSheetIndex] = useState<number>(0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFilesSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setStatusText('Reading uploaded PDFs...');
    setSuccess(false);

    try {
      const parsedFiles: PDFFile[] = [];
      for (const file of newRawFiles) {
        const arrayBuffer = await fileToArrayBuffer(file);
        // Load first 12 cover preview thumbnails for performance quickly
        const { pageCount, previews } = await getPdfDetails(arrayBuffer, 12);

        parsedFiles.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          name: file.name,
          size: file.size,
          arrayBuffer,
          pageCount,
          previews,
        });
      }

      setFiles((prev) => {
        const nextList = [...prev, ...parsedFiles];
        if (!selectedFileId && nextList.length > 0) {
          inspectFileDetails(nextList[0], nextList);
        }
        return nextList;
      });
    } catch (err) {
      console.error(err);
      alert('Error parsing uploaded file details.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const inspectFileDetails = async (targetFile: PDFFile, currentFileList = files) => {
    setSelectedFileId(targetFile.id);
    setPreviewSheetIndex(0);
    
    // If the PDF page count is higher than loaded thumbnails, load up to 40 for premium detailed preview
    if (targetFile.previews.length < Math.min(targetFile.pageCount, 40)) {
      setLoading(true);
      setStatusText(`Loading detailed pages for interactive viewer...`);
      try {
        const { previews } = await getPdfDetails(targetFile.arrayBuffer, 40);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === targetFile.id ? { ...f, previews } : f
          )
        );
      } catch (err) {
        console.warn('Failed to render deep thumbnail pages:', err);
      } finally {
        setLoading(false);
        setStatusText('');
      }
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => {
      const remaining = prev.filter((f) => f.id !== fileId);
      if (selectedFileId === fileId) {
        if (remaining.length > 0) {
          inspectFileDetails(remaining[0], remaining);
        } else {
          setSelectedFileId(null);
        }
      }
      return remaining;
    });
    setSuccess(false);
  };

  // Compile and Save N-Up PDF
  const handleApplyNUp = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setStatusText('Formatting grids and stitching layout sheets...');

    try {
      if (files.length === 1) {
        // Single PDF N-Up compilation
        const file = files[0];
        const bytes = await generateNUpPdf(file.arrayBuffer, {
          rows,
          cols,
          pageSize,
          orientation,
          margin,
          gap,
          drawBorders,
          pageOrder,
        });

        const baseName = file.name.replace(/\.pdf$/i, '');
        downloadFile(bytes, `${baseName}_${rows}x${cols}_nup.pdf`, 'application/pdf');
        setSuccess(true);
      } else {
        // Batch ZIP package
        const zip = new JSZip();
        for (const file of files) {
          setStatusText(`Compiling N-Up pages for "${file.name}"...`);
          const bytes = await generateNUpPdf(file.arrayBuffer, {
            rows,
            cols,
            pageSize,
            orientation,
            margin,
            gap,
            drawBorders,
            pageOrder,
          });
          zip.file(`${file.name.replace(/\.pdf$/i, '')}_${rows}x${cols}_nup.pdf`, bytes);
        }

        setStatusText('Packing finished documents into single ZIP archive...');
        const zipContent = await zip.generateAsync({ type: 'uint8array' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadFile(zipContent, `nup_layouts_batch_${timestamp}.zip`, 'application/zip');
        setSuccess(true);
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to generate N-Up document layout.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const resetTool = () => {
    setFiles([]);
    setSelectedFileId(null);
    setPreviewSheetIndex(0);
    setSuccess(false);
  };

  const selectPreset = (r: number, c: number) => {
    setRows(r);
    setCols(c);
    setSuccess(false);
    setPreviewSheetIndex(0);
  };

  const activeFile = files.find((f) => f.id === selectedFileId) || null;

  // Pages calculations
  const pagesPerSheet = rows * cols;
  const totalSheets = activeFile ? Math.ceil(activeFile.pageCount / pagesPerSheet) : 0;

  // Compute pages drawn on the active preview sheet
  const getPagesForPreviewSheet = () => {
    if (!activeFile) return [];
    
    const pages: { globalIndex: number; localIndexOnSheet: number }[] = [];
    const startIndex = previewSheetIndex * pagesPerSheet;
    const endIndex = Math.min(activeFile.pageCount, startIndex + pagesPerSheet);

    for (let i = startIndex; i < endIndex; i++) {
      pages.push({
        globalIndex: i,
        localIndexOnSheet: i - startIndex,
      });
    }
    return pages;
  };

  const previewPages = getPagesForPreviewSheet();

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-nup-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-full font-semibold">
            Grid Layout Engine
          </span>
          <span className="text-xs font-mono px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-semibold">
            100% Client-Side
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-55 tracking-tight">N-Up Print layouts (Plates Grid)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Place multiple miniature page thumbnails onto a single sheet of paper (e.g. 2-Up, 4-Up, 9-Up, 16-Up). Invaluable for booklets, printing slides efficiently, and saving paper.
          </p>
        </div>

        {/* Dropzone */}
        <div className="mb-6">
          <Dropzone
            id="nup-dropzone"
            onFilesSelected={handleFilesSelected}
            multiple={true}
            title={files.length > 0 ? "Add more source PDFs to customize" : "Upload one or many PDFs for N-Up Layout"}
            description="Processing is executed harmlessly inside your browser sandbox."
          />
        </div>

        {/* Loading progress banner */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-teal-500/5 border border-teal-500/10 flex items-center gap-4 text-sm text-slate-750 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-teal-605 animate-spin shrink-0" />
            <span>{statusText || 'Recalculating plates...'}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold font-sans">Document Layout Applied Successfully!</span>{' '}
                {files.length > 1
                  ? 'Your processed batch zip package has been built and downloaded.'
                  : 'Your configured N-Up layout document has been compiled and downloaded.'}
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-nup-reset-success"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset workspace
            </button>
          </div>
        )}

        {/* Workspace Panels */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            
            {/* LEFT COLUMN: Controls / Adjustments (5/12) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Batch Sidebar Document Navigator */}
              {files.length > 1 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase select-none">
                    Batch File Navigator ({files.length})
                  </h3>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {files.map((file) => {
                      const active = file.id === selectedFileId;
                      return (
                        <div
                          key={file.id}
                          onClick={() => inspectFileDetails(file)}
                          id={`nup-batch-nav-${file.id}`}
                          className={`p-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                            active
                              ? 'bg-teal-500/5 border-teal-400 dark:border-teal-500 text-teal-950 dark:text-teal-205 font-medium'
                              : 'bg-slate-50/40 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-600 dark:text-slate-350'
                          }`}
                        >
                          <span className="truncate max-w-[200px]">{file.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400">{file.pageCount} p</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.id);
                              }}
                              id={`btn-remove-nup-file-${file.id}`}
                              className="p-1 hover:text-rose-500 hover:bg-rose-500/10 rounded-sm cursor-pointer"
                              title="Delete file from workspace"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 space-y-5">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-sm">
                  <Grid className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Configure Grid Layout</span>
                </div>

                {/* Rows & Cols Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Columns
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={cols}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                        setCols(val);
                        setSuccess(false);
                        setPreviewSheetIndex(0);
                      }}
                      id="n-up-cols-input"
                      className="w-full text-sm py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-150 outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Rows
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={rows}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                        setRows(val);
                        setSuccess(false);
                        setPreviewSheetIndex(0);
                      }}
                      id="n-up-rows-input"
                      className="w-full text-sm py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-155 outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  </div>
                </div>

                {/* Presets Row */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Quick Preset Grid Sizes
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { r: 1, c: 2, label: '2-Up' },
                      { r: 2, c: 1, label: '2-Up Vert' },
                      { r: 2, c: 2, label: '4-Up (2x2)' },
                      { r: 2, c: 3, label: '6-Up' },
                      { r: 2, c: 4, label: '8-Up' },
                      { r: 3, c: 3, label: '9-Up' },
                      { r: 4, c: 4, label: '16-Up' }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectPreset(preset.r, preset.c)}
                        id={`btn-preset-${preset.c}x${preset.r}`}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          rows === preset.r && cols === preset.c
                            ? 'bg-teal-500 border-teal-505 text-white shadow-xs'
                            : 'bg-white hover:bg-slate-55 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-300'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spacing adjustments */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Margins (pt)
                    </label>
                    <select
                      value={margin}
                      onChange={(e) => {
                        setMargin(parseInt(e.target.value, 10));
                        setSuccess(false);
                      }}
                      id="select-nup-margin"
                      className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="0">0 pt (Borderless)</option>
                      <option value="10">10 pt (Small)</option>
                      <option value="20">20 pt (Standard)</option>
                      <option value="40">40 pt (Wide)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Gap Distance (pt)
                    </label>
                    <select
                      value={gap}
                      onChange={(e) => {
                        setGap(parseInt(e.target.value, 10));
                        setSuccess(false);
                      }}
                      id="select-nup-gap"
                      className="w-full text-xs py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="0">No Gap</option>
                      <option value="5">5 pt (Compact)</option>
                      <option value="10">10 pt (Normal)</option>
                      <option value="15">15 pt (Spacious)</option>
                      <option value="25">25 pt (Wide)</option>
                    </select>
                  </div>
                </div>

                {/* Sizing & Orientation */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Sheet Size
                    </label>
                    <select
                      value={pageSize}
                      onChange={(e: any) => {
                        setPageSize(e.target.value);
                        setSuccess(false);
                      }}
                      id="select-nup-pagesize"
                      className="w-full text-xs py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="Letter">Letter (US)</option>
                      <option value="A4">A4 (Standard)</option>
                      <option value="SameAsSource">Same as original</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Orientation
                    </label>
                    <select
                      value={orientation}
                      onChange={(e: any) => {
                        setOrientation(e.target.value);
                        setSuccess(false);
                      }}
                      id="select-nup-orientation"
                      className="w-full text-xs py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                {/* Page Flow Sequencing Layout options */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Grid Flow Placement
                    </label>
                    <div className="flex bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700">
                      <button
                        onClick={() => {
                          setPageOrder('horizontal');
                          setSuccess(false);
                        }}
                        id="btn-flow-horizontal"
                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          pageOrder === 'horizontal'
                            ? 'bg-white dark:bg-slate-900 text-teal-605 dark:text-teal-400 shadow-xs'
                            : 'text-slate-500 dark:text-slate-450'
                        }`}
                        title="Left-to-right rows first"
                      >
                        Horizontal →
                      </button>
                      <button
                        onClick={() => {
                          setPageOrder('vertical');
                          setSuccess(false);
                        }}
                        id="btn-flow-vertical"
                        className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                          pageOrder === 'vertical'
                            ? 'bg-white dark:bg-slate-900 text-teal-605 dark:text-teal-400 shadow-xs'
                            : 'text-slate-500 dark:text-slate-450'
                        }`}
                        title="Top-to-bottom columns first"
                      >
                        Vertical ↓
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 select-none pb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={drawBorders}
                        onChange={(e) => {
                          setDrawBorders(e.target.checked);
                          setSuccess(false);
                        }}
                        id="checkbox-draw-borders"
                        className="w-4 h-4 rounded text-teal-600 border-slate-305 dark:border-slate-700 focus:ring-teal-500 cursor-pointer"
                      />
                      Draw frame outlines
                    </label>
                  </div>
                </div>

              </div>

              {/* PDF Info box */}
              {activeFile && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-xl space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">File details:</p>
                  <p className="truncate">Name: <span className="font-semibold">{activeFile.name}</span></p>
                  <p>Original Page Count: <span className="font-semibold">{activeFile.pageCount} sheets</span></p>
                  <p>Arranged Into: <span className="font-semibold text-teal-605 dark:text-teal-400">{totalSheets} output sheets</span> ({pagesPerSheet} pages/sheet)</p>
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: Real-Time Dynamic Sheet visual previewer (7/12) */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-bold font-mono text-slate-400 uppercase select-none">
                    Preview Plates Grid (Dynamic Sheet {previewSheetIndex + 1} of {totalSheets || 1})
                  </span>
                </div>

                {/* Sheet Page selectors */}
                {totalSheets > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPreviewSheetIndex((prev) => Math.max(0, prev - 1))}
                      disabled={previewSheetIndex === 0}
                      id="btn-prev-preview-sheet"
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-250 bg-slate-100 dark:bg-slate-800 disabled:opacity-30 rounded-lg cursor-pointer"
                      title="Previous preview sheet"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-300 font-semibold">
                      Sheet {previewSheetIndex + 1} / {totalSheets}
                    </span>
                    <button
                      onClick={() => setPreviewSheetIndex((prev) => Math.min(totalSheets - 1, prev + 1))}
                      disabled={previewSheetIndex === totalSheets - 1}
                      id="btn-next-preview-sheet"
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-250 bg-slate-100 dark:bg-slate-800 disabled:opacity-30 rounded-lg cursor-pointer"
                      title="Next preview sheet"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {activeFile ? (
                <div className="bg-slate-100/50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/50 dark:border-slate-800 p-8 flex items-center justify-center min-h-[460px] relative">
                  
                  {/* Digital Paper mockup representation */}
                  <div 
                    style={{
                      aspectRatio: orientation === 'portrait' ? '8.5/11' : '11/8.5',
                      padding: `${margin * 1.5}px` // scale visually for representation
                    }}
                    className="w-full max-w-[400px] bg-white border border-slate-200 shadow-md rounded-xs relative flex flex-col justify-between select-none animation-fade-in"
                  >
                    
                    {/* Inner printable grid with custom absolute columns */}
                    <div 
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, minmax(0, 1-fr))`,
                        gridTemplateRows: `repeat(${rows}, minmax(0, 1-fr))`,
                        gap: `${gap * 0.8}px`,
                        width: '100%',
                        height: '100%'
                      }}
                      className="grid h-full"
                    >
                      {/* Generates rows and cols items */}
                      {Array.from({ length: pagesPerSheet }).map((_, localIndex) => {
                        // Find matching page index depending on the layout order
                        let indexOnSheet = localIndex;
                        let rIndex = 0;
                        let cIndex = 0;

                        if (pageOrder === 'horizontal') {
                          rIndex = Math.floor(localIndex / cols);
                          cIndex = localIndex % cols;
                        } else {
                          cIndex = Math.floor(localIndex / rows);
                          rIndex = localIndex % rows;
                        }

                        // Determine page Index based on order structure
                        const indexOnSheetOrdered = pageOrder === 'horizontal' 
                          ? localIndex 
                          : (cIndex * rows + rIndex);

                        const globalPageIndex = previewSheetIndex * pagesPerSheet + indexOnSheetOrdered;
                        const hasRealPage = activeFile && globalPageIndex < activeFile.pageCount;
                        const thumb = hasRealPage && globalPageIndex < activeFile.previews.length ? activeFile.previews[globalPageIndex] : null;

                        return (
                          <div
                            key={localIndex}
                            style={{
                              gridRow: rIndex + 1,
                              gridColumn: cIndex + 1,
                            }}
                            className={`relative aspect-[3/4] bg-slate-50 dark:bg-slate-900 flex items-center justify-center font-sans ${
                              hasRealPage 
                                ? (drawBorders ? 'border border-slate-300' : '') 
                                : 'opacity-10 border border-dashed border-slate-300'
                            }`}
                          >
                            {hasRealPage ? (
                              <>
                                {thumb ? (
                                  <img 
                                    src={thumb} 
                                    alt={`Preview page ${globalPageIndex + 1}`}
                                    className="w-full h-full object-contain pointer-events-none select-none"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-[10px] text-slate-400 font-bold font-mono">
                                    <FileCode className="w-5 h-5 text-slate-300 mb-1" />
                                    <span>P. {globalPageIndex + 1}</span>
                                  </div>
                                )}
                                <span className="absolute bottom-1 right-1 bg-slate-900/60 text-white rounded text-[8px] px-1 font-mono leading-none py-0.5">
                                  {globalPageIndex + 1}
                                </span>
                              </>
                            ) : (
                              <div className="text-[9px] text-slate-400 select-none">
                                empty
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>

                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 select-none py-20 bg-slate-50/50 dark:bg-slate-950/5">
                  <Info className="w-8 h-8 text-slate-350 mb-2" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-450">
                    No Document Uploaded
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload documents to adjust paper layouts. Live visual grids render automatically to guide adjustments.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Global Action items */}
        {files.length > 0 && (
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-4 rounded-xl mt-6">
            <button
              onClick={resetTool}
              id="btn-nup-clear-workspace"
              className="text-xs font-bold text-rose-505 hover:text-rose-600 cursor-pointer transition-colors"
            >
              Clear Workspace
            </button>

            <button
              onClick={handleApplyNUp}
              disabled={loading}
              id="btn-nup-submit"
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {files.length > 1
                ? `Apply N-Up Layout & Download ZIP (${files.length} PDFs)`
                : `Apply N-Up Layout & Download PDF`}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
