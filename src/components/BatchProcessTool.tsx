/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle, Download, FileText, ListChecks, Loader2, Play, Plus, Trash2, X } from 'lucide-react';
import JSZip from 'jszip';
import Dropzone from './Dropzone';
import { tr } from '../i18n';
import { downloadFile } from '../lib/pdfUtils';
import { STEP_KINDS, defaultStep, runBatch, validateSteps, type BatchProgress, type BatchResult, type BatchStep, type BatchStepKind } from '../lib/batch';

interface BatchProcessToolProps {
  onBack: () => void;
}

const STEP_LABEL = (kind: BatchStepKind): string =>
  ({
    compress: tr('Compress'),
    rotate: tr('Rotate all pages'),
    watermark: tr('Watermark'),
    pagenumbers: tr('Page numbers'),
    resize: tr('Resize pages'),
    margins: tr('Add margins'),
    flatten: tr('Flatten forms'),
    stripmetadata: tr('Remove metadata'),
    repair: tr('Repair'),
    pdfa: tr('Prepare PDF/A'),
    protect: tr('Password-protect'),
  })[kind];

const PROBLEM_TEXT: Record<string, () => string> = {
  'no-steps': () => tr('Add at least one step.'),
  'protect-not-last': () => tr('Password protection must be the last step.'),
  'protect-no-password': () => tr('Enter a password for the protection step.'),
  'watermark-no-text': () => tr('Enter the watermark text.'),
};

const STORAGE_KEY = 'pdf-batch-steps';

function loadSavedSteps(): BatchStep[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    // Passwords are never stored
    return saved.filter((s) => s && STEP_KINDS.includes(s.kind)).map((s) => (s.kind === 'protect' ? { ...s, password: '' } : s));
  } catch {
    return [];
  }
}

const inputCls = 'px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700';

export default function BatchProcessTool({ onBack }: BatchProcessToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [steps, setSteps] = useState<BatchStep[]>(() => {
    const saved = loadSavedSteps();
    return saved.length ? saved : [defaultStep('compress')];
  });
  const [mergeFirst, setMergeFirst] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(steps.map((s) => (s.kind === 'protect' ? { ...s, password: '' } : s))));
    } catch {
      /* storage unavailable */
    }
  }, [steps]);

  const problems = validateSteps(steps);
  const update = (i: number, patch: Partial<BatchStep>) =>
    setSteps(steps.map((s, j) => (j === i ? ({ ...s, ...patch } as BatchStep) : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSteps(next);
  };

  const run = async () => {
    setRunning(true);
    setResults(null);
    try {
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      setResults(await runBatch(inputs, steps, { mergeFirst, onProgress: setProgress }));
    } catch (err) {
      setResults([{ name: '', error: (err as Error).message }]);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const ok = results?.filter((r) => r.bytes) ?? [];
  const failed = results?.filter((r) => r.error) ?? [];

  const downloadZip = async () => {
    const zip = new JSZip();
    ok.forEach((r) => zip.file(r.name, r.bytes!));
    const blob = await zip.generateAsync({ type: 'uint8array' });
    downloadFile(blob, 'processed_pdfs.zip', 'application/zip');
  };

  const renderOptions = (step: BatchStep, i: number) => {
    switch (step.kind) {
      case 'compress':
        return (
          <select aria-label={tr('Compression level')} className={inputCls} value={step.level} onChange={(e) => update(i, { level: e.target.value as never })}>
            <option value="extreme">{tr('Extreme Compression')}</option>
            <option value="recommended">{tr('Recommended Compression')}</option>
            <option value="light">{tr('Light Compression')}</option>
          </select>
        );
      case 'rotate':
        return (
          <select aria-label={tr('Rotation')} className={inputCls} value={step.degrees} onChange={(e) => update(i, { degrees: Number(e.target.value) as never })}>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        );
      case 'watermark':
        return (
          <>
            <input aria-label={tr('Watermark Text')} className={`${inputCls} w-36`} value={step.text} maxLength={60} onChange={(e) => update(i, { text: e.target.value })} />
            <select aria-label={tr('Opacity')} className={inputCls} value={step.opacity} onChange={(e) => update(i, { opacity: Number(e.target.value) })}>
              <option value={0.15}>15%</option>
              <option value={0.25}>25%</option>
              <option value={0.4}>40%</option>
            </select>
          </>
        );
      case 'pagenumbers':
        return (
          <>
            <select aria-label={tr('Running Text Formula')} className={inputCls} value={step.format} onChange={(e) => update(i, { format: e.target.value as never })}>
              <option value="page-n-of-total">{tr('Page {0} of {1}', 'X', 'Y')}</option>
              <option value="page-n">{tr('Page {0}', 'X')}</option>
              <option value="n">X</option>
            </select>
            <select aria-label={tr('Page Positioning Grid')} className={inputCls} value={step.position} onChange={(e) => update(i, { position: e.target.value as never })}>
              <option value="bottom-center">{tr('Bottom-Center Margins')}</option>
              <option value="bottom-right">{tr('Bottom-Right Margins')}</option>
              <option value="top-right">{tr('Top-Right Margins')}</option>
            </select>
          </>
        );
      case 'resize':
        return (
          <select aria-label={tr('Target Page Size')} className={inputCls} value={step.size} onChange={(e) => update(i, { size: e.target.value as never })}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        );
      case 'margins':
        return (
          <select aria-label={tr('Margin Size (percentage of page)')} className={inputCls} value={step.percent} onChange={(e) => update(i, { percent: Number(e.target.value) })}>
            {[5, 10, 15, 20].map((p) => (
              <option key={p} value={p}>{p}%</option>
            ))}
          </select>
        );
      case 'protect':
        return (
          <input
            type="password"
            autoComplete="new-password"
            aria-label={tr('Passphrase to Encrypt PDF')}
            placeholder={tr('Type access restriction password...')}
            className={`${inputCls} w-44`}
            value={step.password}
            onChange={(e) => update(i, { password: e.target.value })}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-colors">
        <ArrowLeft className="w-4 h-4" /> {tr('Back to Dashboard')}
      </button>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-emerald-500" /> {tr('Batch Processing')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr('Run the same steps on many PDFs at once, then download them all as a ZIP. Everything happens in your browser.')}
          </p>
        </div>

        {/* 1. Files */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tr('1. Files')}</h3>
          <Dropzone
            onFilesSelected={(added) => {
              setFiles((prev) => [...prev, ...added]);
              setResults(null);
            }}
            multiple
            title={tr('Drop PDFs to process')}
          />
          {files.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl max-h-48 overflow-y-auto" id="batch-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={tr('Remove')} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Steps */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tr('2. Steps (run in this order)')}</h3>
          <ol className="space-y-2" id="batch-steps">
            {steps.map((step, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800" data-step={step.kind}>
                <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 me-1">{STEP_LABEL(step.kind)}</span>
                {renderOptions(step, i)}
                <span className="ms-auto flex items-center gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr('Move up')} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={tr('Move down')} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={tr('Remove step')} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            {STEP_KINDS.map((kind) => (
              <button
                key={kind}
                onClick={() => setSteps([...steps, defaultStep(kind)])}
                disabled={steps.length >= 10}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> {STEP_LABEL(kind)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={mergeFirst} onChange={(e) => setMergeFirst(e.target.checked)} id="batch-merge-first" />
            {tr('Merge all files into one PDF first')}
          </label>
        </section>

        {/* 3. Run */}
        <section className="space-y-3">
          {problems.length > 0 && files.length > 0 && (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {PROBLEM_TEXT[problems[0]]?.() ?? problems[0]}
            </p>
          )}
          <button
            onClick={run}
            disabled={running || files.length === 0 || problems.length > 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {running && progress
              ? tr('File {0} of {1} · step {2} of {3}', progress.fileIndex + 1, progress.fileCount, progress.stepIndex + 1, progress.stepCount)
              : tr('Process {0} files', mergeFirst && files.length > 1 ? 1 : files.length)}
          </button>
        </section>

        {/* Results */}
        {results && (
          <section className="space-y-3" id="batch-results">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-500" /> {tr('{0} processed, {1} failed', ok.length, failed.length)}
              </p>
              {ok.length > 1 && (
                <button onClick={downloadZip} className="ms-auto inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                  <Download className="w-4 h-4" /> {tr('Download all as ZIP')}
                </button>
              )}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
              {results.map((r, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {r.bytes ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                  <span className="truncate flex-1">{r.name}</span>
                  {r.bytes ? (
                    <button onClick={() => downloadFile(r.bytes!, r.name, 'application/pdf')} className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer">
                      {tr('Download')}
                    </button>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      {r.error === 'encrypted' ? tr('Password-protected: unlock it first') : tr('Failed: {0}', r.error || '')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
