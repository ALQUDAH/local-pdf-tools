/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowRight, CheckCircle, ChevronDown, X } from 'lucide-react';
import type { ActiveTool } from '../types';
import { tr } from '../i18n';
import { clearLastResult, continueWithLastResult, useLastResult } from '../lib/handoff';
import { advanceWorkflow, stopWorkflow, useActiveWorkflow } from '../lib/workflows';

// Tools whose first step is uploading a PDF, so they can take the previous result directly.
export const CHAINABLE_TOOLS: ActiveTool[] = [
  'compress', 'protect', 'watermark', 'pagenumbers', 'merge', 'split', 'rotate', 'organize',
  'ocr', 'metadata', 'flatten', 'grayscale', 'crop', 'redact', 'bates', 'nup', 'resize',
  'addmargin', 'repair', 'images', 'extractor', 'formfiller', 'formbuilder', 'unlockpdf',
];
const SUGGESTED: ActiveTool[] = ['compress', 'protect', 'watermark', 'pagenumbers', 'merge'];

interface ContinueBarProps {
  activeTool: ActiveTool;
  toolTitle: (id: ActiveTool) => string;
  onContinue: (tool: ActiveTool) => void;
}

export default function ContinueBar({ activeTool, toolTitle, onContinue }: ContinueBarProps) {
  const result = useLastResult();
  const workflow = useActiveWorkflow();
  const [showAll, setShowAll] = useState(false);
  if (!result || activeTool === 'dashboard') return null;

  // Guided workflow: offer exactly the next step
  if (workflow) {
    const { steps, name, preset } = workflow.workflow;
    const title = preset ? tr(name) : name;
    const isLast = workflow.step >= steps.length - 1;
    const next = steps[workflow.step + 1];
    return (
      <div
        role="region"
        aria-label={tr("Workflow")}
        className="fixed bottom-20 md:bottom-4 inset-x-4 md:inset-x-auto md:start-1/2 md:-translate-x-1/2 rtl:md:translate-x-1/2 z-40 max-w-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 shadow-xl rounded-2xl p-3 md:p-4 animate-fade-in"
        id="continue-bar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          {isLast ? (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-200 me-1">
                {tr("Workflow complete: {0}", title)}
              </p>
              <button
                onClick={() => {
                  stopWorkflow();
                  clearLastResult();
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {tr("Done")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-200 me-1">
                {tr("Step {0} of {1} done.", workflow.step + 1, steps.length)}
              </p>
              <button
                onClick={() => {
                  if (!continueWithLastResult()) return;
                  const tool = advanceWorkflow();
                  if (tool) onContinue(tool);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {tr("Next: {0}", toolTitle(next))} <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => stopWorkflow()}
                className="ms-auto px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {tr("Stop workflow")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const go = (tool: ActiveTool) => {
    if (continueWithLastResult()) {
      setShowAll(false);
      onContinue(tool);
    }
  };
  const suggested = SUGGESTED.filter((t) => t !== activeTool).slice(0, 4);
  const others = CHAINABLE_TOOLS.filter((t) => t !== activeTool && !suggested.includes(t));

  return (
    <div
      role="region"
      aria-label={tr("Continue with another tool")}
      className="fixed bottom-20 md:bottom-4 inset-x-4 md:inset-x-auto md:start-1/2 md:-translate-x-1/2 rtl:md:translate-x-1/2 z-40 max-w-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 shadow-xl rounded-2xl p-3 md:p-4 animate-fade-in"
      id="continue-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
        <p className="text-sm text-slate-700 dark:text-slate-200 me-1 min-w-0">
          <span className="font-semibold truncate inline-block max-w-48 align-bottom" title={result.name}>{result.name}</span>{' '}
          {tr("is ready. Continue with:")}
        </p>
        {suggested.map((tool) => (
          <button
            key={tool}
            onClick={() => go(tool)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
          >
            {toolTitle(tool)} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ))}
        <button
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          {tr("More tools")} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={() => clearLastResult()}
          aria-label={tr("Dismiss")}
          title={tr("Dismiss")}
          className="ms-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {showAll && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {others.map((tool) => (
            <button
              key={tool}
              onClick={() => go(tool)}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {toolTitle(tool)}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{tr("The file stays on your device and is passed to the next tool in memory.")}</p>
    </div>
  );
}
