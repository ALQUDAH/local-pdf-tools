import { useState } from 'react';
import { ArrowLeft, Wrench, Loader2, CheckCircle, FileText } from 'lucide-react';
import { repairPdf, downloadFile, fileToArrayBuffer } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface RepairToolProps {
  onBack: () => void;
}

export default function RepairTool({ onBack }: RepairToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const buffer = await fileToArrayBuffer(file);
      const repaired = await repairPdf(buffer);
      
      const newName = file.name.replace(/\.[^/.]+$/, "") + "_repaired.pdf";
      downloadFile(repaired, newName, 'application/pdf');
      
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to repair PDF. The file may be heavily damaged or encrypted.');
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
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-sky-500" />
            Repair PDF
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Attempt to fix corrupted or damaged PDFs by rebuilding the cross-reference table and structure.
          </p>
        </div>

        {!file ? (
          <Dropzone
            onFilesSelected={(files) => setFile(files[0])}
            multiple={false}
            title="Drop corrupted PDF"
            description="Upload a damaged document for structural repair."
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-sky-500/10 text-sky-500 rounded-lg">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setSuccess(false); }}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600"
              >
                Change File
              </button>
            </div>

            {success ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">File successfully repaired and downloaded!</span>
              </div>
            ) : (
              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wrench className="w-5 h-5" />}
                Repair PDF
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
