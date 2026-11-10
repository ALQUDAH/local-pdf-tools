/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Guided workflows: an ordered list of tools. Each step opens with the previous step's
// result already loaded (see handoff.ts). Custom workflows are stored in this browser only.

import { useSyncExternalStore } from 'react';
import type { ActiveTool } from '../types';
import { clearLastResult } from './handoff';

export interface Workflow {
  id: string;
  name: string;
  steps: ActiveTool[];
  preset?: boolean;
}

export const PRESET_WORKFLOWS: Workflow[] = [
  { id: 'preset-merge-compress-protect', name: 'Merge, compress & protect', steps: ['merge', 'compress', 'protect'], preset: true },
  { id: 'preset-finalize', name: 'Finalize a document', steps: ['pagenumbers', 'watermark', 'flatten'], preset: true },
  { id: 'preset-clean-scan', name: 'Clean up a scan', steps: ['rotate', 'grayscale', 'compress'], preset: true },
];

const STORAGE_KEY = 'pdf-workflows';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function readCustom(): Workflow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((w) => w && typeof w.name === 'string' && Array.isArray(w.steps) && w.steps.length > 0)
      : [];
  } catch {
    return [];
  }
}

let custom: Workflow[] = readCustom();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    /* storage unavailable: keep in memory for this session */
  }
  notify();
}

export function saveWorkflow(name: string, steps: ActiveTool[]): Workflow {
  const wf: Workflow = { id: `wf-${Date.now().toString(36)}`, name: name.trim().slice(0, 60), steps };
  custom = [...custom, wf];
  persist();
  return wf;
}

export function deleteWorkflow(id: string) {
  custom = custom.filter((w) => w.id !== id);
  persist();
}

export function useCustomWorkflows(): Workflow[] {
  return useSyncExternalStore(subscribe, () => custom, () => custom);
}

// ---------------------------------------------------------------------------
// The workflow being run right now (in memory only)
// ---------------------------------------------------------------------------
export interface ActiveWorkflow {
  workflow: Workflow;
  /** Index of the step currently open */
  step: number;
}

let active: ActiveWorkflow | null = null;

export function startWorkflow(workflow: Workflow): ActiveTool {
  clearLastResult(); // an older result must not count as step 1
  active = { workflow, step: 0 };
  notify();
  return workflow.steps[0];
}

/** Moves to the next step. Returns its tool, or null when the workflow is finished. */
export function advanceWorkflow(): ActiveTool | null {
  if (!active) return null;
  const next = active.step + 1;
  if (next >= active.workflow.steps.length) return null;
  active = { ...active, step: next };
  notify();
  return active.workflow.steps[next];
}

export function stopWorkflow() {
  if (!active) return;
  active = null;
  notify();
}

export function useActiveWorkflow(): ActiveWorkflow | null {
  return useSyncExternalStore(subscribe, () => active, () => null);
}
