import { useState } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  FileCode, 
  CheckCircle, 
  FilePlus2, 
  Loader2, 
  Layers, 
  Plus, 
  FolderArchive,
  Info,
  GripVertical
} from 'lucide-react';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, mergePdfs, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import JSZip from 'jszip';

import { tr } from '../i18n';
interface MergeToolProps {
  onBack: () => void;
}

interface MergeGroup {
  id: string;
  name: string;
}

interface SortableFileItemProps {
  key?: string;
  file: PDFFile;
  formatSize: (bytes: number) => string;
  onRemove: (id: string) => void;
  index: number;
  totalLength: number;
  onMoveFlat: (index: number, direction: 'up' | 'down') => void;
}

function SortableFileItem({ file, formatSize, onRemove, index, totalLength, onMoveFlat }: SortableFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`file-item-${file.id}`}
      className="p-4 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/10 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors relative"
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 focus:outline-none"
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Thumbnail Preview */}
      {file.previews.length > 0 ? (
        <img
          src={file.previews[0]}
          alt={tr("Cover")}
          referrerPolicy="no-referrer"
          className="w-11 h-15 object-cover rounded shadow-xs border border-slate-200 dark:border-slate-800 shrink-0 select-none bg-white font-sans text-[8px] flex items-center text-center justify-center text-slate-400 pointer-events-none"
        />
      ) : (
        <div className="w-11 h-15 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-800 shrink-0 text-slate-400">
          <FileCode className="w-5 h-5" />
        </div>
      )}

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-150 truncate">
          {file.name}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {formatSize(file.size)} • {file.pageCount} {file.pageCount === 1 ? tr("page") : tr("pages")}
        </p>
      </div>

      {/* Order buttons */}
      <div className="flex items-center gap-1 shrink-0 z-10">
        <button
          onClick={() => onMoveFlat(index, 'up')}
          disabled={index === 0}
          id={`btn-flat-up-${file.id}`}
          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onMoveFlat(index, 'down')}
          disabled={index === totalLength - 1}
          id={`btn-flat-down-${file.id}`}
          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRemove(file.id)}
          id={`btn-flat-remove-${file.id}`}
          className="p-1.5 text-rose-500 hover:text-rose-600 rounded hover:bg-rose-500/10 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface SortableGroupFileItemProps {
  key?: string;
  file: PDFFile;
  formatSize: (bytes: number) => string;
  groups: MergeGroup[];
  currentGroupId: string;
  onFolderChange: (fileId: string, newGId: string) => void;
  onRemove: (id: string) => void;
  idxInGroup: number;
  groupFilesLength: number;
  onMoveInGroup: (groupId: string, indexInGroup: number, direction: 'up' | 'down') => void;
}

function SortableGroupFileItem({ file, formatSize, groups, currentGroupId, onFolderChange, onRemove, idxInGroup, groupFilesLength, onMoveInGroup }: SortableGroupFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`group-file-item-${file.id}`}
      className="p-3.5 flex items-center gap-3 bg-white dark:bg-slate-900/40 hover:bg-slate-50/50 dark:hover:bg-slate-900/60 transition-colors relative"
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 focus:outline-none"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Small Preview Icon */}
      {file.previews.length > 0 ? (
        <img
          src={file.previews[0]}
          alt={tr("Cover")}
          referrerPolicy="no-referrer"
          className="w-8 h-11 object-cover rounded shadow-xs border border-slate-200 dark:border-slate-800 shrink-0 select-none bg-white pointer-events-none"
        />
      ) : (
        <div className="w-8 h-11 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border rounded shrink-0 text-slate-400">
          <FileCode className="w-4 h-4" />
        </div>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
          {file.name}
        </p>
        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
          {formatSize(file.size)} • {file.pageCount} p
        </p>
      </div>

      {/* Folder Select Assign + Order controls */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 z-10">
        {/* Group Assignment Dropdown */}
        <select
          value={currentGroupId}
          onChange={(e) => onFolderChange(file.id, e.target.value)}
          id={`select-group-${file.id}`}
          className="text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-205 dark:border-slate-700 px-2 py-1 rounded text-slate-705 dark:text-slate-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {tr("Set Folder:")} {g.name}
            </option>
          ))}
        </select>

        {/* Up / Down inside this Group */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onMoveInGroup(currentGroupId, idxInGroup, 'up')}
            disabled={idxInGroup === 0}
            id={`btn-gr-up-${file.id}`}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 cursor-pointer"
            title={tr("Move Up in Group")}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMoveInGroup(currentGroupId, idxInGroup, 'down')}
            disabled={idxInGroup === groupFilesLength - 1}
            id={`btn-gr-down-${file.id}`}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-20 cursor-pointer"
            title={tr("Move Down in Group")}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(file.id)}
            id={`btn-group-remove-${file.id}`}
            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
            title={tr("Remove from project")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MergeTool({ onBack }: MergeToolProps) {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);

  // Batch Mode States
  const [mergeMode, setMergeMode] = useState<'single' | 'batch'>('single');
  const [groups, setGroups] = useState<MergeGroup[]>([
    { id: 'g1', name: 'Merge Group A' },
    { id: 'g2', name: 'Merge Group B' }
  ]);
  const [fileGroupMap, setFileGroupMap] = useState<Record<string, string>>({});

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

  const handleDragEndSingle = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setSuccess(false);
    }
  };

  const handleDragEndGroup = (groupId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFiles((items) => {
        const groupFiles = items.filter((f) => (fileGroupMap[f.id] || 'g1') === groupId);
        const oldIndexGroup = groupFiles.findIndex((i) => i.id === active.id);
        const newIndexGroup = groupFiles.findIndex((i) => i.id === over?.id);
        
        if (oldIndexGroup !== -1 && newIndexGroup !== -1) {
          const newGroupOrder = arrayMove(groupFiles, oldIndexGroup, newIndexGroup);
          
          let result = [...items];
          // Remove old elements first
          result = result.filter(f => (fileGroupMap[f.id] || 'g1') !== groupId);
          
          // Re-insert new elements in sorted order based on original group file placement
          const firstIdx = items.findIndex(f => (fileGroupMap[f.id] || 'g1') === groupId);
          if (firstIdx !== -1) {
             result.splice(firstIdx, 0, ...newGroupOrder);
             return result;
          } else {
             result.push(...newGroupOrder);
             return result;
          }
        }
        return items;
      });
      setSuccess(false);
    }
  };

  // Format utility
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFilesSelected = async (newRawFiles: File[]) => {
    setLoading(true);
    setStatusText(tr("Reading uploaded PDFs..."));
    setSuccess(false);

    try {
      const parsedFileList: PDFFile[] = [];
      const newGroupMap: Record<string, string> = {};
      const defaultGroupId = groups[0]?.id || 'g1';

      for (const file of newRawFiles) {
        const arrayBuffer = await fileToArrayBuffer(file);
        const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1); // just cover page for preview

        const fileId = Math.random().toString(36).substring(2, 9);
        parsedFileList.push({
          id: fileId,
          file,
          name: file.name,
          size: file.size,
          arrayBuffer,
          pageCount,
          previews,
        });
        
        newGroupMap[fileId] = defaultGroupId;
      }

      setFiles((prev) => [...prev, ...parsedFileList]);
      setFileGroupMap((prev) => ({ ...prev, ...newGroupMap }));
    } catch (err) {
      console.error(err);
      alert(tr("Error parsing some PDF files. Secure password-protected or corrupted files might fail to render Cover previews, but will load."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // Move item indices for Flat Lists
  const moveItemFlat = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    const newFiles = [...files];
    const [moved] = newFiles.splice(index, 1);
    newFiles.splice(targetIndex, 0, moved);
    setFiles(newFiles);
  };

  // Move item indices for Group Lists
  const getFilesForGroup = (groupId: string) => {
    return files.filter((f) => (fileGroupMap[f.id] || 'g1') === groupId);
  };

  const moveItemInGroup = (groupId: string, indexInGroup: number, direction: 'up' | 'down') => {
    const groupFiles = getFilesForGroup(groupId);
    const targetIdxInGroup = direction === 'up' ? indexInGroup - 1 : indexInGroup + 1;
    if (targetIdxInGroup < 0 || targetIdxInGroup >= groupFiles.length) return;
    
    const file1 = groupFiles[indexInGroup];
    const file2 = groupFiles[targetIdxInGroup];
    
    const absIdx1 = files.findIndex((f) => f.id === file1.id);
    const absIdx2 = files.findIndex((f) => f.id === file2.id);
    
    if (absIdx1 !== -1 && absIdx2 !== -1) {
      const newFiles = [...files];
      const temp = newFiles[absIdx1];
      newFiles[absIdx1] = newFiles[absIdx2];
      newFiles[absIdx2] = temp;
      setFiles(newFiles);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
    setFileGroupMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSuccess(false);
  };

  // Group Management
  const addNewGroup = () => {
    const nextNum = groups.length + 1;
    const newId = `g_${Math.random().toString(36).substring(2, 9)}`;
    setGroups((prev) => [...prev, { id: newId, name: `Merge Group ${String.fromCharCode(64 + nextNum)}` }]);
    setSuccess(false);
  };

  const renameGroup = (id: string, newName: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: newName } : g)));
  };

  const setGroupForFile = (fileId: string, newGId: string) => {
    setFileGroupMap((prev) => ({ ...prev, [fileId]: newGId }));
    setSuccess(false);
  };

  const deleteGroup = (groupId: string) => {
    if (groups.length <= 1) return;
    const remainingGroups = groups.filter((g) => g.id !== groupId);
    setGroups(remainingGroups);
    setSuccess(false);
    
    // Re-assign orphaned files to the first remaining group
    const fallbackGroupId = remainingGroups[0].id;
    setFileGroupMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((fId) => {
        if (next[fId] === groupId) {
          next[fId] = fallbackGroupId;
        }
      });
      return next;
    });
  };

  // Merge Processes
  const handleMergeSingle = async () => {
    if (files.length < 2) return;
    setLoading(true);
    setStatusText(tr("Merging document content client-side..."));
    
    try {
      const buffers = files.map((f) => f.arrayBuffer);
      const mergedBytes = await mergePdfs(buffers);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `merged_${timestamp}.pdf`;
      
      downloadFile(mergedBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Error during merging. Ensure files are not corrupted."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleMergeBatch = async () => {
    // Audit groups with 2 or more files
    const validGroups = groups.filter((g) => getFilesForGroup(g.id).length >= 2);
    if (validGroups.length === 0) {
      alert(tr("Please ensure you have configured at least one Merge Group containing 2 or more PDF files."));
      return;
    }

    setLoading(true);
    setStatusText(tr("Initializing Batch PDF Merger..."));
    
    try {
      const zip = new JSZip();
      let compiledCount = 0;

      for (const group of validGroups) {
        const groupFiles = getFilesForGroup(group.id);
        const buffers = groupFiles.map((f) => f.arrayBuffer);
        
        setStatusText(tr("Merging documents for {0} [{1} files]...", group.name, groupFiles.length));
        const mergedBytes = await mergePdfs(buffers);
        
        const cleanName = group.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Merged_Group';
        zip.file(`${cleanName}.pdf`, mergedBytes);
        compiledCount++;
      }

      if (compiledCount > 0) {
        setStatusText(tr("Compressing merged PDFs into single ZIP archive..."));
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        downloadFile(zipBytes, `batch_merged_${timestamp}.zip`, 'application/zip');
        setSuccess(true);
      } else {
        alert(tr("No groups met the criteria."));
      }
    } catch (err) {
      console.error(err);
      alert(tr("Batch merge operation failed. Verify that all PDFs are unencrypted."));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-merge-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-semibold">
            {tr("JSZip Accelerated")}
          </span>
          <span className="text-xs font-mono px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-semibold">
            {tr("100% Client-Side")}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{tr("Merge PDF Files")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {tr("Combine multiple documents into a single professional PDF, or arrange them into custom batch groupings for parallel merges. Drag and drop items to reorder.")}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex self-start bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-0.5 border border-slate-200/40 dark:border-slate-800 shrink-0">
            <button
              onClick={() => {
                setMergeMode('single');
                setSuccess(false);
              }}
              id="mode-merge-single"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mergeMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tr("Standard (All-in-1)")}
            </button>
            <button
              onClick={() => {
                setMergeMode('batch');
                setSuccess(false);
              }}
              id="mode-merge-batch"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                mergeMode === 'batch'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {tr("Batch Groups")}
            </button>
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="mb-6">
          <Dropzone
            id="merge-dropzone"
            onFilesSelected={handleFilesSelected}
            multiple={true}
            title={mergeMode === 'batch' ? tr("Upload multiple PDFs for Batch groups") : tr("Upload multiple PDFs to merge")}
          />
        </div>

        {/* Loading / Operation Progress overlay */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
            <span>{statusText || tr("Processing...")}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3 text-sm text-emerald-600 dark:text-emerald-400 animate-fade-in">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-semibold">
                {mergeMode === 'batch' ? tr("All Groups Successfully Merged!") : tr("Successfully Merged!")}
              </span>{' '}
              {tr("Your processed file package has been generated and downloaded.")}
            </div>
          </div>
        )}

        {/* Batch Mode Group Management Header */}
        {mergeMode === 'batch' && files.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold font-mono tracking-wider uppercase text-slate-400">
                {tr("Setup Batches & File Assignments")}
              </h3>
              <button
                onClick={addNewGroup}
                id="btn-add-batch-group"
                className="px-2.5 py-1 text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {tr("Add Merge Group")}
              </button>
            </div>
            
            <div className="p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-xl flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 dark:text-slate-400 select-none">
                {tr("Assign files into designated merge folders. Groups with")} <strong>{tr("2 or more")}</strong> {tr("files will be combined individually. Files belonging to different groups will merge simultaneously and package into a final single ZIP download.")}
              </p>
            </div>
          </div>
        )}

        {/* Files selection catalog */}
        {files.length > 0 ? (
          <div className="space-y-6">
            
            {/* RENDER MODE: SINGLE */}
            {mergeMode === 'single' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                  <span>{tr("Selected Documents (")}{files.length})</span>
                  <span>{tr("Order Placement")}</span>
                </div>

                <div className="border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEndSingle}
                  >
                    <SortableContext
                      items={files.map(f => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {files.map((file, index) => (
                        <SortableFileItem 
                          key={file.id} 
                          file={file} 
                          formatSize={formatSize} 
                          onRemove={removeFile}
                          index={index}
                          totalLength={files.length}
                          onMoveFlat={moveItemFlat}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            )}

            {/* RENDER MODE: BATCH GROUPS */}
            {mergeMode === 'batch' && (
              <div className="space-y-6">
                {groups.map((group) => {
                  const groupFiles = getFilesForGroup(group.id);

                  return (
                    <div
                      key={group.id}
                      id={`group-card-${group.id}`}
                      className="border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-950/5 overflow-hidden"
                    >
                      {/* Group Header */}
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150/40 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => renameGroup(group.id, e.target.value)}
                            id={`input-group-name-${group.id}`}
                            className="text-sm font-bold bg-transparent border-b border-transparent focus:border-indigo-505 hover:border-slate-300 dark:hover:border-slate-700 focus:outline-none text-slate-800 dark:text-slate-200 py-0.5 px-1 font-sans rounded-xs max-w-[170px]"
                            placeholder={tr("Group Name")}
                          />
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full">
                            {groupFiles.length} {groupFiles.length === 1 ? tr("file") : tr("files")}
                          </span>
                        </div>

                        {groups.length > 1 && (
                          <button
                            onClick={() => deleteGroup(group.id)}
                            id={`btn-delete-group-${group.id}`}
                            className="text-xs font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {tr("Delete Group")}
                          </button>
                        )}
                      </div>

                      {/* Group file listings */}
                      {groupFiles.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => handleDragEndGroup(group.id, event)}
                          >
                            <SortableContext
                              items={groupFiles.map(f => f.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {groupFiles.map((file, idxInGroup) => (
                                <SortableGroupFileItem 
                                  key={file.id} 
                                  file={file} 
                                  formatSize={formatSize} 
                                  groups={groups}
                                  currentGroupId={group.id}
                                  onFolderChange={setGroupForFile}
                                  onRemove={removeFile}
                                  idxInGroup={idxInGroup}
                                  groupFilesLength={groupFiles.length}
                                  onMoveInGroup={moveItemInGroup}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-600 font-sans font-medium">
                          {tr("No files configured in this group folder. Slide some above or change assignments.")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Merge Action button bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => document.getElementById('merge-dropzone-input')?.click()}
                id="btn-merge-add-more"
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 text-sm font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" /> {tr("Add More Files")}
              </button>

              {mergeMode === 'single' ? (
                <button
                  onClick={handleMergeSingle}
                  disabled={files.length < 2 || loading}
                  id="btn-merge-submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {tr("Merge")} {files.length} {tr("PDFs")}
                </button>
              ) : (
                <button
                  onClick={handleMergeBatch}
                  disabled={files.length < 2 || loading}
                  id="btn-merge-batch-submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderArchive className="w-4 h-4" />}
                  {tr("Merge groups into ZIP archive")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 dark:text-slate-600">
            {tr("No files uploaded yet. Select at least 2 PDF files up to begin.")}
          </div>
        )}
      </div>
    </div>
  );
}
