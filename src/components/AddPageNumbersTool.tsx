/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Printer, Hash, Grid, Settings2, Loader2, RefreshCw, Download } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, addPageNumbersToPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface AddPageNumbersToolProps {
  onBack: () => void;
}

type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';

export default function AddPageNumbersTool({ onBack }: AddPageNumbersToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Configuration options
  const [format, setFormat] = useState('Page {n} of {total}');
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [fontSize, setFontSize] = useState<number>(10);
  const [color, setColor] = useState('#475569'); // Charcoal gray default
  const [skipFirstPage, setSkipFirstPage] = useState(true);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
    } catch (err) {
      console.error(err);
      alert('Error parsing PDF content attributes.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const compiledBytes = await addPageNumbersToPdf(file.arrayBuffer, {
        format,
        position,
        fontSize,
        color,
        skipFirstPage,
      });

      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_numbered.pdf`;
      
      downloadFile(compiledBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to stamp page numbering schema to PDF.');
    } finally {
      setLoading(false);
    }
  };

  const resetTool = () => {
    setFile(null);
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-pagenum-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-105 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold">
          Local Page Numbering
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Add PDF Page Numbers</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure placement grids, running layout formulas, font scaling, and title-page skipping parameters.
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="pagenum-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title="Upload PDF to number pages"
              description="Upload a document to stamp page numbering indexes dynamically."
            />
          </div>
        )}

        {loading && (
          <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300 mb-6">
            <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
            <span>Reading sheets & compiling virtual numbers...</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">Successfully Numbered!</span> Your formatted document has been saved and downloaded.
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-pagenum-reset"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start New
            </button>
          </div>
        )}

        {/* Settings view and document thumbnail */}
        {file && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            {/* Meta and Config */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <FileCode className="w-3.5 h-3.5" />
                <span>Selected Document</span>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center gap-4">
                  {file.previews.length > 0 ? (
                    <img
                      src={file.previews[0]}
                      alt="Cover Screen"
                      referrerPolicy="no-referrer"
                      className="w-16 h-22 object-cover rounded-md shadow-md border border-slate-200 bg-white shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-22 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 shrink-0 text-slate-400 select-none">
                      <FileCode className="w-8 h-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold">{formatSize(file.size)}</p>
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded inline-block text-slate-600 dark:text-slate-300 mt-2">
                      {file.pageCount} Pages Loaded
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-850 flex justify-end">
                  <button
                    type="button"
                    onClick={resetTool}
                    id="btn-pagenum-change-file"
                    className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Layout Placement Matrix */}
              <div className="space-y-3">
                <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  Page Positioning Grid
                </span>
                <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-100 dark:border-slate-800 max-w-sm">
                  {(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as NumberPosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setPosition(pos)}
                      id={`btn-pos-${pos}`}
                      className={`h-11 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex flex-col items-center justify-center font-mono uppercase ${
                        position === pos
                          ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400 shadow-sm font-black'
                          : 'border-slate-200 dark:border-slate-805 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pos.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Config panel parameters */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Style & Content Options</span>
              </div>

              <div className="space-y-4">
                {/* Format selection */}
                <div className="space-y-2">
                  <label htmlFor="pagenum-format-field" className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                    Running Text Formula
                  </label>
                  <select
                    id="pagenum-format-field"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="Page {n} of {total}">Page X of Y (Page {1} of {file.pageCount})</option>
                    <option value="Page {n}">Page X (Page {1})</option>
                    <option value="{n}">Just Number Index ({1})</option>
                    <option value="- {n} -">- X - (- {1} -)</option>
                    <option value="Page {n} / {total}">Page X / Y (Page {1} / {file.pageCount})</option>
                  </select>
                </div>

                {/* Font Size & color */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="pagenum-fontSize-field" className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                      Font Size (pt)
                    </label>
                    <input
                      type="number"
                      id="pagenum-fontSize-field"
                      min={6}
                      max={20}
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value) || 10)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="pagenum-color-field" className="block text-xs font-bold text-slate-600 dark:text-slate-400">
                      Label Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="pagenum-color-field"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-11 h-10 p-1 bg-white dark:bg-slate-905 border border-slate-300 dark:border-slate-700 rounded-xl cursor-search shrink-0"
                      />
                      <input
                        type="text"
                        id="pagenum-color-hex-field"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-full px-2.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl uppercase font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Checkbox: skip first page */}
                <div className="pt-2">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={skipFirstPage}
                      onChange={(e) => setSkipFirstPage(e.target.checked)}
                      id="pagenum-skip-cover-checkbox"
                      className="w-4.5 h-4.5 text-violet-600 border-slate-300 dark:border-slate-700 rounded-md focus:ring-violet-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Skip Cover Page (Page 1)
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Do not stamp numbering elements on the first page of the document.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Form Apply Action */}
                <button
                  type="submit"
                  disabled={loading}
                  id="btn-pagenum-submit"
                  className="w-full mt-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-650/40 text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Add Page Numbers to PDF
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
