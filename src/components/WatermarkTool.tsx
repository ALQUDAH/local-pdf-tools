import React, { useState, FormEvent, useEffect } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Sliders, Play, Loader2, RefreshCw, Type, Grid, Square, Compass, Edit3, Maximize, FileText } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, addWatermarkToPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

import { tr } from '../i18n';
interface WatermarkToolProps {
  onBack: () => void;
}

type WatermarkLayout = 'center' | 'diagonal' | 'grid' | 'custom';

export default function WatermarkTool({ onBack }: WatermarkToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  // Watermark parameters
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [rotation, setRotation] = useState(45); // degrees
  const [opacity, setOpacity] = useState(0.2); // 0.1 to 1.0
  const [color, setColor] = useState('#EF4444'); // Red default
  const [layout, setLayout] = useState<WatermarkLayout>('diagonal');
  const [customX, setCustomX] = useState(0.5); // percentage
  const [customY, setCustomY] = useState(0.5); // percentage

  // Drag logic
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const sheet = document.getElementById('watermark-preview-sheet');
      if (!sheet) return;
      const rect = sheet.getBoundingClientRect();
      
      const dx = e.clientX - dragStart.clientX;
      const dy = e.clientY - dragStart.clientY;
      
      const pxOffset = customX * rect.width + dx;
      const pyOffset = customY * rect.height + dy;
      
      if (layout !== 'custom') setLayout('custom');
      
      setCustomX(Math.max(0, Math.min(1, pxOffset / rect.width)));
      setCustomY(Math.max(0, Math.min(1, pyOffset / rect.height)));
      
      setDragStart(prev => ({ ...prev, clientX: e.clientX, clientY: e.clientY }));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, customX, customY, layout]);

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
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 20);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      setPreviewPageIndex(0);
    } catch (err) {
      console.error(err);
      alert(tr("Error parsing PDF content attributes."));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (!text.trim()) {
      alert(tr("Please enter some text for the watermark."));
      return;
    }
    setLoading(true);
    setSuccess(false);

    try {
      const compiledBytes = await addWatermarkToPdf(file.arrayBuffer, {
        text,
        fontSize,
        rotation,
        opacity,
        color,
        layout,
        customX,
        customY,
      });

      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_watermarked.pdf`;
      
      downloadFile(compiledBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to stamp watermark to PDF."));
    } finally {
      setLoading(false);
    }
  };

  const resetTool = () => {
    setFile(null);
    setSuccess(false);
  };

  const getWatermarkPreviewStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      color: color,
      opacity: opacity,
      fontSize: `${Math.max(10, fontSize * 0.4)}px`,
      fontWeight: 'bold',
      whiteSpace: 'nowrap',
      transition: isDragging ? 'none' : 'all 0.15s ease-out',
      cursor: 'move',
      userSelect: 'none',
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    };

    if (layout === 'center' || layout === 'diagonal') {
      base.top = '50%';
      base.left = '50%';
    } else if (layout === 'custom') {
      base.left = `${customX * 100}%`;
      base.top = `${customY * 100}%`;
    }
    return base;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-watermark-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-105 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-full font-semibold">
          {tr("Local Watermark Engine")}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{tr("Watermark PDF")}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Overprint customized text labels with adjustable angles, colors, and repeating grid layers. Drag to position.")}
          </p>
        </div>

        {!file && (
          <div className="mb-6">
            <Dropzone
              id="watermark-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title={tr("Upload PDF to stamp watermark")}
              description={tr("Upload a document to apply professional security overlays immediately.")}
            />
          </div>
        )}

        {loading && (
          <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300 mb-6">
            <Loader2 className="w-5 h-5 text-rose-500 animate-spin" />
            <span>{tr("Processing layers and creating vector stamps...")}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">{tr("Successfully Watermarked!")}</span> {tr("Your stylized copy has been saved and downloaded.")}
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-watermark-reset"
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {tr("Start New")}
            </button>
          </div>
        )}

        {file && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
            {/* Sidebar Controls */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <FileCode className="w-5 h-5 text-rose-500" />
                  <div className="truncate">
                    <p className="font-semibold text-slate-750 dark:text-slate-250 truncate">{file.name}</p>
                    <p className="text-slate-500 dark:text-slate-400 font-mono mt-0.5">{file.pageCount} {tr("pages •")} {formatSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetTool}
                  className="text-rose-500 hover:text-rose-600 font-semibold px-2 py-1 cursor-pointer"
                >
                  {tr("Change")}
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">{tr("Layout Overlay Mode")}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'diagonal', icon: Compass },
                      { id: 'center', icon: Square },
                      { id: 'grid', icon: Grid },
                      { id: 'custom', icon: Edit3 },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setLayout(preset.id as WatermarkLayout)}
                        className={`py-2 rounded-lg text-[10px] uppercase font-bold border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          layout === preset.id
                            ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <preset.icon className="w-3.5 h-3.5" />
                        <span>{preset.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-rose-500" /> {tr("Watermark Text")}
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-rose-500 outline-none"
                    maxLength={50}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['CONFIDENTIAL', 'DRAFT', 'SAMPLE'].map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => setText(word)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold cursor-pointer"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">{tr("Font Size (pt)")}</label>
                    <input
                      type="number"
                      value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value) || 48)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400">{tr("Color")}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-10 h-9 p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-full px-2 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded uppercase font-mono outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <label>{tr("Rotate Angle")}</label>
                    <span className="font-mono">{rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={0} max={360} step={15}
                    value={rotation}
                    onChange={(e) => setRotation(parseInt(e.target.value) || 0)}
                    disabled={layout === 'diagonal'}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-rose-500 disabled:opacity-30 cursor-pointer"
                  />
                </div>

                <div className="space-y-2 pb-1">
                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                    <label>{tr("Opacity")}</label>
                    <span className="font-mono">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={10} max={100} step={5}
                    value={opacity * 100}
                    onChange={(e) => setOpacity((parseInt(e.target.value) || 20) / 100)}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-rose-500 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 mt-2 cursor-pointer shadow-md"
                >
                  <Play className="w-4 h-4 fill-white" /> {tr("Apply Watermark")}
                </button>
              </div>
            </div>

            {/* Canvas Preview Area */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Maximize className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-bold font-mono text-slate-400 uppercase">{tr("Live Preview Page 1")}</span>
              </div>

              <div className="bg-slate-100/50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/50 dark:border-slate-800 p-8 flex items-center justify-center min-h-[460px] relative overflow-hidden select-none">
                
                <div 
                  id="watermark-preview-sheet"
                  className="w-full max-w-[340px] bg-white border border-slate-200 shadow-md rounded-xs relative overflow-hidden flex items-center justify-center pointer-events-none"
                  style={{ aspectRatio: '8.5/11' }}
                >
                  {file.previews[previewPageIndex] ? (
                    <img
                      src={file.previews[previewPageIndex]}
                      className="w-full h-full object-cover select-none absolute top-0 left-0"
                      referrerPolicy="no-referrer"
                      alt={tr("Preview Doc")}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300 bg-slate-50">
                      <FileText className="w-12 h-12" />
                    </div>
                  )}

                  {/* Watermark Interactive Layer */}
                  {layout === 'grid' ? (
                    <div className="absolute inset-0 pointer-events-none flex flex-wrap overflow-hidden">
                       {[...Array(12)].map((_, i) => (
                         <span key={i} style={{color, opacity, fontSize: `${Math.max(8, fontSize * 0.4)}px`, transform: `rotate(${rotation}deg)`}} className="w-1/3 h-1/4 flex items-center justify-center font-bold whitespace-nowrap">{text}</span>
                       ))}
                    </div>
                  ) : (
                    <div 
                      className="transition-opacity hover:opacity-100 pointer-events-auto"
                      style={getWatermarkPreviewStyle()}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (layout === 'grid') return;
                        setIsDragging(true);
                        setDragStart({ clientX: e.clientX, clientY: e.clientY });
                        if (layout !== 'custom') {
                            setLayout('custom');
                            setCustomX(0.5);
                            setCustomY(0.5);
                        }
                      }}
                    >
                      {text}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
