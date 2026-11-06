/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Sliders, Play, Loader2, RefreshCw, Sparkles, Download, Percent } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, compressPdfLocal, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface CompressToolProps {
  onBack: () => void;
}

type CompTier = 'extreme' | 'normal' | 'light' | 'custom';

export default function CompressTool({ onBack }: CompressToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Progress tracker
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Settings
  const [tier, setTier] = useState<CompTier>('normal');
  const [quality, setQuality] = useState(60); // % 10 to 100
  const [scaleFactor, setScaleFactor] = useState(85); // % 50 to 100

  // Result stats
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);

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
      const { pageCount } = await getPdfDetails(arrayBuffer, 0);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews: [],
      });
      setOriginalSize(sourceFile.size);
    } catch (err) {
      console.error(err);
      alert('Error parsing source PDF details.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompress = async () => {
    if (!file) return;
    setLoading(true);
    setSuccess(false);
    setProgress({ current: 0, total: file.pageCount });

    let compQuality = 0.6;
    let compScale = 0.85;

    if (tier === 'extreme') {
      compQuality = 0.3;
      compScale = 0.6;
    } else if (tier === 'light') {
      compQuality = 0.85;
      compScale = 1.0;
    } else if (tier === 'custom') {
      compQuality = quality / 100;
      compScale = scaleFactor / 100;
    }

    try {
      const optimizedBytes = await compressPdfLocal(
        file.arrayBuffer,
        compQuality,
        compScale,
        (current, total) => {
          setProgress({ current, total });
        }
      );

      setCompressedSize(optimizedBytes.length);

      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_compressed.pdf`;
      
      downloadFile(optimizedBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Local in-canvas compression error. Secure or corrupt files might block conversion.');
    } finally {
      setLoading(false);
    }
  };

  const savingsPercent = originalSize > 0 && compressedSize > 0
    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
    : 0;

  const resetTool = () => {
    setFile(null);
    setSuccess(false);
    setCompressedSize(0);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-compress-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-105 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-full font-semibold">
          WebAssembly Canvas Rendering
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Compress PDF Size</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Significantly optimize file dimensions client-side. Convert embedded visual blobs into compressed raster structures.
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="compress-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title="Upload PDF to compress"
              description="Drop document to optimize space footprint locally in-memory."
            />
          </div>
        )}

        {/* Loading Progress Bar */}
        {loading && (
          <div className="mb-6 p-5 rounded-xl bg-teal-500/5 border border-teal-500/10 space-y-3">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <Loader2 className="w-5 h-5 text-teal-500 animate-spin shrink-0" />
              <span>Optimizing pages and rasterizing vectors...</span>
            </div>
            {progress.total > 0 && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Re-drawing canvases</span>
                  <span>{progress.current} of {progress.total}</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compression statistics comparison after download */}
        {success && compressedSize > 0 && (
          <div className="mb-8 p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-slate-800 dark:text-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>Successfully Optimized! Converted file immediately saved to device download queue.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-white dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-850">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Original Size</p>
                <p className="text-xl font-bold font-mono text-slate-600 dark:text-slate-300 mt-1">{formatSize(originalSize)}</p>
              </div>
              <div className="p-4 bg-white dark:bg-slate-950 rounded-xl border border-slate-105 dark:border-slate-850">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Compressed Size</p>
                <p className="text-xl font-bold font-mono text-emerald-500 dark:text-emerald-400 mt-1">{formatSize(compressedSize)}</p>
              </div>
              <div className="p-4 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-500/20 flex flex-col items-center justify-center">
                <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-500">Space Saved</p>
                <div className="flex items-center gap-1 mt-1 text-2xl font-black">
                  <Percent className="w-5 h-5" /> {savingsPercent}%
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={resetTool}
                id="btn-compress-reset"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Compress Another File
              </button>
            </div>
          </div>
        )}

        {/* Configuration views when document loaded */}
        {file && !success && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            {/* Left page configuration info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <FileCode className="w-3.5 h-3.5" />
                <span>Source Document</span>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl space-y-4">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-semibold">
                    Original Footprint: <strong>{formatSize(file.size)}</strong>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                    Total Sheets: <strong>{file.pageCount} pages</strong>
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-850 flex justify-end">
                  <button
                    onClick={resetTool}
                    id="btn-compress-change-file"
                    className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Compression presets list */}
              <div className="space-y-3">
                <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  Compression Preset Options
                </span>

                <div className="space-y-2.5">
                  {[
                    {
                      id: 'extreme',
                      title: 'Extreme Compression',
                      desc: 'Lowest visual image quality, minor page scaling. Drastic file footprint reduction.',
                      badge: 'Max Savings',
                    },
                    {
                      id: 'normal',
                      title: 'Recommended Compression',
                      desc: 'Ideal balanced properties. Good image resolution factor with decent byte contraction.',
                      badge: 'Balanced',
                    },
                    {
                      id: 'light',
                      title: 'Light Compression',
                      desc: 'Crisp image rendering outputs, removes structural redundancies. Minor byte savings.',
                      badge: 'High Quality',
                    },
                    {
                      id: 'custom',
                      title: 'Custom Optimization Tuning',
                      desc: 'Adjust fine quality ranges and page dimension coordinates manually.',
                      badge: 'Custom',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTier(preset.id as CompTier)}
                      id={`btn-tier-${preset.id}`}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-start gap-4 ${
                        tier === preset.id
                          ? 'border-teal-500 bg-teal-500/5 text-teal-900 dark:text-teal-200 shadow-sm'
                          : 'border-slate-200 dark:border-slate-805 text-slate-700 dark:text-slate-450 bg-white dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-850'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="block text-sm font-bold">{preset.title}</span>
                        <span className="block text-xs text-slate-450 dark:text-slate-400 mt-1 leading-relaxed">
                          {preset.desc}
                        </span>
                      </div>
                      <span className="text-[10px] shrink-0 font-bold px-2 py-0.5 rounded bg-slate-205 dark:bg-slate-800 text-slate-500">
                        {preset.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom tuning parameters if custom selected */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <Sliders className="w-3.5 h-3.5" />
                <span>Optimization Levels</span>
              </div>

              <div className="space-y-5">
                {tier === 'custom' ? (
                  <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5 bg-slate-50/50 dark:bg-slate-950/20">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                        <label htmlFor="compress-quality-slider">Image Quality Factor</label>
                        <span className="font-mono text-teal-600">{quality}%</span>
                      </div>
                      <input
                        type="range"
                        id="compress-quality-slider"
                        min={10}
                        max={100}
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value) || 60)}
                        className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none dark:bg-slate-850"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                        <label htmlFor="compress-scale-slider">Page Dimension Scaling</label>
                        <span className="font-mono text-teal-600">{scaleFactor}%</span>
                      </div>
                      <input
                        type="range"
                        id="compress-scale-slider"
                        min={40}
                        max={100}
                        value={scaleFactor}
                        onChange={(e) => setScaleFactor(parseInt(e.target.value) || 85)}
                        className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none dark:bg-slate-850"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-955 text-xs text-slate-400 dark:text-slate-500 border leading-relaxed flex gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {tier === 'extreme' && 'Current setup: Redraws all elements with 30% image resolution compression factor, scaled down to 60% coordinates.'}
                      {tier === 'normal' && 'Current setup: Redraws all elements with 60% image resolution compression factor, scaled down to 85% coordinates.'}
                      {tier === 'light' && 'Current setup: Redraws all elements matching exact original dimensions with 85% image resolution compression factor.'}
                    </span>
                  </div>
                )}

                <button
                  onClick={handleCompress}
                  disabled={loading}
                  id="btn-compress-submit"
                  className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                  Run In-Browser Compression
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
