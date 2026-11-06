import { useState } from 'react';
import { ArrowLeft, Layers, Loader2, CheckCircle, FileText } from 'lucide-react';
import { flattenPdf, downloadFile, fileToArrayBuffer } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

import { tr } from '../i18n';
interface FlattenToolProps {
  onBack: () => void;
}

export default function FlattenTool({ onBack }: FlattenToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const buffer = await fileToArrayBuffer(file);
      const flattened = await flattenPdf(buffer);
      
      const newName = file.name.replace(/\.[^/.]+$/, "") + "_flattened.pdf";
      downloadFile(flattened, newName, 'application/pdf');
      
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to flatten PDF. Ensure the file is not encrypted."));
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
            <Layers className="w-6 h-6 text-emerald-500" />
            {tr("Flatten PDF")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Convert interactive form fields and annotations into permanent, non-editable visual content.")}
          </p>
        </div>

        {!file ? (
          <Dropzone
            onFilesSelected={(files) => setFile(files[0])}
            multiple={false}
            title={tr("Drop PDF to flatten")}
            description={tr("Upload a document containing form fields to convert to static text.")}
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg">
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

            {success ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{tr("File successfully flattened and downloaded!")}</span>
              </div>
            ) : (
              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
                {tr("Flatten PDF")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
