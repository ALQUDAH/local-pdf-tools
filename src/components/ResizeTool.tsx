import { useState } from 'react';
import { ArrowLeft, Maximize, Loader2, CheckCircle, FileText } from 'lucide-react';
import { resizePdf, downloadFile, fileToArrayBuffer } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

import { tr } from '../i18n';
interface ResizeToolProps {
  onBack: () => void;
}

export default function ResizeTool({ onBack }: ResizeToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [targetSize, setTargetSize] = useState<'A4' | 'Letter' | 'Legal'>('A4');

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const buffer = await fileToArrayBuffer(file);
      const output = await resizePdf(buffer, { targetSize });
      
      const newName = file.name.replace(/\.[^/.]+$/, "") + `_${targetSize}.pdf`;
      downloadFile(output, newName, 'application/pdf');
      
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to resize PDF."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Maximize className="w-6 h-6 text-indigo-500" />
            {tr("Resize PDF")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Change the physical dimensions of your document pages to standard sizes.")}
          </p>
        </div>

        {!file ? (
          <Dropzone
            onFilesSelected={(files) => setFile(files[0])}
            multiple={false}
            title={tr("Drop PDF to resize")}
            description={tr("Upload the document whose dimensions you want to change.")}
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} {tr("MB")}</p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setSuccess(false); }}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600"
              >
                {tr("Change File")}
              </button>
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">{tr("Target Page Size")}</label>
              <div className="grid grid-cols-3 gap-3">
                {['A4', 'Letter', 'Legal'].map(size => (
                  <button
                    key={size}
                    onClick={() => setTargetSize(size as any)}
                    className={`py-3 rounded-xl border font-semibold text-sm transition-colors ${
                      targetSize === size 
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {success ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{tr("File successfully resized and downloaded!")}</span>
              </div>
            ) : (
              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Maximize className="w-5 h-5" />}
                {tr("Resize Document")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
