/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  Loader2, 
  RefreshCw, 
  Trash2, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  FileCode,
  Files,
  Settings,
  AlertCircle,
  FolderArchive,
  Play,
  Check,
  Sparkles,
  Info
} from 'lucide-react';
import { fileToArrayBuffer } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import JSZip from 'jszip';

import { tr } from '../i18n';
interface BatchConverterToolProps {
  onBack: () => void;
}

interface BatchFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string; // 'pdf' | 'image'
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  progress?: number; // 0 to 100
  thumbnail?: string; // canvas preview data URL
  convertedFiles?: {
    name: string;
    blob: Blob;
    dataUrl?: string; // for downloading or displaying
  }[];
}

type OutputFormat = 'pdf' | 'jpg' | 'png';

export default function BatchConverterTool({ onBack }: BatchConverterToolProps) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('pdf');
  const [quality, setQuality] = useState<number>(0.9); // for JPEG
  const [scale, setScale] = useState<number>(1.5); // for PDF to image rendering resolution
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [zipLoading, setZipLoading] = useState<boolean>(false);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  // Extract a preview for the file
  const generateFilePreview = async (file: File, type: 'pdf' | 'image'): Promise<string | undefined> => {
    try {
      if (type === 'image') {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Resize to max 90px wide or high
                const maxDim = 90;
                let w = img.width;
                let h = img.height;
                if (w > h) {
                  if (w > maxDim) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                  }
                } else {
                  if (h > maxDim) {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                  }
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
              } else {
                resolve(undefined);
              }
            };
            img.onerror = () => resolve(undefined);
            img.src = e.target?.result as string;
          };
          reader.onerror = () => resolve(undefined);
          reader.readAsDataURL(file);
        });
      } else {
        // PDF Preview
        const arrayBuffer = await fileToArrayBuffer(file);
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          return canvas.toDataURL('image/jpeg', 0.5);
        }
      }
    } catch (e) {
      console.error('Failed to generate thumbnail preview for file:', file.name, e);
    }
    return undefined;
  };

  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setErrorMessage(null);

    const newFiles: BatchFile[] = [];

    for (const f of selectedFiles) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const isImg = f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name);
      
      if (!isPdf && !isImg) {
        continue;
      }

      const fileType = isPdf ? 'pdf' : 'image';
      const id = Math.random().toString(36).substring(2, 9);
      
      // Add immediately with 'pending' status
      const item: BatchFile = {
        id,
        file: f,
        name: f.name,
        size: f.size,
        type: fileType,
        status: 'pending',
        progress: 0
      };
      
      newFiles.push(item);
    }

    setFiles(prev => [...prev, ...newFiles]);

    // Lazy load the thumbnails after showing them
    for (const item of newFiles) {
      const thumbnailVal = await generateFilePreview(item.file, item.type as 'pdf' | 'image');
      if (thumbnailVal) {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, thumbnail: thumbnailVal } : f));
      }
    }
  };

  const removeFile = (id: string) => {
    if (isProcessing) return;
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    if (isProcessing) return;
    setFiles([]);
    setSuccessCount(0);
    setErrorMessage(null);
  };

  // Draw any image onto a canvas to normalize it to standard RGB raw pixel format
  const normalizeImageToBlob = (file: File, format: 'image/jpeg' | 'image/png', imgQuality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas normalization failed.'));
            }, format, format === 'image/jpeg' ? imgQuality : undefined);
          } else {
            reject(new Error('Cannot create 2d rendering context.'));
          }
        };
        img.onerror = () => reject(new Error('Failed to load image into memory.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (item: BatchFile, index: number, total: number): Promise<BatchFile> => {
    // Return updated config
    const arrayBuffer = await fileToArrayBuffer(item.file);
    const results: { name: string; blob: Blob; dataUrl?: string }[] = [];

    const baseName = item.name.replace(/\.[^/.]+$/, ""); // keep name without extension

    if (targetFormat === 'pdf') {
      if (item.type === 'pdf') {
        // PDF to PDF: Simple Copy / pass-through
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        results.push({
          name: `${baseName}.pdf`,
          blob,
          dataUrl: URL.createObjectURL(blob)
        });
      } else {
        // Image to PDF: Wrap image in single page PDF
        // Normalize image to jpeg first
        const normalizedBlob = await normalizeImageToBlob(item.file, 'image/jpeg', 0.95);
        const imageBuffer = await normalizedBlob.arrayBuffer();

        const pdfDoc = await PDFDocument.create();
        const embeddedImg = await pdfDoc.embedJpg(imageBuffer);
        const { width, height } = embeddedImg.scale(1.0);
        
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width,
          height
        });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        results.push({
          name: `${baseName}.pdf`,
          blob,
          dataUrl: URL.createObjectURL(blob)
        });
      }
    } else {
      // Converting to JPG or PNG
      const targetMimeType = targetFormat === 'png' ? 'image/png' : 'image/jpeg';
      const fileExt = targetFormat;

      if (item.type === 'pdf') {
        // PDF to Images: Render ALL pages
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdfDoc = await loadingTask.promise;
        const pageCount = pdfDoc.numPages;

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          setFiles(prev => prev.map(f => f.id === item.id ? { 
            ...f, 
            progress: Math.round((pageNum / pageCount) * 100) 
          } : f));

          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            
            const dataUrl = canvas.toDataURL(targetMimeType, targetFormat === 'jpg' ? quality : undefined);
            
            // Convert dataUrl to blob
            const res = await fetch(dataUrl);
            const blob = await res.blob();

            results.push({
              name: pageCount === 1 ? `${baseName}.${fileExt}` : `${baseName}_page_${pageNum}.${fileExt}`,
              blob,
              dataUrl
            });
          }
        }
      } else {
        // Image to Image conversion: Convert uploaded image (PNG, WEBP, etc.) to JPG / PNG
        const normalizedBlob = await normalizeImageToBlob(item.file, targetMimeType, quality);
        const dataUrl = URL.createObjectURL(normalizedBlob);

        results.push({
          name: `${baseName}.${fileExt}`,
          blob: normalizedBlob,
          dataUrl
        });
      }
    }

    return {
      ...item,
      status: 'success',
      progress: 100,
      convertedFiles: results
    };
  };

  const handleConvertAll = async () => {
    if (files.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setSuccessCount(0);
    setErrorMessage(null);

    // Reset old conversion results
    setFiles(prev => prev.map(f => ({ 
      ...f, 
      status: 'pending', 
      progress: 0, 
      convertedFiles: undefined, 
      errorMessage: undefined 
    })));

    let successes = 0;

    for (let i = 0; i < files.length; i++) {
      const activeFile = files[i];
      
      // Update status to processing
      setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, status: 'processing', progress: 5 } : f));

      try {
        const processedFile = await processFile(activeFile, i, files.length);
        setFiles(prev => prev.map(f => f.id === activeFile.id ? processedFile : f));
        successes++;
        setSuccessCount(successes);
      } catch (err: any) {
        console.error('Failed to convert file:', activeFile.name, err);
        setFiles(prev => prev.map(f => f.id === activeFile.id ? { 
          ...f, 
          status: 'error', 
          errorMessage: err?.message || 'Unsupported format or corrupted file structure.' 
        } : f));
      }
    }

    setIsProcessing(false);
  };

  const handleDownloadSingle = (convertedItem: { name: string; blob: Blob; dataUrl?: string }) => {
    const url = convertedItem.dataUrl || URL.createObjectURL(convertedItem.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = convertedItem.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadZip = async () => {
    if (files.length === 0 || zipLoading) return;
    setZipLoading(true);

    try {
      const zip = new JSZip();
      let totalAdded = 0;

      files.forEach(f => {
        if (f.status === 'success' && f.convertedFiles) {
          f.convertedFiles.forEach(cf => {
            zip.file(cf.name, cf.blob);
            totalAdded++;
          });
        }
      });

      if (totalAdded === 0) {
        alert(tr("No converted files ready to download."));
        setZipLoading(false);
        return;
      }

      const zipFileContent = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipFileContent);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `pdf_converter_batch_all_${targetFormat.toUpperCase()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to generate ZIP compilation. Individual downloads remain accessible."));
    } finally {
      setZipLoading(false);
    }
  };

  const isAnySuccess = files.some(f => f.status === 'success');

  return (
    <div className="space-y-6">
      {/* Header and Back navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-batch-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-violet-600/10 text-violet-600 dark:text-violet-400 rounded-full font-bold flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-violet-500 animate-pulse" /> {tr("Dual Engines Enabled")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left main work space (Files uploaded & conversion list) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
                  {tr("High-Speed Batch Converter")}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {tr("Upload multiple PDF documents or heavy images and convert them standardly in bulk instantly.")}
                </p>
              </div>
              {files.length > 0 && (
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="text-xs font-semibold py-1.5 px-3 border border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-600 dark:text-slate-400 rounded-xl transition-all cursor-pointer disabled:opacity-40"
                >
                  {tr("Clear Queue")}
                </button>
              )}
            </div>

            {/* Dropzone */}
            <Dropzone
              id="batchconvert-dropzone"
              onFilesSelected={handleFilesSelected}
              multiple={true}
              title={tr("Add PDF or Image files to convert in batch")}
              description={tr("Supports PDF, PNG, JPG, JPEG, and WEBP files")}
            />

            {/* Render queue table / files details list */}
            {files.length > 0 && (
              <div className="mt-6 border border-slate-100 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-2xs">
                <div className="bg-slate-50/50 dark:bg-slate-950/40 px-5 py-3 border-b border-slate-105 dark:border-slate-850/60 flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Files className="w-4 h-4 text-slate-400" /> {tr("Convert Queue (")}{files.length} {tr("Files)")}
                  </span>
                  {successCount > 0 && (
                    <span className="text-xs px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-semibold">
                      {successCount} / {files.length} {tr("Converted")}
                    </span>
                  )}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
                  {files.map((file) => (
                    <div 
                      key={file.id} 
                      className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                        file.status === 'processing' 
                          ? 'bg-violet-500/5 dark:bg-violet-500/10' 
                          : file.status === 'success' 
                            ? 'bg-emerald-500/5 dark:bg-emerald-550/5' 
                            : 'hover:bg-slate-50/20 dark:hover:bg-slate-950/20'
                      }`}
                    >
                      {/* Left: Thumbnail and filename info */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="relative w-12 h-14 bg-slate-100 dark:bg-slate-950 border border-slate-201 dark:border-slate-850 rounded-lg overflow-hidden shrink-0 shadow-inner flex items-center justify-center">
                          {file.thumbnail ? (
                            <img 
                              src={file.thumbnail} 
                              alt={tr("preview")} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : file.type === 'pdf' ? (
                            <FileText className="w-6 h-6 text-red-400" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-blue-400" />
                          )}
                          <div className="absolute top-0 left-0 text-[8px] font-mono px-1 py-0.2 bg-slate-900/70 text-white rounded-br font-bold uppercase">
                            {file.type}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 
                            className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" 
                            title={file.name}
                          >
                            {file.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                            {formatSize(file.size)}
                          </span>

                          {/* Render processing error banner if occurred */}
                          {file.status === 'error' && (
                            <p className="text-[10px] text-rose-500 font-medium mt-1 select-none flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {file.errorMessage || tr("Conversion failed.")}
                            </p>
                          )}

                          {/* Render active progress bar if processing */}
                          {file.status === 'processing' && (
                            <div className="w-full max-w-[180px] mt-1 space-y-1">
                              <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-violet-500 transition-all duration-300" 
                                  style={{ width: `${file.progress || 10}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions, badges, and output results */}
                      <div className="flex sm:flex-col items-end gap-2.5 shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
                        {/* Status Check badge */}
                        <div className="flex items-center gap-2">
                          {file.status === 'pending' && (
                            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              {tr("Pending")}
                            </span>
                          )}
                          {file.status === 'processing' && (
                            <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> {tr("Processing")}
                            </span>
                          )}
                          {file.status === 'success' && (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> {tr("Output Ready")}
                            </span>
                          )}
                          {file.status === 'error' && (
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full">
                              {tr("Failed")}
                            </span>
                          )}
                        </div>

                        {/* File Action control: Download single converted items */}
                        {file.status === 'success' && file.convertedFiles && (
                          <div className="flex flex-wrap gap-1.5">
                            {file.convertedFiles.map((cf, cIdx) => (
                              <button
                                key={cIdx}
                                onClick={() => handleDownloadSingle(cf)}
                                className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-amber-500 dark:hover:border-amber-400 hover:text-amber-600 px-2 py-1 transition-all flex items-center gap-1 cursor-pointer"
                                title={tr("Download: {0}", cf.name)}
                              >
                                <Download className="w-2.5 h-2.5" /> {tr("Download")} {file.convertedFiles!.length > 1 ? `P.${cIdx + 1}` : cf.name.split('.').pop()?.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Remove file button */}
                        {file.status !== 'processing' && !isProcessing && (
                          <button
                            onClick={() => removeFile(file.id)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 text-slate-400 rounded-lg transition-colors cursor-pointer self-end"
                            title={tr("Remove from queue")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isProcessing && files.length === 0 && (
              <div className="text-center py-16 text-slate-400 dark:text-slate-600 flex flex-col items-center">
                <FileCode className="w-12 h-12 text-slate-200 dark:text-slate-800 mb-3 animate-pulse" />
                <p className="text-sm">{tr("Queue is empty. Select multiple digital assets to convert above.")}</p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center text-[11px] font-mono text-slate-500 max-w-sm">
                  <span className="px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-850">{tr("PDF to JPG")}</span>
                  <span className="px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-850">{tr("PDF to PNG")}</span>
                  <span className="px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-850">{tr("Images to PDF")}</span>
                  <span className="px-2 py-1 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-850">{tr("WEBP to JPEG")}</span>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right side options panel (Settings & execute conversions) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-6 text-left">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <Settings className="w-4.5 h-4.5 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">
                {tr("Compilation Settings")}
              </h3>
            </div>

            {/* Target format selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold font-mono text-slate-400 uppercase">
                {tr("Target Output Format")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['pdf', 'jpg', 'png'] as OutputFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setTargetFormat(fmt)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      targetFormat === fmt
                        ? 'border-violet-500 bg-violet-500/5 text-violet-600 dark:text-violet-400'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 hover:bg-slate-50/50 dark:hover:bg-slate-950 text-slate-600 dark:text-slate-450'
                    }`}
                  >
                    <span className="uppercase text-sm">{fmt}</span>
                    <span className="text-[9px] font-normal opacity-70">
                      {fmt === 'pdf' ? tr("Vector") : tr("Raster")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Format-specific details options */}
            {targetFormat === 'jpg' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold font-mono text-slate-400 uppercase">
                  <span>{tr("JPEG Compression")}</span>
                  <span className="text-slate-650 dark:text-slate-350">{Math.round(quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.0"
                  step="0.05"
                  value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value) || 0.9)}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-650"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{tr("Balanced")}</span>
                  <span>{tr("Max Quality")}</span>
                </div>
              </div>
            )}

            {/* PDF rendering options (PDF to JPG/PNG scale factor) */}
            {(targetFormat === 'jpg' || targetFormat === 'png') && (
              <div className="space-y-3">
                <label className="block text-xs font-bold font-mono text-slate-400 uppercase">
                  {tr("PDF Page Render Scale")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1.0, 1.5, 2.0].map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setScale(sc)}
                      className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        scale === sc
                          ? 'border-violet-500 bg-violet-505/10 text-violet-600 dark:text-violet-450'
                          : 'border-slate-202 dark:border-slate-850 hover:border-slate-300 hover:bg-slate-50/40 dark:hover:bg-slate-950 text-slate-500'
                      }`}
                    >
                      {sc === 1.0 ? tr("1.0x (Web)") : sc === 1.5 ? tr("1.5x (Crisp)") : tr("2.0x (Print)")}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {tr("Adjusting the output scale factor controls visual density and resultant file sizes. 1.5x scale balances speed with extreme legibility.")}
                </p>
              </div>
            )}

            {/* Info tips based on configurations */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-101 dark:border-slate-852/40 flex gap-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <Info className="w-5 h-5 text-violet-500 shrink-0" />
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">{tr("Bulk Conversion Tips")}</span>
                {targetFormat === 'pdf' ? (
                  <span>{tr("Images automatically wrap into beautiful standalone single-page PDFs. Uploaded PDF elements are formatted as native pass-through vectors.")}</span>
                ) : (
                  <span>{tr("Unpacks multi-page PDFs page by page into a flat series of high-quality `.")} {targetFormat}{tr("` image assets. Perfect for web publication.")}</span>
                )}
              </div>
            </div>

            {/* Batch Action and compiled results download panel */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-805">
              <button
                type="button"
                onClick={handleConvertAll}
                disabled={isProcessing || files.length === 0}
                className="w-full py-3 px-5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-50 text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-inner"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    {tr("Converting")} {successCount} / {files.length}...
                  </>
                ) : (
                  <>
                    <Play className="w-4.5 h-4.5 fill-current" />
                    {tr("Convert all queue")}
                  </>
                )}
              </button>

              {isAnySuccess && (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={zipLoading || isProcessing}
                  className="w-full py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-md disabled:opacity-40 cursor-pointer"
                >
                  {zipLoading ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      {tr("Bundling Zip archive...")}
                    </>
                  ) : (
                    <>
                      <FolderArchive className="w-4.5 h-4.5" />
                      {tr("Download all as ZIP")}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Success summary overlay elements if completed */}
            {successCount === files.length && files.length > 0 && !isProcessing && (
              <div className="p-3.5 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 rounded-2xl border border-emerald-500/10 text-center text-xs font-semibold flex items-center justify-center gap-2 animate-bounce">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{tr("Bulk Conversion Successful!")}</span>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
