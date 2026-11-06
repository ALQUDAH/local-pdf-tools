/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  FileCode, 
  RotateCw, 
  RotateCcw, 
  Loader2, 
  RefreshCw, 
  Undo, 
  Download, 
  Trash2, 
  FilePlus2, 
  Info,
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, rotatePdfPages, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import JSZip from 'jszip';

interface RotateToolProps {
  onBack: () => void;
}

export default function RotateTool({ onBack }: RotateToolProps) {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Maps fileId -> { pageIndex -> rotationDegrees }
  const [rotations, setRotations] = useState<Record<string, Record<number, number>>>({});

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
        // Load just 1 cover page thumbnail on initial load for high speed
        const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);

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
        // Select the first uploaded document by default
        if (!selectedFileId && nextList.length > 0) {
          inspectFileDetails(nextList[0], nextList);
        }
        return nextList;
      });
    } catch (err) {
      console.error(err);
      alert('Error parsing some PDF structure details.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const inspectFileDetails = async (targetFile: PDFFile, currentFileList = files) => {
    setSelectedFileId(targetFile.id);
    
    // If we only have 1 slide previews, but page count is higher, lazily load deep page thumbnails!
    if (targetFile.previews.length < Math.min(targetFile.pageCount, 40)) {
      setLoading(true);
      setStatusText(`Loading detailed thumbnails for "${targetFile.name}"...`);
      try {
        const { previews } = await getPdfDetails(targetFile.arrayBuffer, 40);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === targetFile.id ? { ...f, previews } : f
          )
        );
      } catch (err) {
        console.warn('Could not load detailed previews for editing, falling back:', err);
      } finally {
        setLoading(false);
        setStatusText('');
      }
    }
  };

  // Rotation triggers
  const rotatePage = (fileId: string, pageIndex: number, direction: 'cw' | 'ccw') => {
    setRotations((prev) => {
      const fileRotations = { ...(prev[fileId] || {}) };
      const current = fileRotations[pageIndex] || 0;
      const addition = direction === 'cw' ? 90 : -90;
      let next = (current + addition) % 360;
      if (next < 0) next += 360;
      
      fileRotations[pageIndex] = next;
      return {
        ...prev,
        [fileId]: fileRotations
      };
    });
    setSuccess(false);
  };

  const rotateAllInFile = (fileId: string, direction: 'cw' | 'ccw') => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile) return;
    const addition = direction === 'cw' ? 90 : -90;

    setRotations((prev) => {
      const fileRotations = { ...(prev[fileId] || {}) };
      for (let i = 0; i < targetFile.pageCount; i++) {
        const current = fileRotations[i] || 0;
        let next = (current + addition) % 360;
        if (next < 0) next += 360;
        fileRotations[i] = next;
      }
      return {
        ...prev,
        [fileId]: fileRotations
      };
    });
    setSuccess(false);
  };

  const rotateAllInAllFiles = (direction: 'cw' | 'ccw') => {
    const addition = direction === 'cw' ? 90 : -90;

    setRotations((prev) => {
      const nextRotations = { ...prev };
      files.forEach((file) => {
        const fileRotations = { ...(nextRotations[file.id] || {}) };
        for (let i = 0; i < file.pageCount; i++) {
          const current = fileRotations[i] || 0;
          let next = (current + addition) % 360;
          if (next < 0) next += 360;
          fileRotations[i] = next;
        }
        nextRotations[file.id] = fileRotations;
      });
      return nextRotations;
    });
    setSuccess(false);
  };

  const resetFileRotations = (fileId: string) => {
    setRotations((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setSuccess(false);
  };

  const resetAllRotations = () => {
    setRotations({});
    setSuccess(false);
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
    setRotations((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setSuccess(false);
  };

  // Compile rotated documents
  const handleApplyRotations = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setStatusText('Generating modified document sheets...');

    try {
      if (files.length === 1) {
        // Single File Direct download
        const file = files[0];
        const fileRotations = rotations[file.id] || {};
        const modifiedBytes = await rotatePdfPages(file.arrayBuffer, fileRotations);
        const baseName = file.name.replace(/\.pdf$/i, '');
        const filename = `${baseName}_rotated.pdf`;
        
        downloadFile(modifiedBytes, filename, 'application/pdf');
        setSuccess(true);
      } else {
        // Multi-File Batch ZIP packer
        const zip = new JSZip();
        for (const file of files) {
          setStatusText(`Applying page rotation vectors for "${file.name}"...`);
          const fileRotations = rotations[file.id] || {};
          const modifiedBytes = await rotatePdfPages(file.arrayBuffer, fileRotations);
          zip.file(`${file.name.replace(/\.pdf$/i, '')}_rotated.pdf`, modifiedBytes);
        }

        setStatusText('Compressing all processed files into single ZIP archive...');
        const zipContent = await zip.generateAsync({ type: 'uint8array' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadFile(zipContent, `rotated_batch_${timestamp}.zip`, 'application/zip');
        setSuccess(true);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to rotate and save PDF sheets. Verify files are unencrypted.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const resetTool = () => {
    setFiles([]);
    setSelectedFileId(null);
    setRotations({});
    setSuccess(false);
  };

  // Find the selected PDF details
  const activeFile = files.find((f) => f.id === selectedFileId) || null;

  // Check if a file has modified parameters
  const isDocModified = (fileId: string) => {
    const fileRot = rotations[fileId];
    if (!fileRot) return false;
    return Object.values(fileRot).some((val) => val !== 0);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-rotate-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold">
            ZIP-Stream Compression
          </span>
          <span className="text-xs font-mono px-3 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-full font-semibold">
            100% Client-Side
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Rotate PDF Pages</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Correct upside-down pages, adjust scanner orientations, or apply bulk rotations across multiple documents simultaneously.
            </p>
          </div>

          {/* Global Bulk Rotations */}
          {files.length > 1 && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 rounded-xl shrink-0 self-start">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase px-2 font-mono">
                All Files:
              </span>
              <button
                onClick={() => rotateAllInAllFiles('cw')}
                id="btn-global-cw"
                className="px-2.5 py-1 bg-white hover:bg-slate-55 dark:bg-slate-905 dark:hover:bg-slate-850 hover:shadow-xs text-slate-705 dark:text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                title="Rotate ALL pages in ALL documents clockwise by 90 degrees"
              >
                <RotateCw className="w-3 h-3 text-sky-505" /> +90° All
              </button>
              <button
                onClick={() => rotateAllInAllFiles('ccw')}
                id="btn-global-ccw"
                className="px-2.5 py-1 bg-white hover:bg-slate-55 dark:bg-slate-905 dark:hover:bg-slate-850 hover:shadow-xs text-slate-705 dark:text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                title="Rotate ALL pages in ALL documents counter-clockwise by 90 degrees"
              >
                <RotateCcw className="w-3 h-3 text-sky-505" /> -90° All
              </button>
              <button
                onClick={resetAllRotations}
                id="btn-global-reset"
                className="p-1 px-2 hover:bg-rose-500/10 text-rose-500 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                title="Reset all rotations on all pages"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Dropzone */}
        <div className="mb-6">
          <Dropzone
            id="rotate-dropzone"
            onFilesSelected={handleFilesSelected}
            multiple={true}
            title={files.length > 0 ? "Add more PDFs to batch" : "Upload one or many PDFs to rotate"}
            description="Upload documents to adjust paper layouts. Processing occurs safe inside your browser."
          />
        </div>

        {/* Loading status */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-sky-500/5 border border-sky-500/10 flex items-center gap-4 text-sm text-slate-750 dark:text-slate-305">
            <Loader2 className="w-5 h-5 text-sky-500 animate-spin shrink-0" />
            <span>{statusText || 'Analyzing document layouts...'}</span>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">Successfully Saved!</span>{' '}
                {files.length > 1
                  ? 'Your processed batch ZIP package is ready and downloaded.'
                  : 'Your adjusted printable PDF has been generated and downloaded.'}
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-rotate-reset"
              className="px-3 py-1.5 bg-slate-105 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        )}

        {/* Interactive workspace */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            
            {/* Left Box: Batch File Navigator (4/12 col) */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase select-none">
                Batch Registry ({files.length})
              </h3>
              
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {files.map((file) => {
                  const active = file.id === selectedFileId;
                  const modified = isDocModified(file.id);

                  return (
                    <div
                      key={file.id}
                      onClick={() => inspectFileDetails(file)}
                      id={`file-nav-row-${file.id}`}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                        active
                          ? 'bg-sky-500/5 border-sky-400 dark:border-sky-500 text-sky-950 dark:text-sky-200 shadow-xs'
                          : 'bg-slate-50/40 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {/* Miniature thumbnail */}
                      {file.previews.length > 0 ? (
                        <div className="relative shrink-0">
                          <img
                            src={file.previews[0]}
                            alt="thumb"
                            referrerPolicy="no-referrer"
                            className="w-8 h-11 object-cover rounded border border-slate-200/50 dark:border-slate-800 bg-white"
                          />
                          {modified && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-sky-500 border border-white dark:border-slate-900 rounded-full" />
                          )}
                        </div>
                      ) : (
                        <div className="w-8 h-11 flex items-center justify-center bg-slate-100 dark:bg-slate-805 rounded border shrink-0 text-slate-400">
                          <FileCode className="w-4 h-4" />
                        </div>
                      )}

                      {/* File Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate pr-2 font-sans">
                          {file.name}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-550 mt-0.5">
                          {formatSize(file.size)} • {file.pageCount} p
                        </p>
                      </div>

                      {/* Right Indicator badge or navigation marker */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {modified && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 rounded-md">
                            Adjusted
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(file.id);
                          }}
                          id={`btn-remove-from-batch-${file.id}`}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${active ? 'translate-x-0.5 text-sky-500' : ''}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Box: Page Layout Canvas (8/12 col) */}
            <div className="lg:col-span-8 flex flex-col space-y-3">
              {activeFile ? (
                <div className="space-y-4">
                  
                  {/* Detailed File specific control bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-500" />
                      <span className="text-xs font-bold font-mono text-slate-500 uppercase truncate max-w-xs sm:max-w-md">
                        {activeFile.name} pages customization
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => rotateAllInFile(activeFile.id, 'cw')}
                        id={`btn-file-cw-${activeFile.id}`}
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCw className="w-3 h-3" /> Rotate File CW
                      </button>
                      <button
                        onClick={() => rotateAllInFile(activeFile.id, 'ccw')}
                        id={`btn-file-ccw-${activeFile.id}`}
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Rotate File CCW
                      </button>
                      <button
                        onClick={() => resetFileRotations(activeFile.id)}
                        id={`btn-file-reset-${activeFile.id}`}
                        className="px-2 py-1 text-rose-500 hover:bg-rose-500/10 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Undo className="w-3.5 h-3.5" /> Clear file
                      </button>
                    </div>
                  </div>

                  {/* Thumbnail editor grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800/60 max-h-[380px] overflow-y-auto">
                    {Array.from({ length: activeFile.pageCount }).map((_, index) => {
                      const fileRotations = rotations[activeFile.id] || {};
                      const rotation = fileRotations[index] || 0;
                      const matchesLoadedThumbnail = index < activeFile.previews.length;
                      const thumb = matchesLoadedThumbnail ? activeFile.previews[index] : null;

                      return (
                        <div
                          key={index}
                          id={`rotate-card-box-${activeFile.id}-${index}`}
                          className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-xl p-2.5 shadow-xs flex flex-col justify-between group hover:shadow-sm transition-all text-center relative"
                        >
                          {/* Page Image Frame */}
                          <div className="relative aspect-[3/4] bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100/50 flex items-center justify-center overflow-hidden mb-2">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={`Page ${index + 1}`}
                                style={{ transform: `rotate(${rotation}deg)` }}
                                className="w-full h-full object-contain transition-transform duration-300 pointer-events-none select-none bg-white font-sans text-[8px] flex items-center text-center justify-center text-slate-450"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="text-slate-405 font-bold text-[10px] select-none font-mono">
                                Thumbnail {index + 1}
                              </div>
                            )}
                            
                            {/* Visual indicator of page number & rotation angle */}
                            <span className="absolute bottom-1.5 left-1.5 px-1 py-0.5 bg-slate-900/80 text-white rounded font-mono text-[9px] font-bold">
                              P. {index + 1}
                            </span>

                            {rotation !== 0 && (
                              <span className="absolute top-1.5 right-1.5 px-1 py-0.5 bg-sky-600 text-white text-[9px] font-semibold font-mono rounded shadow-xs">
                                {rotation}°
                              </span>
                            )}
                          </div>

                          {/* Rotation buttons */}
                          <div className="flex gap-1 justify-center shrink-0">
                            <button
                              onClick={() => rotatePage(activeFile.id, index, 'ccw')}
                              id={`btn-rotate-ccw-${activeFile.id}-${index}`}
                              className="p-1 px-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-150 dark:border-slate-750/30 rounded text-slate-500 dark:text-slate-350 cursor-pointer"
                              title="Rotate 90 degrees CCW"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => rotatePage(activeFile.id, index, 'cw')}
                              id={`btn-rotate-cw-${activeFile.id}-${index}`}
                              className="p-1 px-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-150 dark:border-slate-750/30 rounded text-slate-500 dark:text-slate-350 cursor-pointer"
                              title="Rotate 90 degrees CW"
                            >
                              <RotateCw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center text-slate-400 select-none py-16">
                  <Info className="w-8 h-8 text-slate-350 mb-2" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-450">
                    No Document Selected
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload documents or select one from the batch navigator list.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Global actions row */}
        {files.length > 0 && (
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-4 rounded-xl mt-6">
            <button
              onClick={resetTool}
              id="btn-rotate-clear-all-workspace"
              className="text-xs font-bold text-rose-500 hover:text-rose-600 cursor-pointer transition-colors"
            >
              Clear Workspace
            </button>

            <button
              onClick={handleApplyRotations}
              disabled={loading}
              id="btn-rotate-submit"
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {files.length > 1
                ? `Apply Rotations & Download ZIP (${files.length} PDFs)`
                : 'Apply Rotations & Download PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
