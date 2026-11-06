/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Sliders, CheckSquare, Square, Info, Loader2 } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, splitPdf, parsePageRanges, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

import { tr } from '../i18n';
interface SplitToolProps {
  onBack: () => void;
}

export default function SplitTool({ onBack }: SplitToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [rangeInput, setRangeInput] = useState<string>('1');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedPages, setSelectedPages] = useState<number[]>([]); // 0-based page indices

  // Format utility
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setStatusText(tr("Reading single PDF document details..."));
    setSuccess(false);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      
      // Load standard count and rendering of some thumbnails
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 8); // Render up to 8 page covers for preview

      const parsedFile: PDFFile = {
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      };

      setFile(parsedFile);

      // Default split selection
      setRangeInput(`1-${Math.min(pageCount, 3)}`);
    } catch (err) {
      console.error(err);
      alert(tr("Error parsing the PDF. The file may be password protected or corrupted."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // Sync index array when range textual input changes
  useEffect(() => {
    if (!file) return;
    const parsed = parsePageRanges(rangeInput, file.pageCount);
    setSelectedPages(parsed);
  }, [rangeInput, file]);

  // Sync textual input when hand-checked pages toggle (e.g. grid checklist selects page)
  const togglePageSelection = (pageIdx: number) => {
    if (!file) return;
    setSuccess(false);

    let nextSelected: number[];
    if (selectedPages.includes(pageIdx)) {
      nextSelected = selectedPages.filter((p) => p !== pageIdx);
    } else {
      nextSelected = [...selectedPages, pageIdx].sort((a, b) => a - b);
    }

    setSelectedPages(nextSelected);

    // Convert 0-indexed indices list back into a clean range string
    // e.g. [0, 1, 2, 4] -> "1-3, 5"
    if (nextSelected.length === 0) {
      setRangeInput('');
      return;
    }

    const ranges: string[] = [];
    let rStart = nextSelected[0];
    let rEnd = rStart;

    for (let i = 1; i < nextSelected.length; i++) {
      const current = nextSelected[i];
      if (current === rEnd + 1) {
        rEnd = current;
      } else {
        ranges.push(rStart === rEnd ? `${rStart + 1}` : `${rStart + 1}-${rEnd + 1}`);
        rStart = current;
        rEnd = current;
      }
    }
    ranges.push(rStart === rEnd ? `${rStart + 1}` : `${rStart + 1}-${rEnd + 1}`);
    setRangeInput(ranges.join(', '));
  };

  const selectOddPages = () => {
    if (!file) return;
    setSuccess(false);
    const odds: string[] = [];
    for (let i = 1; i <= file.pageCount; i += 2) {
      odds.push(`${i}`);
    }
    setRangeInput(odds.join(', '));
  };

  const selectEvenPages = () => {
    if (!file) return;
    setSuccess(false);
    const evens: string[] = [];
    for (let i = 2; i <= file.pageCount; i += 2) {
      evens.push(`${i}`);
    }
    setRangeInput(evens.join(', '));
  };

  const selectAllPages = () => {
    if (!file) return;
    setSuccess(false);
    setRangeInput(`1-${file.pageCount}`);
  };

  const handleSplit = async () => {
    if (!file || selectedPages.length === 0) return;
    setLoading(true);
    setStatusText(tr("Extracting pages client-side..."));
    setSuccess(false);

    try {
      const splitBytes = await splitPdf(file.arrayBuffer, selectedPages);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `split_${timestamp}.pdf`;
      
      downloadFile(splitBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to split file. Check your specified bounds."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const removeFile = () => {
    setFile(null);
    setSelectedPages([]);
    setRangeInput('1');
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-split-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-full font-semibold">
          {tr("100% Client-Side")}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{tr("Split PDF Pages")}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Specify page coordinates or select visually to carve out custom documents.")}
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="split-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title={tr("Upload PDF to extract pages")}
              description={tr("Drop file here to view page count and carve customized subsets.")}
            />
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
            <span>{statusText || tr("Processing...")}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-semibold">{tr("Successfully Split!")}</span> {tr("Extracted sub-document has been downloaded.")}
            </div>
          </div>
        )}

        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            {/* Split controls (Left or top column) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex items-start justify-between min-w-0">
                  <div className="truncate pe-4">
                    <p className="text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase">{tr("Target Document")}</p>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{file.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{formatSize(file.size)}</p>
                  </div>
                  <button
                    onClick={removeFile}
                    id="btn-split-change"
                    className="text-xs font-semibold px-2.5 py-1 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-all cursor-pointer"
                  >
                    {tr("Change")}
                  </button>
                </div>
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{tr("Total Pages:")}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{file.pageCount} {tr("pages")}</span>
                </div>
              </div>

              {/* Range settings panel */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{tr("Define Page Extract Ranges")}</span>
                </div>

                <div className="space-y-3">
                  <label htmlFor="range-selection-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {tr("Range Syntax (e.g.,")} <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-indigo-500 font-bold">1-3, 5</code>)
                  </label>
                  <input
                    type="text"
                    id="range-selection-input"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="e.g. 1-3, 5, 8-10"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none transition-colors font-mono"
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={selectAllPages}
                      id="btn-split-all-preset"
                      className="text-xs font-semibold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      {tr("Extract All")}
                    </button>
                    <button
                      type="button"
                      onClick={selectOddPages}
                      id="btn-split-odd-preset"
                      className="text-xs font-semibold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      {tr("Odd Pages Only")}
                    </button>
                    <button
                      type="button"
                      onClick={selectEvenPages}
                      id="btn-split-even-preset"
                      className="text-xs font-semibold px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      {tr("Even Pages Only")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Info */}
              <div className="flex gap-2.5 p-3 rounded-xl bg-orange-500/5 text-orange-600 dark:text-orange-400 text-xs border border-orange-500/10">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-normal">
                  {tr("Toggle selection checkboxes inside the grid view to easily include or exclude individual sheets.")}
                </span>
              </div>

              {/* Final Split Trigger */}
              <button
                onClick={handleSplit}
                disabled={selectedPages.length === 0 || loading}
                id="btn-split-submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {tr("Extract Selected Pages (")}{selectedPages.length})
              </button>
            </div>

            {/* Visual Checklist Column (Right) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <span>{tr("Selectable Pages Grid")}</span>
                <span>{tr("Sorted")}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 p-4 border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl max-h-[500px] overflow-y-auto">
                {Array.from({ length: file.pageCount }).map((_, index) => {
                  const isChecked = selectedPages.includes(index);
                  const previewUrl = file.previews[index];

                  return (
                    <button
                      key={index}
                      id={`page-select-box-${index + 1}`}
                      onClick={() => togglePageSelection(index)}
                      className={`relative flex flex-col items-center justify-between p-3 rounded-lg border text-center transition-all cursor-pointer group ${
                        isChecked
                          ? 'border-indigo-500 bg-indigo-500/5 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 hover:border-indigo-400'
                      }`}
                    >
                      {/* Cover Preview Image */}
                      {previewUrl ? (
                        <div className="w-full aspect-[3/4] mb-2 rounded bg-white overflow-hidden shadow-xs border border-slate-100 select-none">
                          <img
                            src={previewUrl}
                            alt={tr("Preview page {0}", index + 1)}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      ) : (
                        <div className="w-full aspect-[3/4] mb-2 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center select-none border border-slate-200/50 text-slate-400">
                          <FileCode className="w-8 h-8" />
                        </div>
                      )}

                      {/* Header Box & Control Check */}
                      <div className="flex items-center gap-1.5 mt-1 select-none">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-500 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={`text-[11px] font-bold ${isChecked ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {tr("Page")} {index + 1}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
