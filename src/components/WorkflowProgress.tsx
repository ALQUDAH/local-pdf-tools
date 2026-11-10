/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Workflow as WorkflowIcon, X } from 'lucide-react';
import type { ActiveTool } from '../types';
import { tr } from '../i18n';
import { stopWorkflow, useActiveWorkflow } from '../lib/workflows';

/** Shows where you are in a running workflow, above the current tool. */
export default function WorkflowProgress({ toolTitle }: { toolTitle: (id: ActiveTool) => string }) {
  const active = useActiveWorkflow();
  if (!active) return null;
  const { steps, name, preset } = active.workflow;
  return (
    <div
      id="workflow-progress"
      className="mb-6 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 text-xs"
    >
      <WorkflowIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      <span className="font-bold text-emerald-800 dark:text-emerald-300">{preset ? tr(name) : name}</span>
      <span className="text-emerald-700/80 dark:text-emerald-400/80">{tr("Step {0} of {1}", active.step + 1, steps.length)}</span>
      <ol className="flex flex-wrap items-center gap-1">
        {steps.map((s, i) => (
          <li
            key={i}
            aria-current={i === active.step ? 'step' : undefined}
            className={`px-2 py-0.5 rounded-md ${
              i === active.step
                ? 'bg-emerald-600 text-white font-semibold'
                : i < active.step
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 line-through'
                  : 'bg-white dark:bg-slate-900 text-slate-500'
            }`}
          >
            {toolTitle(s)}
          </li>
        ))}
      </ol>
      <button
        onClick={() => stopWorkflow()}
        aria-label={tr("Stop workflow")}
        title={tr("Stop workflow")}
        className="ms-auto p-1 text-emerald-700/70 hover:text-rose-500 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
