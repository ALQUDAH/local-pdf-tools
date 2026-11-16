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

import { tr } from '../i18n';
import { recordResult } from '../lib/handoff';
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
  const [replacedCharacters, setReplacedCharacters] = useState(false);
  // null = checking, true = companion server reachable, false = static hosting (no server)
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  // Desktop app only: optional Gemini API key for Translate PDF
  const [isDesktop, setIsDesktop] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  const saveGeminiKey = async (key: string) => {
    setKeySaving(true);
    setKeyMessage(null);
    try {
      const res = await fetch('/api/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LPT-Desktop': '1' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setKeyConfigured(!!data.keyConfigured);
      setKeyInput('');
      setKeyMessage(data.keyConfigured ? tr("API key saved on this computer.") : tr("API key removed."));
    } catch {
      setKeyMessage(tr("Could not save the API key."));
    } finally {
      setKeySaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (res) => {
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (!cancelled) {
          setServerAvailable(!!data && data.status === 'healthy');
          setIsDesktop(!!data?.desktop);
          setKeyConfigured(!!data?.keyConfigured);
        }
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
      title = tr("PDF to Word");
      description = tr("Extract the text of a PDF into an editable Word document (.docx), one paragraph per line. Layout, images and fonts are not kept. Runs in your browser.");
      inputAccept = '.pdf';
      inputLabel = tr("Select a PDF File");
      apiEndpoint = '/api/convert/pdf-to-word';
      resultExt = 'docx';
      icon = <FileText className="w-8 h-8 text-blue-500" />;
      colorClass = 'blue';
      break;
    case 'pdftopowerpoint':
      title = tr("PDF to PowerPoint");
      description = tr("Turn each PDF page into a PowerPoint slide (.pptx) containing that page's text. Runs in your browser.");
      inputAccept = '.pdf';
      inputLabel = tr("Select a PDF File");
      apiEndpoint = '/api/convert/pdf-to-powerpoint';
      resultExt = 'pptx';
      icon = <Presentation className="w-8 h-8 text-orange-500" />;
      colorClass = 'orange';
      break;
    case 'pdftoexcel':
      title = tr("PDF to Excel");
      description = tr("Copy the text of a PDF into an Excel sheet (.xlsx), splitting columns at wide gaps. Works best for simple tables. Runs in your browser.");
      inputAccept = '.pdf';
      inputLabel = tr("Select a PDF File");
      apiEndpoint = '/api/convert/pdf-to-excel';
      resultExt = 'xlsx';
      icon = <FileSpreadsheet className="w-8 h-8 text-green-500" />;
      colorClass = 'green';
      break;
    case 'wordtopdf':
      title = tr("Word to PDF");
      description = tr("Convert the text of a Word document (.docx) into a clean PDF. Formatting and images are not kept. Runs in your browser.");
      inputAccept = '.docx';
      inputLabel = tr("Select a Word Document (.docx)");
      apiEndpoint = '/api/convert/word-to-pdf';
      resultExt = 'pdf';
      icon = <FileText className="w-8 h-8 text-sky-500" />;
      colorClass = 'sky';
      break;
    case 'powerpointtopdf':
      title = tr("PowerPoint to PDF");
      description = tr("Convert the text of each PowerPoint slide (.pptx) into a PDF page. Runs in your browser.");
      inputAccept = '.pptx';
      inputLabel = tr("Select a PowerPoint File (.pptx)");
      apiEndpoint = '/api/convert/powerpoint-to-pdf';
      resultExt = 'pdf';
      icon = <Presentation className="w-8 h-8 text-rose-500" />;
      colorClass = 'rose';
      break;
    case 'exceltopdf':
      title = tr("Excel to PDF");
      description = tr("Convert the sheets of an Excel file (.xlsx) into a readable PDF, one row per line. Runs in your browser.");
      inputAccept = '.xlsx';
      inputLabel = tr("Select an Excel Spreadsheet (.xlsx)");
      apiEndpoint = '/api/convert/excel-to-pdf';
      resultExt = 'pdf';
      icon = <FileSpreadsheet className="w-8 h-8 text-teal-500" />;
      colorClass = 'teal';
      break;
    case 'htmltopdf':
      title = tr("HTML/Website to PDF");
      description = tr("Convert HTML code or an HTML file into a text PDF in your browser. Fetching a web page by URL needs the self-hosted server.");
      inputAccept = '.html,.htm';
      inputLabel = tr("Select an HTML File (.html)");
      apiEndpoint = '/api/convert/html-to-pdf';
      resultExt = 'pdf';
      icon = <FileCode className="w-8 h-8 text-indigo-500" />;
      colorClass = 'indigo';
      break;
    case 'pdftopdfa':
      title = tr("PDF to PDF/A");
      description = tr("Prepare a PDF for long-term archiving (PDF/A-2b): adds archival metadata and an sRGB color profile. Fully compliant only if the PDF's fonts are already embedded. Runs in your browser.");
      inputAccept = '.pdf';
      inputLabel = tr("Select a PDF File");
      apiEndpoint = '/api/convert/pdf-to-pdfa';
      resultExt = 'pdf';
      icon = <ShieldCheck className="w-8 h-8 text-slate-500" />;
      colorClass = 'slate';
      break;
    case 'translatepdf':
      title = tr("Translate PDF AI");
      description = tr("Translate the text of a PDF with Google Gemini AI. Needs the self-hosted server or the desktop app with your own Gemini API key; the text is sent to Google.");
      inputAccept = '.pdf';
      inputLabel = tr("Select a PDF File");
      apiEndpoint = '/api/convert/translate-pdf';
      resultExt = 'pdf';
      icon = <Languages className="w-8 h-8 text-violet-500" />;
      colorClass = 'violet';
      break;
    default:
      title = tr("Document Converter");
      description = tr("Convert files seamlessly utilizing high fidelity fullstack libraries.");
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(false);
      setResultBlob(null);
    }
  };

  // Only AI translation and fetching a web page by URL need the server; everything else runs in the browser.
  const needsServer = toolId === 'translatepdf' || (toolId === 'htmltopdf' && htmlMode === 'url');

  const readFileText = (f: File) => f.text();

  const handleConvert = async () => {
    if (toolId !== 'htmltopdf' || htmlMode === 'file') {
      if (!file) {
        setError(tr("Please choose a file to convert."));
        return;
      }
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    setReplacedCharacters(false);

    try {
      const originalName = file ? file.name : 'rendered_output';
      const cleanName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      const outFilename = `${cleanName}_converted.${resultExt}`;

      if (!needsServer) {
        // In-browser conversion: the file never leaves the device
        const conv = await import('../lib/officeConvert');
        let result: { blob: Blob; replacedCharacters?: boolean };
        if (toolId === 'htmltopdf') {
          const html = htmlMode === 'code' ? htmlCode : await readFileText(file as File);
          if (!html.trim()) {
            setError(tr("Please input valid HTML code snippet."));
            return;
          }
          result = await conv.htmlToPdf(html);
        } else {
          const data = await (file as File).arrayBuffer();
          switch (toolId) {
            case 'pdftoword': result = await conv.pdfToWord(data); break;
            case 'pdftopowerpoint': result = await conv.pdfToPowerPoint(data); break;
            case 'pdftoexcel': result = await conv.pdfToExcel(data); break;
            case 'wordtopdf': result = await conv.wordToPdf(data); break;
            case 'powerpointtopdf': result = await conv.powerPointToPdf(data); break;
            case 'exceltopdf': result = await conv.excelToPdf(data); break;
            case 'pdftopdfa': result = await conv.pdfToPdfA(data, originalName); break;
            default: throw new Error('Unsupported conversion');
          }
        }
        setResultBlob(result.blob);
        setReplacedCharacters(!!result.replacedCharacters);
        setResultFilename(toolId === 'pdftopdfa' ? `${cleanName}_pdfa.pdf` : outFilename);
        setSuccess(true);
        return;
      }

      let response: Response;
      if (toolId === 'htmltopdf') {
        if (!urlInput.trim()) {
          setError(tr("Please enter a valid website address."));
          return;
        }
        response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urlInput: urlInput }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', file as File);
        formData.append('targetLang', targetLang);
        response = await fetch(apiEndpoint, { method: 'POST', body: formData });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || tr("Conversion failed."));
      }

      setResultBlob(await response.blob());
      setResultFilename(outFilename);
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ? `${tr("Conversion failed.")} ${err.message}` : tr("Conversion failed."));
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
    recordResult(resultBlob, resultFilename);
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
          <span>{tr("Back to Dashboard")}</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-full font-semibold">
          {needsServer ? <Server className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>{needsServer ? tr("Self-Hosted Server Tool") : tr("100% Client-Side")}</span>
        </div>
      </div>

      {needsServer && serverAvailable === false && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{tr("This tool needs the companion server, which isn't running here.")}</p>
            <p>
              {tr("You're using the static (browser-only) version.")} {title} {tr("relies on Node.js libraries, so it only works when you self-host the app with")} <code className="font-mono">npm run dev</code> {tr("or Docker. Your file has not been sent anywhere. All other tools on the dashboard work fully in your browser.")}
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

        {/* Desktop app: Gemini API key for AI translation */}
        {toolId === 'translatepdf' && isDesktop && (
          <div className="mb-6 bg-violet-50/60 dark:bg-violet-950/20 p-4 rounded-2xl border border-violet-100 dark:border-violet-900/40 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label htmlFor="gemini-key" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                {tr("Gemini API key")}
              </label>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${keyConfigured ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                {keyConfigured ? tr("Configured") : tr("Not set: you'll get an untranslated preview")}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {tr("Translation uses Google Gemini, so the document's text is sent to Google when you translate. Get a free key at aistudio.google.com. The key is stored only on this computer.")}
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                id="gemini-key"
                type="password"
                autoComplete="off"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={keyConfigured ? tr("Enter a new key to replace it") : tr("Paste your API key")}
                className="flex-1 min-w-48 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={() => saveGeminiKey(keyInput)}
                disabled={keySaving || !keyInput.trim()}
                className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {tr("Save key")}
              </button>
              {keyConfigured && (
                <button
                  type="button"
                  onClick={() => saveGeminiKey('')}
                  disabled={keySaving}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
                >
                  {tr("Remove key")}
                </button>
              )}
            </div>
            {keyMessage && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{keyMessage}</p>}
          </div>
        )}

        {/* Translation Language Selection */}
        {toolId === 'translatepdf' && (
          <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              {tr("Select Target Language")}
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
                {tr("Web Address (URL)")}
              </button>
              <button
                onClick={() => setHtmlMode('code')}
                className={`pb-1 px-2 text-sm font-semibold transition ${
                  htmlMode === 'code' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr("HTML Editor code")}
              </button>
              <button
                onClick={() => setHtmlMode('file')}
                className={`pb-1 px-2 text-sm font-semibold transition ${
                  htmlMode === 'file' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr("Plain HTML File Upload")}
              </button>
            </div>

            {htmlMode === 'url' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={tr("https://example.com/page-to-print")}
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
                placeholder={tr("<h1>Paste raw HTML here</h1>")}
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
                  {tr("Select or drag and drop file up to 50MB")}
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
                      {(file.size / 1024 / 1024).toFixed(2)} {tr("MB")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium px-3 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                >
                  {tr("Remove")}
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
            disabled={loading || (needsServer && serverAvailable === false)}
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
                <span>{tr("Running document engine...")}</span>
              </>
            ) : (
              <span>{tr("Start conversion sequence")}</span>
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
              {tr("Document Processed Successfully!")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 truncate max-w-lg mx-auto">
              {tr("Ready to download:")} {resultFilename}
            </p>
            {replacedCharacters && (
              <p role="status" className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3 py-2 mb-6 max-w-lg mx-auto">
                {tr("Some characters (for example Arabic or Chinese) can't be shown by this basic text conversion and were replaced.")}
              </p>
            )}
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
                {tr("Process another file")}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                <Download className="w-4 h-4" />
                <span>{tr("Download converted file")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
