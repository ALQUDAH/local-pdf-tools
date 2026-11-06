/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Download, Loader2, RefreshCw } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, renderAllPdfPages, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface ImgConvertToolProps {
  onBack: () => void;
}

export default function ImgConvertTool({ onBack }: ImgConvertToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Rendered high quality JPEG URLs
  const [images, setImages] = useState<string[]>([]);
  const [renderedProgress, setRenderedProgress] = useState({ current: 0, total: 0 });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setStatusText('Loading PDF elements into memory...');
    setSuccess(false);
    setImages([]);

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

      // Immediately kick off high-quality rendering of ALL pages
      setLoading(true);
      setStatusText('Rendering all pages to high resolution images...');
      setRenderedProgress({ current: 0, total: pageCount });

      const renderedImages = await renderAllPdfPages(arrayBuffer, (current, total) => {
        setRenderedProgress({ current, total });
      });

      setImages(renderedImages);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Error rendering PDF. High security PDFs or invalid structures might fail.');
      setFile(null);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleDownloadSingleImage = (imgUrl: string, pageNum: number) => {
    if (!file) return;
    const baseName = file.name.replace(/\.pdf$/i, '');
    const filename = `${baseName}_page_${pageNum}.jpg`;
    downloadFile(imgUrl, filename, 'image/jpeg');
  };

  const downloadAllImages = async () => {
    if (images.length === 0) return;
    
    // Download sequentially with short offsets to bypass browser popup blocks
    for (let i = 0; i < images.length; i++) {
      const delay = i * 200; // 200ms spacing
      setTimeout(() => {
        handleDownloadSingleImage(images[i], i + 1);
      }, delay);
    }
  };

  const resetTool = () => {
    setFile(null);
    setImages([]);
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-image-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold">
          100% Client-Side
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Convert PDF to Images</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Extract every sheet of a PDF into high-resolution JPG images. Perfect for presentations or web formatting.
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="imgconvert-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title="Upload PDF to render images"
              description="Upload a document to extract full-page 2.0x scale raster assets."
            />
          </div>
        )}

        {/* Loading Tracker with explicit progress */}
        {loading && (
          <div className="mb-6 p-5 rounded-xl bg-violet-500/5 border border-violet-500/10 space-y-3">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <Loader2 className="w-5 h-5 text-violet-500 animate-spin shrink-0" />
              <span>{statusText || 'Rendering canvases...'}</span>
            </div>
            {renderedProgress.total > 0 && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Converting sheets</span>
                  <span>{renderedProgress.current} of {renderedProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${(renderedProgress.current / renderedProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success Header */}
        {success && images.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-semibold">Conversion Complete!</span> Generated {images.length} High-Resolution JPG page elements.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadAllImages}
                id="btn-images-download-all"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download All Pages
              </button>
              <button
                onClick={resetTool}
                id="btn-images-reset"
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs transition-colors font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
        )}

        {/* Live Grid of Extract Results */}
        {images.length > 0 && file && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-3 mb-2 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-violet-500" />
                <span className="text-xs font-bold font-mono text-slate-400 uppercase truncate max-w-xs sm:max-w-md">
                  {file.name} ({formatSize(file.size)})
                </span>
              </div>
              <span className="text-xs text-slate-500 font-semibold">{images.length} images ready</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 p-4 bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800/60 max-h-[600px] overflow-y-auto">
              {images.map((imgSrc, index) => (
                <div
                  key={index}
                  id={`image-card-box-${index}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl overflow-hidden p-3 relative group shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="relative aspect-[3/4] rounded bg-slate-100 overflow-hidden shadow-inner border border-slate-100/50">
                    <img
                      src={imgSrc}
                      alt={`Converted Page ${index + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-slate-900/80 text-white rounded font-mono text-[10px] uppercase font-bold select-none">
                      Page {index + 1}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadSingleImage(imgSrc, index + 1)}
                    id={`btn-download-single-${index + 1}`}
                    className="mt-3 w-full py-1.5 bg-slate-100 hover:bg-violet-600 dark:bg-slate-850 hover:text-white text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download JPG
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && images.length === 0 && (
          <div className="text-center py-12 text-slate-400 dark:text-slate-600">
            Select a PDF document. High-resolution rasterization is done entirely using local canvas engines.
          </div>
        )}
      </div>
    </div>
  );
}
