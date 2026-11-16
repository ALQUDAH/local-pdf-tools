/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Download,
  Eye,
  Settings,
  Plus,
  Trash2,
  FileText,
  Sliders,
  AlignLeft,
  CheckSquare,
  Sparkles
} from 'lucide-react';
import { PDFFile } from '../types';
import Dropzone from './Dropzone';
import { fileToArrayBuffer, getPdfDetails, downloadFile, getNormalizedFieldRect } from '../lib/pdfUtils';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import { PDFDocument } from 'pdf-lib';

import { tr } from '../i18n';
interface FormBuilderToolProps {
  onBack: () => void;
}

type FieldType = 'text' | 'checkbox' | 'button';

interface FormFieldItem {
  id: string;
  type: FieldType;
  name: string;
  placeholder: string;
  page: number; // 1-based page index
  xPct: number; // Percentage from left of page (0-100)
  yPct: number; // Percentage from top of page (0-100)
  widthPct: number; // Percentage of page width (2-50)
  heightPct: number; // Percentage of page height (2-20)
}

export default function FormBuilderTool({ onBack }: FormBuilderToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Form fields list
  const [formFields, setFormFields] = useState<FormFieldItem[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFileDrop = async (selectedFile: File) => {
    setLoading(true);
    setStatusText(tr("Reading template for interactive field placements..."));
    setSuccess(false);

    try {
      const arrayBuffer = await fileToArrayBuffer(selectedFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: selectedFile,
        name: selectedFile.name,
        size: selectedFile.size,
        arrayBuffer,
        pageCount,
        previews
      });
      setPreviewPage(1);
      setFormFields([]);
      setSelectedFieldId(null);
    } catch (err) {
      console.error(err);
      alert(tr("Could not parse PDF. Ensure files are non-protected Standard PDFs."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  useEffect(() => {
    if (!file) return;
    renderPreview();
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [file, previewPage]);

  const renderPreview = async () => {
    if (!file || !canvasRef.current) return;
    try {
      // Cancel previous task if any
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
        renderTaskRef.current = null;
      }

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.arrayBuffer.slice(0)) });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(previewPage);
      
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Clear base 
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render original page first
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;
    } catch (err: any) {
      if (err && (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled'))) {
        return;
      }
      console.error('Failed to render page layout preview:', err);
    }
  };

  const handleAddField = (type: FieldType) => {
    if (!file) return;
    
    const fieldNum = formFields.length + 1;
    const newField: FormFieldItem = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      name: `${type}_field_${fieldNum}`,
      placeholder: type === 'text' ? 'Enter Text...' : type === 'checkbox' ? 'agree' : 'Submit',
      page: previewPage,
      xPct: 20,
      yPct: 20,
      widthPct: type === 'checkbox' ? 4 : 25,
      heightPct: type === 'checkbox' ? 3 : 5
    };

    setFormFields([...formFields, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleDeleteField = (id: string) => {
    setFormFields(formFields.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  };

  const updateSelectedField = (updater: Partial<FormFieldItem>) => {
    if (!selectedFieldId) return;
    setFormFields(formFields.map(field => {
      if (field.id === selectedFieldId) {
        return { ...field, ...updater };
      }
      return field;
    }));
  };

  const currentSelectedField = formFields.find(f => f.id === selectedFieldId);

  const handleCompileForm = async () => {
    if (!file) return;
    setLoading(true);
    setStatusText(tr("Compiling interactive form components..."));

    try {
      const pdfDoc = await PDFDocument.load(file.arrayBuffer, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const form = pdfDoc.getForm();

      // Place each field element onto pages via pdf-lib's advanced Form Fields API!
      formFields.forEach((field) => {
        const pageIndex = field.page - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) return;

        const page = pages[pageIndex];
        const { width, height } = page.getSize();
        const angle = page.getRotation().angle || 0;
        const isRotated = angle === 90 || angle === 270 || angle === -90 || angle === -270;
        const visualWidth = isRotated ? height : width;
        const visualHeight = isRotated ? width : height;

        const vx = (field.xPct / 100) * visualWidth;
        const vy = visualHeight - ((field.yPct / 100) * visualHeight) - ((field.heightPct / 100) * visualHeight);
        const vw = (field.widthPct / 100) * visualWidth;
        const vh = (field.heightPct / 100) * visualHeight;

        const rectOpts = getNormalizedFieldRect(page, vx, vy, vw, vh);

        const uniqueName = field.name.trim() || `field_${field.id}`;

        if (field.type === 'text') {
          const textField = form.createTextField(uniqueName);
          textField.addToPage(page, { x: rectOpts.x, y: rectOpts.y, width: rectOpts.width, height: rectOpts.height });
          if (field.placeholder) {
            textField.setText(field.placeholder);
          }
        } else if (field.type === 'checkbox') {
          const checkBox = form.createCheckBox(uniqueName);
          checkBox.addToPage(page, { x: rectOpts.x, y: rectOpts.y, width: rectOpts.width, height: rectOpts.height });
        } else if (field.type === 'button') {
          const button = form.createButton(uniqueName);
          const btnText = field.placeholder || 'Submit';
          button.addToPage(btnText, page, { x: rectOpts.x, y: rectOpts.y, width: rectOpts.width, height: rectOpts.height });
        }
      });

      setStatusText(tr("Generating final PDF bytes..."));
      const savedBytes = await pdfDoc.save();
      const newName = file.name.replace('.pdf', '') + '_fillable.pdf';

      downloadFile(savedBytes, newName, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Could not compile standard interactive field nodes."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const idx = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, idx)).toFixed(1)) + ' ' + sizes[idx];
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={tr("Back to Dashboard")}
            title={tr("Back to Dashboard")}
            id="btn-formb-back"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 hover:scale-105 active:scale-95 transition-all text-slate-700 dark:text-slate-350 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FileText className="w-6 h-6 text-emerald-500" /> {tr("Interactive Form Builder")}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              {tr("Convert plain, scanned PDF layouts into interactive, fillable documents with authentic input fields and checkboxes.")}
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={() => {
              setFile(null);
              setSuccess(false);
              setFormFields([]);
              setSelectedFieldId(null);
            }}
            id="btn-formb-reset"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 hover:text-rose-500 font-extrabold font-mono text-xs rounded-xl transition-colors cursor-pointer border border-transparent dark:border-slate-800"
          >
            {tr("Reset Template")}
          </button>
        )}
      </div>

      {!file ? (
        <Dropzone
          onFilesSelected={(files) => handleFileDrop(files[0])}
          multiple={false}
          title={tr("Drop PDF to place form fields")}
          description={tr("Draft text inserts, user agreements, checkboxes, and interactive actions into document frames natively and securely.")}
        />
      ) : (
        /* Workspace panels */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Options side controls */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Widget tools insertion box */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">{tr("Insert Elements")}</h3>
              
              <div className="grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleAddField('text')}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-slate-700 dark:text-slate-200 text-xs font-bold text-start justify-start cursor-pointer transition-all"
                >
                  <AlignLeft className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="font-semibold">{tr("Text Input Field")}</p>
                    <p className="text-[9px] text-slate-400 font-medium">{tr("Allows text insertions")}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddField('checkbox')}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-slate-700 dark:text-slate-200 text-xs font-bold text-start justify-start cursor-pointer transition-all"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                  <div>
                    <p className="font-semibold">{tr("Interactive Checkbox")}</p>
                    <p className="text-[9px] text-slate-400 font-medium">{tr("Toggles check state mark")}</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Selected field configuration slider options */}
            {currentSelectedField && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">{tr("Edit Selected")}</h3>
                  <button
                    onClick={() => handleDeleteField(currentSelectedField.id)}
                    className="p-1 px-1.5 rounded-md hover:bg-rose-50 text-rose-500 dark:hover:bg-rose-950/20 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {tr("delete")}
                  </button>
                </div>

                <div className="space-y-3.5 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono uppercase text-slate-400">{tr("Field identifier (Name)")}</label>
                    <input
                      type="text"
                      value={currentSelectedField.name}
                      onChange={(e) => updateSelectedField({ name: e.target.value })}
                      className="w-full text-xs font-semibold p-2 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-lg outline-none focus:border-emerald-500"
                    />
                  </div>

                  {currentSelectedField.type === 'text' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold font-mono uppercase text-slate-400">{tr("Initial Placeholder")}</label>
                      <input
                        type="text"
                        value={currentSelectedField.placeholder}
                        onChange={(e) => updateSelectedField({ placeholder: e.target.value })}
                        className="w-full text-xs font-semibold p-2 border border-slate-100 dark:border-slate-800 dark:bg-slate-950 rounded-lg outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Positioning ranges */}
                  <div className="space-y-1 pt-1.5">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono uppercase">
                      <span>{tr("Horizontal X Position")}</span>
                      <span>{currentSelectedField.xPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="90"
                      value={currentSelectedField.xPct}
                      onChange={(e) => updateSelectedField({ xPct: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono uppercase">
                      <span>{tr("Vertical Y Position")}</span>
                      <span>{currentSelectedField.yPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="90"
                      value={currentSelectedField.yPct}
                      onChange={(e) => updateSelectedField({ yPct: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono uppercase">
                      <span>{tr("Field Width size")}</span>
                      <span>{currentSelectedField.widthPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="70"
                      value={currentSelectedField.widthPct}
                      onChange={(e) => updateSelectedField({ widthPct: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono uppercase">
                      <span>{tr("Field Height size")}</span>
                      <span>{currentSelectedField.heightPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="30"
                      value={currentSelectedField.heightPct}
                      onChange={(e) => updateSelectedField({ heightPct: Number(e.target.value) })}
                      className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* List of currently created elements */}
            {formFields.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 space-y-3.5 shadow-sm">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 dark:text-slate-550">{tr("Form Fields (")}{formFields.length})</h3>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pe-1">
                  {formFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => setSelectedFieldId(field.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        field.id === selectedFieldId
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-l-4 border-emerald-500'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate max-w-[120px]">{field.name}</span>
                      <span className="text-[9px] font-mono opacity-60">{tr("Pg")} {field.page} • {field.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save compiler action node */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-850 space-y-3.5 shadow-sm">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex justify-between">
                <span>{tr("Compiler")}</span>
                <span className="text-emerald-400">{tr("PDF-Form Engine")}</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold truncate">{file.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{file.pageCount} {tr("Pages •")} {formFields.length} {tr("Form Fields")}</span>
              </div>

              {success ? (
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-bold">{tr("Form elements integrated!")}</span>
                </div>
              ) : (
                <button
                  onClick={handleCompileForm}
                  id="btn-formb-compile"
                  className="w-full text-center py-3 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 text-white cursor-pointer uppercase font-mono tracking-wider shadow-sm hover:shadow-md"
                >
                  <Download className="w-4 h-4" /> {tr("Save interactive PDF")}
                </button>
              )}
            </div>

          </div>

          {/* Canvas Preview Panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-150 dark:border-slate-900 flex flex-col items-center justify-center overflow-auto min-h-[480px] shadow-inner relative">
              
              <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 text-[10px] font-mono text-slate-500 rounded-full font-bold shadow-xs">
                <Eye className="w-3.5 h-3.5 text-emerald-500" /> {tr("Form Blueprint Mode • Page")} {previewPage} {tr("of")} {file.pageCount}
              </div>

              {/* Central sandbox layout warning tips if no fields are yet placed */}
              {formFields.length === 0 && (
                <div className="absolute top-16 max-w-sm text-center p-3.5 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs border border-emerald-500/10 rounded-xl">
                  {tr("📄 Click")} <span className="font-extrabold">{tr("Text Input")}</span> {tr("or")} <span className="font-extrabold">{tr("Checkbox")}</span> {tr("in the left sidebar to start placing interactive nodes on this page.")}
                </div>
              )}

              <div className="bg-white p-0 rounded-2xl border border-slate-250 dark:border-slate-800 shadow-md max-w-full overflow-hidden my-6 relative inline-block select-none transform-gpu">
                <canvas ref={canvasRef} className="max-w-full h-auto pointer-events-none block" />
                
                {formFields.filter(f => f.page === previewPage).map((field) => {
                  const isSelected = field.id === selectedFieldId;
                  return (
                    <div
                      key={field.id}
                      className="absolute border-2 pointer-events-none transition-colors"
                      style={{
                        left: `${field.xPct}%`,
                        top: `${field.yPct}%`,
                        width: `${field.widthPct}%`,
                        height: `${field.heightPct}%`,
                        backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(56, 189, 248, 0.15)',
                        borderColor: isSelected ? '#10b981' : '#38bdf8',
                        borderStyle: isSelected ? 'solid' : 'dashed'
                      }}
                    >
                      <div className="absolute -top-4 left-0 text-[9px] font-bold font-mono whitespace-nowrap overflow-visible" style={{ color: isSelected ? '#065f46' : '#0369a1' }}>
                        [{field.type.toUpperCase()}] {field.name}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination controls */}
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.max(1, prev - 1))}
                  disabled={previewPage === 1}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Previous page")}
                </button>
                <span className="text-xs font-bold text-slate-550 dark:text-slate-400 px-2 font-mono">{tr("Page")} {previewPage} {tr("of")} {file.pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPreviewPage(prev => Math.min(file.pageCount, prev + 1))}
                  disabled={previewPage === file.pageCount}
                  className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-850 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {tr("Next page")}
                </button>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-left">
              <Sparkles className="w-5 h-5 shrink-0 text-emerald-500" />
              <div>
                <span className="font-extrabold text-slate-700 dark:text-slate-200">{tr("Standard interactive Acrobat integration:")}</span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  {tr("Unlike simple overlay annotations, this tool uses Adobe-compliant `/InteractiveForm` descriptors. This creates true responsive vector fields natively within the document stream so that any person opening this document on Adobe Reader, Mac Preview, Chrome, or Android can easily click, fill, and submit form responses!")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in animate-duration-200">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center max-w-xs text-center space-y-4 shadow-xl">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{statusText}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{tr("Interfacing PDF structure...")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
