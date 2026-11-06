/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, FormEvent } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  FileCode, 
  Loader2, 
  RefreshCw, 
  FileText, 
  Heart, 
  Plus, 
  Trash2, 
  Info,
  Download,
  Check,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, rgb, StandardFonts } from 'pdf-lib';

interface FormFillerToolProps {
  onBack: () => void;
}

interface DetectedField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';
  value: any;
  options: string[];
}

interface TextOverlay {
  id: string;
  text: string;
  fontSize: number;
  color: 'black' | 'blue' | 'red';
  pageIndex: number;
  xPercent: number; // 0-100
  yPercent: number; // 0-100 from top (rendered)
}

const OVERLAY_COLORS = {
  black: { hex: '#000000', label: 'Classic Black', rgb: [0, 0, 0] },
  blue: { hex: '#1e3a8a', label: 'Eelegant Blue', rgb: [30/255, 58/255, 138/255] },
  red: { hex: '#b91c1c', label: 'Audit Red', rgb: [185/255, 28/255, 28/255] }
};

export default function FormFillerTool({ onBack }: FormFillerToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Form values state
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [flattenFields, setFlattenFields] = useState(false);

  // Overlay annotations state
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  
  // Preview configuration
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Parse uploaded file and extract native interactive fields
  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);
    setOverlays([]);
    setSelectedOverlayId(null);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      
      // Load details & previews using existing pdfUtils sequence
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 16);

      // Load with pdf-lib to analyze interactive fields
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      const parsedFields: DetectedField[] = fields.map(field => {
        const name = field.getName();
        let type: DetectedField['type'] = 'unknown';
        let value: any = '';
        let options: string[] = [];
        const constructorName = field.constructor.name;

        if (field instanceof PDFTextField || constructorName === 'PDFTextField') {
          type = 'text';
          value = (field as PDFTextField).getText() || '';
        } else if (field instanceof PDFCheckBox || constructorName === 'PDFCheckBox') {
          type = 'checkbox';
          value = (field as PDFCheckBox).isChecked() || false;
        } else if (field instanceof PDFDropdown || constructorName === 'PDFDropdown') {
          type = 'dropdown';
          const dropdown = field as PDFDropdown;
          try {
            value = dropdown.getSelected() || [];
          } catch {
            value = [];
          }
          try {
            options = dropdown.getOptions() || [];
          } catch {
            options = [];
          }
        } else if (field instanceof PDFRadioGroup || constructorName === 'PDFRadioGroup') {
          type = 'radio';
          const radio = field as PDFRadioGroup;
          try {
            value = radio.getSelected() || '';
          } catch {
            value = '';
          }
          try {
            options = radio.getOptions() || [];
          } catch {
            options = [];
          }
        }

        return { name, type, value, options };
      });

      // Initialize default values map
      const initialValues: Record<string, any> = {};
      parsedFields.forEach(f => {
        initialValues[f.name] = f.value;
      });

      setDetectedFields(parsedFields);
      setFormValues(initialValues);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      setSelectedPageIndex(0);

    } catch (err) {
      console.error(err);
      alert('Failed to read and parse PDF form elements. Please ensure this file is not corrupted.');
    } finally {
      setLoading(false);
    }
  };

  // Change individual form field value
  const handleFieldChange = (name: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Click on PDF preview to add or place a text overlay
  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    
    // Calculate percentage coordinates of clicked point
    const x = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 0), 100);
    const y = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * 100, 0), 100);

    if (selectedOverlayId) {
      // Reposition selected overlay
      setOverlays(prev => prev.map(o => {
        if (o.id === selectedOverlayId) {
          return { ...o, xPercent: Math.round(x), yPercent: Math.round(y), pageIndex: selectedPageIndex };
        }
        return o;
      }));
    } else {
      // Create a brand new annotation overlay text box
      const newOverlay: TextOverlay = {
        id: Math.random().toString(36).substring(2, 9),
        text: 'Type a custom label...',
        fontSize: 12,
        color: 'black',
        pageIndex: selectedPageIndex,
        xPercent: Math.round(x),
        yPercent: Math.round(y),
      };
      setOverlays(prev => [...prev, newOverlay]);
      setSelectedOverlayId(newOverlay.id);
    }
  };

  // Add custom overlay manually
  const addCustomOverlay = () => {
    const newOverlay: TextOverlay = {
      id: Math.random().toString(36).substring(2, 9),
      text: 'Custom Annotation',
      fontSize: 12,
      color: 'blue',
      pageIndex: selectedPageIndex,
      xPercent: 50,
      yPercent: 50,
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const deleteOverlay = (id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedOverlayId === id) {
      setSelectedOverlayId(null);
    }
  };

  const updateOverlayProp = (id: string, prop: keyof TextOverlay, value: any) => {
    setOverlays(prev => prev.map(o => {
      if (o.id === id) {
        return { ...o, [prop]: value };
      }
      return o;
    }));
  };

  // Carry out filler compiling & overlay stamping back into a single byte stream
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const pdfDoc = await PDFDocument.load(file.arrayBuffer);
      const form = pdfDoc.getForm();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // 1. Pour form values into interactive native form fields
      for (const field of form.getFields()) {
        const name = field.getName();
        const value = formValues[name];
        const constructorName = field.constructor.name;

        if (value !== undefined) {
          try {
            if (field instanceof PDFTextField || constructorName === 'PDFTextField') {
              (field as PDFTextField).setText(String(value));
            } else if (field instanceof PDFCheckBox || constructorName === 'PDFCheckBox') {
              if (value) {
                (field as PDFCheckBox).check();
              } else {
                (field as PDFCheckBox).uncheck();
              }
            } else if (field instanceof PDFDropdown || constructorName === 'PDFDropdown') {
              const dropdown = field as PDFDropdown;
              if (Array.isArray(value)) {
                dropdown.select(value);
              } else if (value) {
                dropdown.select(String(value));
              }
            } else if (field instanceof PDFRadioGroup || constructorName === 'PDFRadioGroup') {
              const radio = field as PDFRadioGroup;
              if (value) {
                radio.select(String(value));
              }
            }
          } catch (err) {
            console.error(`Error setting field ${name}:`, err);
          }
        }
      }

      // 2. Add custom text overlay annotations
      const pages = pdfDoc.getPages();
      for (const overlay of overlays) {
        if (overlay.pageIndex < pages.length) {
          const page = pages[overlay.pageIndex];
          const { width, height } = page.getSize();
          
          // Calculate coordinates (pdf coordinates are from bottom-left)
          const stampX = (overlay.xPercent / 100) * width;
          const stampY = height - (overlay.yPercent / 100) * height; // invert Y coordinate

          const colorConfig = OVERLAY_COLORS[overlay.color];
          const [r, g, b] = colorConfig.rgb;

          page.drawText(overlay.text, {
            x: stampX,
            y: stampY,
            size: overlay.fontSize,
            font: helveticaFont,
            color: rgb(r, g, b)
          });
        }
      }

      // 3. Optional flattening of native fields
      if (flattenFields) {
        form.flatten();
      }

      const cookedBytes = await pdfDoc.save();
      const baseName = file.name.replace(/\.pdf$/i, '');
      const compiledFilename = `${baseName}_filled.pdf`;

      downloadFile(cookedBytes, compiledFilename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Unable to compile filled PDF form values. Ensure this document has write permissions standard.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setDetectedFields([]);
    setFormValues({});
    setOverlays([]);
    setSelectedOverlayId(null);
    setSuccess(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  return (
    <div className="space-y-6">
      {/* Navigation header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-filler-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-semibold">
          PDF Form Filler Applet
        </span>
      </div>

      {!file ? (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Fill PDF Forms &amp; Sign
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              Auto-detect interactive fields instantly. Type custom details, choose selections, place customized notes, and download your finalized vector document securely 100% locally.
            </p>
          </div>

          <Dropzone
            onFilesSelected={handleFileSelected}
            multiple={false}
            title="Upload a fillable or regular PDF form"
            description="Drag and drop or browse to load document"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Sheet / Left Sidebar Form Layout */}
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm p-6 space-y-6">
                
                {/* File Metadata Overview Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate" title={file.name}>
                      {file.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatSize(file.size)} • {file.pageCount} Pages • {detectedFields.length} Form Fields
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    title="Change document"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Detected interactive form fields section */}
                {detectedFields.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold font-mono text-slate-400 dark:text-slate-550 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Interactive Fields
                      </h3>
                      <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-medium">
                        Auto-Detected
                      </span>
                    </div>

                    <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                      {detectedFields.map((field) => (
                        <div key={field.name} className="space-y-1.5 text-left border-b border-slate-50 dark:border-slate-950 pb-3 last:border-0 last:pb-0">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {field.name} <span className="text-[10px] font-mono capitalize px-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-500">{field.type}</span>
                          </label>

                          {field.type === 'text' && (
                            <input
                              type="text"
                              value={formValues[field.name] || ''}
                              onChange={(e) => handleFieldChange(field.name, e.target.value)}
                              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:border-amber-500 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-white transition-all shadow-2xs"
                              placeholder="Empty..."
                            />
                          )}

                          {field.type === 'checkbox' && (
                            <label className="flex items-center gap-2.5 py-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!formValues[field.name]}
                                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                                className="rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-800 w-4 h-4"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formValues[field.name] ? 'Checked / Selected' : 'Not checked'}
                              </span>
                            </label>
                          )}

                          {field.type === 'dropdown' && (
                            <select
                              value={formValues[field.name] || ''}
                              onChange={(e) => handleFieldChange(field.name, e.target.value)}
                              className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:border-amber-500 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-white transition-all shadow-2xs cursor-pointer"
                            >
                              <option value="">-- Choose option --</option>
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          )}

                          {field.type === 'radio' && (
                            <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
                              {field.options.map((opt) => (
                                <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={field.name}
                                    checked={formValues[field.name] === opt}
                                    onChange={() => handleFieldChange(field.name, opt)}
                                    className="text-amber-600 focus:ring-amber-500"
                                  />
                                  <span className="text-xs text-slate-600 dark:text-slate-400">{opt}</span>
                                </label>
                              ))}
                              {field.options.length === 0 && (
                                <span className="text-[10px] text-slate-400">No options defined</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-500/5 dark:bg-amber-950/20 rounded-2xl border border-amber-500/10 flex gap-3 text-left">
                    <Info className="w-5 h-5 shrink-0 text-amber-500" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider font-mono">
                        No Interactive Form Fields Found
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        This PDF doesn&apos;t have native fillable form inputs, but you can still stamp custom text labels, dates, signatures, or checkmarks anywhere on the sheets using our Overlay Annotator container.
                      </p>
                    </div>
                  </div>
                )}

                {/* Custom Overlay annotations section */}
                <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold font-mono text-slate-400 dark:text-slate-550 uppercase tracking-widest">
                      Custom Text Overlays
                    </h3>
                    <button
                      type="button"
                      onClick={addCustomOverlay}
                      className="text-xs flex items-center gap-1 py-1 px-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-950 transition-all font-medium cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Stamp Label
                    </button>
                  </div>

                  {overlays.length > 0 ? (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {overlays.map((overlay) => {
                        const isSelected = selectedOverlayId === overlay.id;
                        return (
                          <div
                            key={overlay.id}
                            onClick={() => setSelectedOverlayId(overlay.id)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              isSelected
                                ? 'border-amber-500 bg-amber-500/5 shadow-2xs'
                                : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-200 dark:hover:border-slate-800'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                Page {overlay.pageIndex + 1} ({overlay.xPercent}%, {overlay.yPercent}%)
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteOverlay(overlay.id);
                                }}
                                className="text-slate-400 hover:text-rose-500 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <input
                              type="text"
                              value={overlay.text}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateOverlayProp(overlay.id, 'text', e.target.value)}
                              className="w-full text-xs font-medium py-1.5 px-2 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-amber-500 text-slate-800 dark:text-white"
                              placeholder="Overlay content..."
                            />

                            {isSelected && (
                              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-150/40 dark:border-slate-800/40">
                                <div className="space-y-1">
                                  <label className="block text-[10px] uppercase font-bold text-slate-400">Size</label>
                                  <input
                                    type="number"
                                    min="6"
                                    max="48"
                                    value={overlay.fontSize}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateOverlayProp(overlay.id, 'fontSize', parseInt(e.target.value) || 12)}
                                    className="w-full text-[11px] py-1 px-2 border border-slate-200 dark:border-slate-850 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-slate-200"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[10px] uppercase font-bold text-slate-400">Text Color</label>
                                  <select
                                    value={overlay.color}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateOverlayProp(overlay.id, 'color', e.target.value)}
                                    className="w-full text-[11px] py-1 px-1.5 border border-slate-200 dark:border-slate-850 dark:bg-slate-900 rounded-lg text-slate-800 dark:text-slate-200 cursor-pointer"
                                  >
                                    <option value="black">Black</option>
                                    <option value="blue">Blue</option>
                                    <option value="red">Red</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-2">
                      No custom overlays stamped. Click or write above to position text anywhere.
                    </p>
                  )}
                </div>

                {/* Optional processing controls */}
                <div className="space-y-3 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="opt-flatten"
                      checked={flattenFields}
                      onChange={(e) => setFlattenFields(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-800 w-4 h-4"
                    />
                    <label htmlFor="opt-flatten" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      Flatten Form Elements (Irreversible encryption)
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed pl-6">
                    Bake all form field answers directly into the PDF content layers. Recommended before submitting to formal organizations to prevent subsequent modifications.
                  </p>
                </div>

              </div>

              {/* Submit / Save action element */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  id="btn-filler-submit"
                  className="flex-1 py-3 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2.5 hover:bg-slate-800 dark:hover:bg-slate-50 transition-all shadow-md hover:shadow-lg disabled:opacity-40 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Composing filled PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Save &amp; Download form
                    </>
                  )}
                </button>
              </div>
            </form>

            {success && (
              <div className="p-4 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 rounded-2xl flex items-center gap-3 border border-emerald-500/10 text-left">
                <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500 animate-bounce" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide font-mono">Download Commencing!</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    If your download didn&apos;t invoke automatically, submit again.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Page visual preview segment / Right side panel */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-100 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-850 p-6 rounded-2xl flex flex-col items-center">
              
              {/* Pages control header selection bar */}
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-450 uppercase">
                  Page Preview Panel
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Jump to sheet:</span>
                  <select
                    value={selectedPageIndex}
                    onChange={(e) => setSelectedPageIndex(parseInt(e.target.value) || 0)}
                    className="py-1 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    {Array.from({ length: file.pageCount }).map((_, idx) => (
                      <option key={idx} value={idx}>
                        Page {idx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Guide prompt banner */}
              <div className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-xl text-center text-xs text-slate-500 dark:text-slate-400 mb-6 flex items-center justify-center gap-2">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {selectedOverlayId 
                    ? "Click on the sheet to reposition your selected custom overlay text box."
                    : "Click anywhere on the document sheet to spawn a custom text annotation."
                  }
                </span>
              </div>

              {/* Preview container rendering page background and overlays */}
              {file.previews && file.previews[selectedPageIndex] ? (
                <div className="relative w-full max-w-[480px] border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-md select-none">
                  <div
                    ref={previewContainerRef}
                    onClick={handlePreviewClick}
                    className="relative cursor-crosshair group"
                  >
                    <img
                      src={file.previews[selectedPageIndex]}
                      alt={`Page ${selectedPageIndex + 1}`}
                      className="w-full h-auto object-contain block pointer-events-none"
                      referrerPolicy="no-referrer"
                    />

                    {/* Render active custom overlay positions relative on user-resizable sizes */}
                    {overlays
                      .filter((o) => o.pageIndex === selectedPageIndex)
                      .map((o) => {
                        const isSelected = selectedOverlayId === o.id;
                        const colorConfig = OVERLAY_COLORS[o.color];
                        
                        return (
                          <div
                            key={o.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOverlayId(o.id);
                            }}
                            style={{
                              left: `${o.xPercent}%`,
                              top: `${o.yPercent}%`,
                              fontSize: `${Math.round(o.fontSize * 0.9)}px`,
                              color: colorConfig.hex,
                              fontFamily: 'Helvetica, Arial, sans-serif'
                            }}
                            className={`absolute transform -translate-x-1/2 -translate-y-1/2 py-0.5 px-2 bg-white/90 dark:bg-slate-900/90 font-medium rounded border whitespace-nowrap transition-all flex items-center gap-1.5 shadow-2xs ${
                              isSelected
                                ? 'border-amber-500 scale-105 ring-2 ring-amber-450/40 z-10'
                                : 'border-slate-350 dark:border-slate-700 opacity-80 hover:opacity-100'
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{o.text || 'Annotation'}</span>
                            <span className="text-[8px] opacity-40 font-mono">#{o.fontSize}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
                  <p className="text-xs text-slate-400">Could not extract thumbnail slice views.</p>
                </div>
              )}

              {/* Grid map array of other pages */}
              {file.pageCount > 1 && (
                <div className="w-full border-t border-slate-200 dark:border-slate-805 mt-6 pt-6">
                  <span className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-3 text-left">
                    All Slides Sheet ({file.pageCount})
                  </span>
                  <div className="flex gap-3 overflow-x-auto pb-2 pr-1 scrollbar-hidden">
                    {Array.from({ length: file.pageCount }).map((_, index) => {
                      const hasPageOverlay = overlays.some((o) => o.pageIndex === index);
                      return (
                        <button
                          key={index}
                          onClick={() => setSelectedPageIndex(index)}
                          className={`relative shrink-0 w-16 h-20 rounded-md overflow-hidden border transition-all cursor-pointer ${
                            selectedPageIndex === index
                              ? 'border-amber-500 scale-105 ring-2 ring-amber-450/30 shadow-xs'
                              : 'border-slate-250 dark:border-slate-800 hover:border-slate-400'
                          }`}
                        >
                          {file.previews[index] ? (
                            <img
                              src={file.previews[index]}
                              alt={`Thumb ${index + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-[10px] font-bold text-slate-400">
                              {index + 1}
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-black/50 text-[8px] font-mono text-white text-center py-0.5">
                            P. {index + 1}
                          </div>
                          {hasPageOverlay && (
                            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
