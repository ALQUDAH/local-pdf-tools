import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Type, 
  Square, 
  Trash2, 
  CheckCircle, 
  Download, 
  Loader2, 
  Undo2, 
  Plus, 
  HelpCircle,
  FileDown
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { tr } from '../i18n';
import '../lib/pdfjs';


interface EditPdfToolProps {
  onBack: () => void;
}

interface TextAnnotation {
  id: string;
  text: string;
  x: number; // percentage of page width
  y: number; // percentage of page height
  fontSize: number;
  color: string;
}

interface ShapeAnnotation {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
}

export default function EditPdfTool({ onBack }: EditPdfToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pagesCount, setPagesCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Annotations mapped per-page
  const [textAnnotations, setTextAnnotations] = useState<Record<number, TextAnnotation[]>>({});
  const [shapeAnnotations, setShapeAnnotations] = useState<Record<number, ShapeAnnotation[]>>({});
  
  // Selection / Tools state
  const [activeSubTool, setActiveSubTool] = useState<'text' | 'shape'>('text');
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Active configurations
  const [textColor, setTextColor] = useState('#1E293B');
  const [textSize, setTextSize] = useState(14);
  const [shapeCol, setShapeCol] = useState('#EF4444');
  const [shapeOp, setShapeOp] = useState(0.4);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      setTextAnnotations({});
      setShapeAnnotations({});

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        setPdfBytes(bytes);

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdfDoc = await loadingTask.promise;
        setPagesCount(pdfDoc.numPages);
      } catch (err: any) {
        console.error(err);
        setError(tr("Failed to extract PDF coordinates. Please verify file is not corrupted."));
        setFile(null);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!pdfBytes || !canvasRef.current) return;
    
    let active = true;
    const renderPage = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(currentPage);
        
        if (!active) return;
        
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Render at logical dimension scale
        const viewport = page.getViewport({ scale: 1.2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        };
        await page.render(renderContext).promise;
      } catch (err) {
        console.error("Renderer slide error:", err);
      }
    };

    renderPage();
    return () => {
      active = false;
    };
  }, [pdfBytes, currentPage]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Calculate click coordinates as percentages
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (activeSubTool === 'text') {
      const newText: TextAnnotation = {
        id: `txt_${Date.now()}`,
        text: 'Editable text overlay',
        x,
        y,
        fontSize: textSize,
        color: textColor
      };
      
      setTextAnnotations(prev => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newText]
      }));
      setSelectedTextId(newText.id);
      setSelectedShapeId(null);
    } else if (activeSubTool === 'shape') {
      const newShape: ShapeAnnotation = {
        id: `shp_${Date.now()}`,
        x,
        y,
        w: 12,
        h: 6,
        color: shapeCol,
        opacity: shapeOp
      };

      setShapeAnnotations(prev => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newShape]
      }));
      setSelectedShapeId(newShape.id);
      setSelectedTextId(null);
    }
  };

  // Safe annotation text editor update
  const handleTextChange = (id: string, text: string) => {
    setTextAnnotations(prev => ({
      ...prev,
      [currentPage]: (prev[currentPage] || []).map(ann => 
        ann.id === id ? { ...ann, text } : ann
      )
    }));
  };

  const deleteSelected = () => {
    if (selectedTextId) {
      setTextAnnotations(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).filter(ann => ann.id !== selectedTextId)
      }));
      setSelectedTextId(null);
    } else if (selectedShapeId) {
      setShapeAnnotations(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).filter(ann => ann.id !== selectedShapeId)
      }));
      setSelectedShapeId(null);
    }
  };

  const hexToRgb = (hex: string) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    } : { r: 0, g: 0, b: 0 };
  };

  // Bake all overlays directly into PDF Bytes
  const handleExport = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    setError(null);

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const outputPages = pdfDoc.getPages();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (let pIdx = 1; pIdx <= outputPages.length; pIdx++) {
        const targetPage = outputPages[pIdx - 1];
        const { width, height } = targetPage.getSize();

        // Write shapes
        const shapes = shapeAnnotations[pIdx] || [];
        for (const sh of shapes) {
          const { r, g, b } = hexToRgb(sh.color);
          targetPage.drawRectangle({
            x: (sh.x / 100) * width,
            y: height - ((sh.y / 100) * height) - ((sh.h / 100) * height),
            width: (sh.w / 100) * width,
            height: (sh.h / 100) * height,
            color: rgb(r, g, b),
            opacity: sh.opacity
          });
        }

        // Write text overlays
        const texts = textAnnotations[pIdx] || [];
        for (const tx of texts) {
          const { r, g, b } = hexToRgb(tx.color);
          targetPage.drawText(tx.text, {
            x: (tx.x / 100) * width,
            y: height - ((tx.y / 100) * height) - (tx.fontSize * 0.4),
            size: tx.fontSize,
            font: font,
            color: rgb(r, g, b)
          });
        }
      }

      const modBytes = await pdfDoc.save();
      const blob = new Blob([modBytes as BlobPart], { type: 'application/pdf' });
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = file ? `${file.name.replace(/\.\w+$/, '')}_edited.pdf` : 'edited_output.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error(err);
      setError(tr("An error occurred during coordinate flattening."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="edit-pdf-container" className="max-w-6xl mx-auto p-4 md:p-6 my-4 animate-fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>{tr("Back to Dashboard")}</span>
        </button>
        <span className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full font-semibold">
          {tr("100% Client-Side Private Sandboxed Editor")}
        </span>
      </div>

      {/* Upload State */}
      {!file ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-2xl mx-auto text-center shadow-sm">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl w-fit mx-auto mb-6">
            <Type className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-2">
            {tr("Advanced PDF Annotation Editor")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed">
            {tr("Upload document containing layouts to insert custom text blocks or draw colored opaque highlight covers onto target coordinates.")}
          </p>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 cursor-pointer hover:bg-slate-50 transition">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {tr("Select PDF document")}
            </span>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Toolbox */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                {tr("Annotation Tools")}
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setActiveSubTool('text');
                    setSelectedShapeId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                    activeSubTool === 'text' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Type className="w-4 h-4" />
                  <span>{tr("Insert Text Block")}</span>
                </button>
                <button
                  onClick={() => {
                    setActiveSubTool('shape');
                    setSelectedTextId(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                    activeSubTool === 'shape' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Square className="w-4 h-4" />
                  <span>{tr("Highlight Cover Rectangle")}</span>
                </button>
              </div>
            </div>

            {/* Config Box based on selected item */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
              {activeSubTool === 'text' ? (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {tr("Text Options")}
                  </h4>
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">{tr("Color")}</label>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">{tr("Font Size:")} {textSize}{tr("px")}</label>
                    <input
                      type="range"
                      min="10"
                      max="36"
                      value={textSize}
                      onChange={(e) => setTextSize(parseInt(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {tr("Shape Options")}
                  </h4>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">{tr("Color")}</label>
                    <input
                      type="color"
                      value={shapeCol}
                      onChange={(e) => setShapeCol(e.target.value)}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">{tr("Opacity:")} {Math.round(shapeOp * 100)}%</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={shapeOp * 100}
                      onChange={(e) => setShapeOp(parseFloat(e.target.value) / 100)}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Instruction Help */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-xs text-slate-400 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>{tr("Click anywhere inside the document preview page coordinates to paint chosen overlay blocks. Double-click text blocks in the workspace to edit original contents.")}</span>
            </div>

            {/* Actions bar */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-6 space-y-2">
              {(selectedTextId || selectedShapeId) && (
                <button
                  onClick={deleteSelected}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl text-sm font-semibold hover:bg-rose-100 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{tr("Delete Selected Annotation")}</span>
                </button>
              )}

              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{tr("Flattening layers...")}</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    <span>{tr("Flatten & Download")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Canvas Preview Area */}
          <div className="lg:col-span-3 space-y-4">
            
            {/* Pages selector bar */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-6 py-3 rounded-2xl shadow-xs">
              <span className="text-xs text-slate-500 font-semibold truncate max-w-sm">
                {tr("File:")} {file.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    setSelectedTextId(null);
                    setSelectedShapeId(null);
                  }}
                  className="p-1 px-3 bg-slate-50 rounded-xl text-xs hover:bg-slate-100 border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  {tr("Prev Page")}
                </button>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {tr("Page")} {currentPage} {tr("of")} {pagesCount}
                </span>
                <button
                  disabled={currentPage >= pagesCount}
                  onClick={() => {
                    setCurrentPage(p => Math.min(pagesCount, p + 1));
                    setSelectedTextId(null);
                    setSelectedShapeId(null);
                  }}
                  className="p-1 px-3 bg-slate-50 rounded-xl text-xs hover:bg-slate-100 border border-slate-200 dark:border-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  {tr("Next Page")}
                </button>
              </div>
            </div>

            {/* Error notifications */}
            {error && (
              <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Coordinate Canvas board */}
            <div 
              ref={containerRef}
              className="relative overflow-auto border border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-100 dark:bg-slate-950/40 p-4 flex justify-center max-h-[80vh]"
            >
              <div className="relative shadow-lg select-no-text bg-white">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="block cursor-crosshair"
                />

                {/* Page shapes annotations overlay */}
                {(shapeAnnotations[currentPage] || []).map((shp) => (
                  <div
                    key={shp.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShapeId(shp.id);
                      setSelectedTextId(null);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${shp.x}%`,
                      top: `${shp.y}%`,
                      width: `${shp.w}%`,
                      height: `${shp.h}%`,
                      backgroundColor: shp.color,
                      opacity: shp.opacity,
                      border: selectedShapeId === shp.id ? '2px solid #6366F1' : 'none',
                      cursor: 'pointer'
                    }}
                  />
                ))}

                {/* Page text annotations overlay */}
                {(textAnnotations[currentPage] || []).map((ann) => (
                  <div
                    key={ann.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTextId(ann.id);
                      setSelectedShapeId(null);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${ann.x}%`,
                      top: `${ann.y}%`,
                      color: ann.color,
                      fontSize: `${ann.fontSize}px`,
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      whiteSpace: 'nowrap',
                      border: selectedTextId === ann.id ? '1px dashed #6366F1' : 'none',
                      backgroundColor: selectedTextId === ann.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      cursor: 'move',
                      transform: 'translateY(-50%)'
                    }}
                  >
                    {selectedTextId === ann.id ? (
                      <input
                        type="text"
                        value={ann.text}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleTextChange(ann.id, e.target.value)}
                        className="bg-white text-slate-800 border border-slate-300 dark:border-slate-700 px-1 rounded-sm focus:outline-none"
                      />
                    ) : (
                      <span>{ann.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
