import { useState } from 'react';
import { ArrowLeft, Frame, Loader2, CheckCircle, FileText } from 'lucide-react';
import { addMarginPdf, downloadFile, fileToArrayBuffer } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface MarginToolProps {
  onBack: () => void;
}

export default function MarginTool({ onBack }: MarginToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [marginPercent, setMarginPercent] = useState(10);

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const buffer = await fileToArrayBuffer(file);
      const output = await addMarginPdf(buffer, marginPercent);
      
      const newName = file.name.replace(/\.[^/.]+$/, "") + `_margin.pdf`;
      downloadFile(output, newName, 'application/pdf');
      
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to add margins.');
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
            <Frame className="w-6 h-6 text-fuchsia-500" />
            Add Margins
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Add extra white space around your document contents for binding or hole punching.
          </p>
        </div>

        {!file ? (
          <Dropzone
            onFilesSelected={(files) => setFile(files[0])}
            multiple={false}
            title="Drop PDF to add margins"
            description="Upload the document you want to pad with extra space."
          />
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-fuchsia-500/10 text-fuchsia-500 rounded-lg">
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
            
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Margin Size (percentage of page)
              </label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="30" 
                  value={marginPercent} 
                  onChange={(e) => setMarginPercent(parseInt(e.target.value))}
                  className="w-full accent-fuchsia-500"
                />
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg font-semibold w-16 text-center">
                  {marginPercent}%
                </span>
              </div>
            </div>

            {success ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">File successfully padded and downloaded!</span>
              </div>
            ) : (
              <button
                onClick={handleProcess}
                disabled={loading}
                className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Frame className="w-5 h-5" />}
                Add Margins
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
