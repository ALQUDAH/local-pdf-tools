import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  FileText, 
  Presentation, 
  FileSpreadsheet, 
  FileCode, 
  Languages, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Upload, 
  Settings,
  ShieldCheck,
  Server
} from 'lucide-react';

interface ConvertToolProps {
  toolId: string;
  onBack: () => void;
}

export default function ConvertTool({ toolId, onBack }: ConvertToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [htmlCode, setHtmlCode] = useState('<h1>Hello world!</h1>\n<p>This is a custom printed PDF document generated directly from HTML code.</p>');
  const [htmlMode, setHtmlMode] = useState<'url' | 'code' | 'file'>('url');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFilename, setResultFilename] = useState('');
  // null = checking, true = companion server reachable, false = static hosting (no server)
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (res) => {
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (!cancelled) setServerAvailable(!!data && data.status === 'healthy');
      })
      .catch(() => {
        if (!cancelled) setServerAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Define configuration based on the active tool
  let title = '';
  let description = '';
  let inputAccept = '';
  let inputLabel = '';
  let apiEndpoint = '';
  let resultExt = '';
  let icon = <FileText className="w-8 h-8" />;
  let colorClass = 'emerald';

  switch (toolId) {
    case 'pdftoword':
      title = 'PDF to Word';
      description = 'Convert PDF document to fully editable Microsoft Word Document (.docx) preserving lines and text format.';
      inputAccept = '.pdf';
      inputLabel = 'Select a PDF File';
      apiEndpoint = '/api/convert/pdf-to-word';
      resultExt = 'docx';
      icon = <FileText className="w-8 h-8 text-blue-500" />;
      colorClass = 'blue';
      break;
    case 'pdftopowerpoint':
      title = 'PDF to PowerPoint';
      description = 'Convert PDF document to fully styled Microsoft PowerPoint slides (.pptx). Each page is formatted beautifully.';
      inputAccept = '.pdf';
      inputLabel = 'Select a PDF File';
      apiEndpoint = '/api/convert/pdf-to-powerpoint';
      resultExt = 'pptx';
      icon = <Presentation className="w-8 h-8 text-orange-500" />;
      colorClass = 'orange';
      break;
    case 'pdftoexcel':
      title = 'PDF to Excel';
      description = 'Extract tabular layout, numbers and grids from PDF files directly into Microsoft Excel spreadsheets (.xlsx).';
      inputAccept = '.pdf';
      inputLabel = 'Select a PDF File';
      apiEndpoint = '/api/convert/pdf-to-excel';
      resultExt = 'xlsx';
      icon = <FileSpreadsheet className="w-8 h-8 text-green-500" />;
      colorClass = 'green';
      break;
    case 'wordtopdf':
      title = 'Word to PDF';
      description = 'Convert Microsoft Word files (.docx) into accurate and high-contrast PDF documents offline.';
      inputAccept = '.docx';
      inputLabel = 'Select a Word Document (.docx)';
      apiEndpoint = '/api/convert/word-to-pdf';
      resultExt = 'pdf';
      icon = <FileText className="w-8 h-8 text-sky-500" />;
      colorClass = 'sky';
      break;
    case 'powerpointtopdf':
      title = 'PowerPoint to PDF';
      description = 'Convert Microsoft PowerPoint presentations (.pptx) into standard PDF slides page-by-page.';
      inputAccept = '.pptx';
      inputLabel = 'Select a PowerPoint File (.pptx)';
      apiEndpoint = '/api/convert/powerpoint-to-pdf';
      resultExt = 'pdf';
      icon = <Presentation className="w-8 h-8 text-rose-500" />;
      colorClass = 'rose';
      break;
    case 'exceltopdf':
      title = 'Excel to PDF';
      description = 'Convert Microsoft Excel spreadsheet tables (.xlsx) into highly readable styled PDF documents.';
      inputAccept = '.xlsx';
      inputLabel = 'Select an Excel Spreadsheet (.xlsx)';
      apiEndpoint = '/api/convert/excel-to-pdf';
      resultExt = 'pdf';
      icon = <FileSpreadsheet className="w-8 h-8 text-teal-500" />;
      colorClass = 'teal';
      break;
    case 'htmltopdf':
      title = 'HTML/Website to PDF';
      description = 'Save any public webpage URL or raw HTML code into standard formatted A4 PDF layouts.';
      inputAccept = '.html,.htm';
      inputLabel = 'Select an HTML File (.html)';
      apiEndpoint = '/api/convert/html-to-pdf';
      resultExt = 'pdf';
      icon = <FileCode className="w-8 h-8 text-indigo-500" />;
      colorClass = 'indigo';
      break;
    case 'pdftopdfa':
      title = 'PDF to PDF/A';
      description = 'Convert standard PDF files to ISO standardized PDF/A documents for long-term data archiving and digital preservation.';
      inputAccept = '.pdf';
      inputLabel = 'Select a PDF File';
      apiEndpoint = '/api/convert/pdf-to-pdfa';
      resultExt = 'pdf';
      icon = <ShieldCheck className="w-8 h-8 text-slate-500" />;
      colorClass = 'slate';
      break;
    case 'translatepdf':
      title = 'Translate PDF AI';
      description = 'Translate your PDF documents into another language keeping logical paragraphs using AI on the server.';
      inputAccept = '.pdf';
      inputLabel = 'Select a PDF File';
      apiEndpoint = '/api/convert/translate-pdf';
      resultExt = 'pdf';
      icon = <Languages className="w-8 h-8 text-violet-500" />;
      colorClass = 'violet';
      break;
    default:
      title = 'Document Converter';
      description = 'Convert files seamlessly utilizing high fidelity fullstack libraries.';
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(false);
      setResultBlob(null);
    }
  };

  const handleConvert = async () => {
    if (toolId !== 'htmltopdf' || htmlMode === 'file') {
      if (!file) {
        setError('Please choose a file to convert.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let response: Response;
      const originalName = file ? file.name : 'rendered_output';
      const cleanName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      const outFilename = `${cleanName}_converted.${resultExt}`;

      if (toolId === 'htmltopdf') {
        if (htmlMode === 'url') {
          if (!urlInput.trim()) {
            setError('Please enter a valid website address.');
            setLoading(false);
            return;
          }
          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urlInput: urlInput }),
          });
        } else if (htmlMode === 'code') {
          if (!htmlCode.trim()) {
            setError('Please input valid HTML code snippet.');
            setLoading(false);
            return;
          }
          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ htmlInput: htmlCode }),
          });
        } else {
          // File Mode
          if (!file) {
            setError('Please select an HTML file to print.');
            setLoading(false);
            return;
          }
          const reader = new FileReader();
          const p = new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsText(file);
          });
          const text = await p;
          response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ htmlInput: text }),
          });
        }
      } else {
        // Standard File Form Upload
        const formData = new FormData();
        formData.append('file', file as File);
        
        if (toolId === 'translatepdf') {
          formData.append('targetLang', targetLang);
        }

        response = await fetch(apiEndpoint, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server error occurred during conversion process.');
      }

      const resBlob = await response.blob();
      setResultBlob(resBlob);
      setResultFilename(outFilename);
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please make sure the server is listening locally.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    const url = window.URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resultFilename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div id="convert-tool-container" className="max-w-4xl mx-auto p-4 md:p-6 my-4 animate-fade-in">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Dashboard</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-full font-semibold">
          <Server className="w-3.5 h-3.5" />
          <span>Self-Hosted Server Tool</span>
        </div>
      </div>

      {serverAvailable === false && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">This tool needs the companion server, which isn't running here.</p>
            <p>
              You're using the static (browser-only) version. {title} relies on Node.js libraries, so it only works when you
              self-host the app with <code className="font-mono">npm run dev</code> or Docker. Your file has not been sent anywhere.
              All other tools on the dashboard work fully in your browser.
            </p>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex items-start gap-4 mb-8">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl shrink-0">
            {icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-1">
              {title}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>
        </div>

        {/* Translation Language Selection */}
        {toolId === 'translatepdf' && (
          <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Select Target Language
            </label>
            <div className="flex flex-wrap gap-2">
              {['Arabic', 'French', 'Spanish', 'German', 'Turkish', 'Chinese', 'Russian'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setTargetLang(lang)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl transition ${
                    targetLang === lang 
                      ? 'bg-violet-600 text-white shadow-xs' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* HTML Specific Inputs */}
        {toolId === 'htmltopdf' && (
          <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
              <button
                onClick={() => setHtmlMode('url')}
                className={`pb-1 px-2 text-sm font-semibold transition ${
                  htmlMode === 'url' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Web Address (URL)
              </button>
              <button
                onClick={() => setHtmlMode('code')}
                className={`pb-1 px-2 text-sm font-semibold transition ${
                  htmlMode === 'code' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                HTML Editor code
              </button>
              <button
                onClick={() => setHtmlMode('file')}
                className={`pb-1 px-2 text-sm font-semibold transition ${
                  htmlMode === 'file' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Plain HTML File Upload
              </button>
            </div>

            {htmlMode === 'url' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://example.com/page-to-print"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {htmlMode === 'code' && (
              <textarea
                value={htmlCode}
                onChange={(e) => setHtmlCode(e.target.value)}
                rows={6}
                className="w-full p-4 font-mono text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="<h1>Paste raw HTML here</h1>"
              />
            )}
          </div>
        )}

        {/* File Drag and Drop Section */}
        {!(toolId === 'htmltopdf' && htmlMode !== 'file') && (
          <div className="mb-6">
            {!file ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl p-10 cursor-pointer hover:bg-slate-50 transition">
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-xs mb-3">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {inputLabel}
                </span>
                <span className="text-xs text-slate-400">
                  Select or drag and drop file up to 50MB
                </span>
                <input
                  type="file"
                  accept={inputAccept}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-slate-700 rounded-lg shadow-sm">
                    <FileText className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate max-w-md">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium px-3 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-start gap-2 p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl mb-6 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Run Button */}
        {!success && (
          <button
            onClick={handleConvert}
            disabled={loading || serverAvailable === false}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white shadow-md transition disabled:opacity-50 cursor-pointer ${
              colorClass === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
              colorClass === 'orange' ? 'bg-orange-600 hover:bg-orange-700' :
              colorClass === 'green' ? 'bg-green-600 hover:bg-green-700' :
              colorClass === 'sky' ? 'bg-sky-600 hover:bg-sky-700' :
              colorClass === 'rose' ? 'bg-rose-600 hover:bg-rose-700' :
              colorClass === 'teal' ? 'bg-teal-600 hover:bg-teal-700' :
              colorClass === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-700' :
              colorClass === 'slate' ? 'bg-slate-700 hover:bg-slate-800' :
              'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Running document engine...</span>
              </>
            ) : (
              <span>Start conversion sequence</span>
            )}
          </button>
        )}

        {/* Success / Download Field */}
        {success && (
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-3xl p-6 text-center animate-scale-in">
            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white mx-auto mb-4 shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-300 mb-1">
              Document Processed Successfully!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 truncate max-w-lg mx-auto">
              Ready to download: {resultFilename}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  setSuccess(false);
                  setResultBlob(null);
                  if (htmlMode !== 'file' && toolId === 'htmltopdf') {
                    // keep
                  } else {
                    setFile(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-white dark:hover:bg-slate-800 transition shadow-sm"
              >
                Process another file
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Download className="w-4 h-4" />
                <span>Download converted file</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
