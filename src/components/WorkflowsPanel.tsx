/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowRight, Play, Plus, Trash2, Workflow as WorkflowIcon, X } from 'lucide-react';
import type { ActiveTool } from '../types';
import { tr } from '../i18n';
import { CHAINABLE_TOOLS } from './ContinueBar';
import { PRESET_WORKFLOWS, deleteWorkflow, saveWorkflow, startWorkflow, useCustomWorkflows, type Workflow } from '../lib/workflows';

interface WorkflowsPanelProps {
  toolTitle: (id: ActiveTool) => string;
  onStart: (firstTool: ActiveTool) => void;
}

export default function WorkflowsPanel({ toolTitle, onStart }: WorkflowsPanelProps) {
  const custom = useCustomWorkflows();
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<ActiveTool[]>([]);

  const start = (wf: Workflow) => onStart(startWorkflow(wf));
  const resetBuilder = () => {
    setBuilding(false);
    setName('');
    setSteps([]);
  };

  const card = (wf: Workflow) => (
    <div
      key={wf.id}
      className="flex flex-col justify-between gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-xs"
      data-workflow={wf.id}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{wf.preset ? tr(wf.name) : wf.name}</h3>
          {!wf.preset && (
            <button
              onClick={() => deleteWorkflow(wf.id)}
              aria-label={tr("Delete workflow")}
              title={tr("Delete workflow")}
              className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {wf.steps.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <ArrowRight className="w-3 h-3 text-slate-300" />}
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">{toolTitle(s)}</span>
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => start(wf)}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
      >
        <Play className="w-3.5 h-3.5" /> {tr("Start workflow")}
      </button>
    </div>
  );

  return (
    <section className="space-y-4" aria-labelledby="workflows-heading">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="workflows-heading" className="text-sm font-bold font-mono tracking-widest text-slate-400 dark:text-slate-500 uppercase flex items-center gap-2">
          <WorkflowIcon className="w-4 h-4" /> {tr("Workflows")}
        </h2>
        {!building && (
          <button
            onClick={() => setBuilding(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> {tr("Create workflow")}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 px-1 -mt-2">
        {tr("Run several tools in a row. Each step opens with the previous result already loaded.")}
      </p>

      {building && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-3" id="workflow-builder">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{tr("New workflow")}</h3>
            <button onClick={resetBuilder} aria-label={tr("Cancel")} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("Workflow name")}
            aria-label={tr("Workflow name")}
            maxLength={60}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500"
          />
          <div className="flex flex-wrap items-center gap-1 min-h-8">
            {steps.length === 0 && <span className="text-xs text-slate-400">{tr("Add at least two steps below.")}</span>}
            {steps.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <ArrowRight className="w-3 h-3 text-slate-300" />}
                <span className="inline-flex items-center gap-1 ps-2 pe-1 py-0.5 text-xs rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  {toolTitle(s)}
                  <button
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    aria-label={tr("Remove step")}
                    className="p-0.5 hover:text-rose-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            {CHAINABLE_TOOLS.map((t) => (
              <button
                key={t}
                onClick={() => setSteps([...steps, t])}
                disabled={steps.length >= 8}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                + {toolTitle(t)}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              saveWorkflow(name, steps);
              resetBuilder();
            }}
            disabled={!name.trim() || steps.length < 2}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {tr("Save workflow")}
          </button>
          <p className="text-[11px] text-slate-400">{tr("Workflows are saved in this browser only.")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...custom, ...PRESET_WORKFLOWS].map(card)}
      </div>
    </section>
  );
}
