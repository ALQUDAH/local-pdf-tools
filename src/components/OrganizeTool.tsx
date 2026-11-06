/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ArrowLeft, CheckCircle, FileCode, ArrowLeftRight, ArrowLeft as LeftIcon, ArrowRight, Trash2, PlusCircle, Loader2, RefreshCw, Download, Undo } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, organizePdfPages, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface OrganizeToolProps {
  onBack: () => void;
}

interface PageOp {
  id: string;
  type: 'existing' | 'blank';
  originalIndex?: number; // 0-based page index in original PDF
}

interface SortablePageItemProps {
  key?: string;
  element: PageOp;
  index: number;
  totalLength: number;
  fileDetails: { previews: string[] };
  onMoveLeft: (idx: number) => void;
  onMoveRight: (idx: number) => void;
  onInsertBlank: (idx: number) => void;
  onDelete: (idx: number) => void;
}

function SortablePageItem({ element, index, totalLength, fileDetails, onMoveLeft, onMoveRight, onInsertBlank, onDelete }: SortablePageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const isBlank = element.type === 'blank';
  const origIdx = element.originalIndex ?? 0;
  const thumb = !isBlank && origIdx < fileDetails.previews.length ? fileDetails.previews[origIdx] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`organize-node-item-${index}`}
      className={`border rounded-xl p-3 shadow-sm flex flex-col justify-between group hover:shadow-md transition-all text-center relative bg-white dark:bg-slate-900 ${
        isBlank ? 'border-dashed border-amber-400/80 bg-amber-500/[0.01]' : 'border-slate-200/60 dark:border-slate-800'
      }`}
    >
      {/* Grid thumbnail item - draggable area */}
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing relative aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-lg border flex items-center justify-center overflow-hidden mb-3"
      >
        {!isBlank && thumb ? (
          <img
            src={thumb}
            alt={`Orig page ${origIdx + 1}`}
            className="w-full h-full object-contain pointer-events-none select-none bg-white"
            referrerPolicy="no-referrer"
          />
        ) : isBlank ? (
          <div className="flex flex-col items-center gap-1 text-amber-500 dark:text-amber-400 font-bold font-mono text-[10px] uppercase select-none">
            <PlusCircle className="w-6 h-6 animate-pulse" />
            <span>Blank Spacer</span>
          </div>
        ) : (
          <div className="text-slate-400 font-bold text-xs select-none">
            P. {origIdx + 1}
          </div>
        )}

        {/* Order label info */}
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-slate-900/80 text-white rounded font-mono text-[9px] font-bold">
          PAGE {index + 1}
        </div>

        {!isBlank && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-slate-200/90 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded font-mono text-[9px] font-bold">
            Source P. {origIdx + 1}
          </div>
        )}
      </div>

      {/* Control panel for single page node - NOT draggable */}
      <div className="space-y-1.5 z-20">
        <div className="flex gap-0.5 justify-between bg-slate-100 dark:bg-slate-950 p-1 rounded-lg">
          <button
            onClick={() => onMoveLeft(index)}
            disabled={index === 0}
            id={`btn-move-left-${index}`}
            className="p-1 px-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-20 cursor-pointer"
            title="Move Page Back"
          >
            <LeftIcon className="w-3 h-3" />
          </button>

          <button
            onClick={() => onInsertBlank(index)}
            id={`btn-insert-blank-${index}`}
            className="p-1 px-1.5 text-emerald-500 hover:text-emerald-600 cursor-pointer"
            title="Insert Blank After"
          >
            <PlusCircle className="w-3 h-3" />
          </button>

          <button
            onClick={() => onDelete(index)}
            id={`btn-delete-node-${index}`}
            className="p-1 px-1.5 text-rose-500 hover:text-rose-600 cursor-pointer"
            title="Delete Page"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          <button
            onClick={() => onMoveRight(index)}
            disabled={index === totalLength - 1}
            id={`btn-move-right-${index}`}
            className="p-1 px-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-20 cursor-pointer"
            title="Move Page Forward"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrganizeTool({ onBack }: OrganizeToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Ordered sequence of operations
  const [sequence, setSequence] = useState<PageOp[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setSequence((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setSuccess(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      // Grab as many previews as possible (up to 30)
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 30);

      const items: PageOp[] = Array.from({ length: pageCount }).map((_, idx) => ({
        id: Math.random().toString(36).substring(2, 9),
        type: 'existing',
        originalIndex: idx,
      }));

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });

      setSequence(items);
    } catch (err) {
      console.error(err);
      alert('Error parsing PDF page sequence details.');
    } finally {
      setLoading(false);
    }
  };

  const movePage = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === sequence.length - 1) return;

    const target = direction === 'left' ? index - 1 : index + 1;
    const updated = [...sequence];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setSequence(updated);
  };

  const deletePage = (index: number) => {
    setSequence((prev) => prev.filter((_, idx) => idx !== index));
    setSuccess(false);
  };

  const insertBlank = (index: number) => {
    const updated = [...sequence];
    const blankOp: PageOp = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'blank',
    };
    // Insert after current index
    updated.splice(index + 1, 0, blankOp);
    setSequence(updated);
    setSuccess(false);
  };

  const appendBlankToBottom = () => {
    setSequence((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        type: 'blank',
      },
    ]);
    setSuccess(false);
  };

  const handleApplyOrganize = async () => {
    if (!file || sequence.length === 0) return;
    setLoading(true);

    try {
      const compiledBytes = await organizePdfPages(file.arrayBuffer, sequence);
      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_organized.pdf`;
      
      downloadFile(compiledBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to output organized PDF pages.');
    } finally {
      setLoading(false);
    }
  };

  const resetAllFilters = () => {
    if (!file) return;
    const originalSequence: PageOp[] = Array.from({ length: file.pageCount }).map((_, idx) => ({
      id: Math.random().toString(36).substring(2, 9),
      type: 'existing',
      originalIndex: idx,
    }));
    setSequence(originalSequence);
    setSuccess(false);
  };

  const resetTool = () => {
    setFile(null);
    setSequence([]);
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-organize-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-semibold">
          Local Organize Engine
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Organize PDF Pages</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Reorder, delete, replicate, or insert blank spacer pages visually to refine your PDF package flows.
            Drag and drop pages to arrange them.
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="organize-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title="Upload PDF to organize pages"
              description="Drop a document to manipulate and arrange individual pages visually."
            />
          </div>
        )}

        {/* Loader */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            <span>Processing structural edits and exporting fresh PDF...</span>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">Successfully Compiled!</span> The modified organized document has been downloaded.
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-organize-reset"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start New
            </button>
          </div>
        )}

        {/* Editing Grid interface */}
        {file && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-4 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold font-mono text-slate-400 uppercase truncate max-w-xs md:max-w-md">
                  {file.name} ({formatSize(file.size)})
                </span>
              </div>

              {/* Action utilities */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={appendBlankToBottom}
                  id="btn-organize-append-blank"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-500" /> Add Blank Page
                </button>
                <button
                  onClick={resetAllFilters}
                  id="btn-organize-reset-sequence"
                  className="px-3 py-1.5 hover:bg-rose-500/10 text-rose-500 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Undo className="w-3.5 h-3.5" /> Reset Layout
                </button>
              </div>
            </div>

            {/* Structured Page sequence grid */}
            {sequence.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-50 dark:bg-slate-950/25 rounded-2xl border border-dashed">
                All pages removed. Please add a blank page or reset custom selections.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sequence.map(item => item.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 p-5 bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800/60 max-h-[500px] overflow-y-auto">
                    {sequence.map((element, index) => (
                      <SortablePageItem
                        key={element.id}
                        element={element}
                        index={index}
                        totalLength={sequence.length}
                        fileDetails={file}
                        onMoveLeft={() => movePage(index, 'left')}
                        onMoveRight={() => movePage(index, 'right')}
                        onInsertBlank={insertBlank}
                        onDelete={deletePage}
                       />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Form actions */}
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl">
              <button
                onClick={resetTool}
                id="btn-organize-change-sheet"
                className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
              >
                Change Document
              </button>

              <button
                onClick={handleApplyOrganize}
                disabled={loading || sequence.length === 0}
                id="btn-organize-submit"
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Generate Organized PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
