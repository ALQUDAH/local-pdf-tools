import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Trash2, ArrowUp, ArrowDown, Loader2, RefreshCw, UploadCloud, GripHorizontal } from 'lucide-react';
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
import { fileToArrayBuffer, imagesToPdf, downloadFile } from '../lib/pdfUtils';

import { tr } from '../i18n';
interface ImagesToPdfToolProps {
  onBack: () => void;
}

interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
}

interface SortableImageItemProps {
  key?: string;
  img: ImageItem;
  index: number;
  formatSize: (bytes: number) => string;
  totalLength: number;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onDelete: (id: string, previewUrl: string) => void;
}

function SortableImageItem({ img, index, formatSize, totalLength, onMove, onDelete }: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: img.id });

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
      id={`img-card-node-${index}`}
      className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl overflow-hidden p-3 relative group shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
    >
      <div 
        {...attributes} 
        {...listeners}
        className="absolute top-2 right-2 p-1.5 bg-slate-900/40 text-white rounded cursor-grab active:cursor-grabbing hover:bg-slate-900/60 transition-colors z-10 focus:outline-none"
        title={tr("Drag to reorder")}
      >
        <GripHorizontal className="w-3.5 h-3.5" />
      </div>

      <div className="relative aspect-[3/4] rounded bg-slate-100 overflow-hidden shadow-inner border border-slate-100/50">
        <img
          src={img.previewUrl}
          alt={img.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-slate-900/80 text-white rounded font-mono text-[10px] uppercase font-bold select-none pointer-events-none">
          {tr("Page")} {index + 1}
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{img.name}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{formatSize(img.size)}</p>
      </div>

      {/* Ordering arrows and delete */}
      <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 justify-between z-10 relative">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            id={`btn-move-up-${index}`}
            className="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={tr("Move Page Up")}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={index === totalLength - 1}
            id={`btn-move-down-${index}`}
            className="p-1 px-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={tr("Move Page Down")}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => onDelete(img.id, img.previewUrl)}
          id={`btn-delete-img-${index}`}
          className="p-1.5 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 rounded transition-colors"
          title={tr("Remove Image")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ImagesToPdfTool({ onBack }: ImagesToPdfToolProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const processImageFiles = (files: FileList | null) => {
    if (!files) return;
    const items: ImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      if (file.type.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        items.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          name: file.name,
          size: file.size,
          type: file.type || (lowerName.endsWith('.png') ? 'image/png' : 'image/jpeg'),
          previewUrl: URL.createObjectURL(file),
        });
      }
    }

    if (items.length > 0) {
      setImages((prev) => [...prev, ...items]);
      setSuccess(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageFiles(e.target.files);
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === images.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setImages(updated);
  };

  const handleDelete = (id: string, previewUrl: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    URL.revokeObjectURL(previewUrl);
  };

  const handleReset = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setSuccess(false);
  };

  const handleCompilePdf = async () => {
    if (images.length === 0) return;
    setLoading(true);

    try {
      const imgPayloads = await Promise.all(
        images.map(async (img) => {
          const buffer = await fileToArrayBuffer(img.file);
          return {
            data: buffer,
            name: img.name,
            type: img.type,
          };
        })
      );

      const pdfBytes = await imagesToPdf(imgPayloads);
      downloadFile(pdfBytes, 'compiled_images.pdf', 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Error building PDF compiled document."));
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setImages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setSuccess(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-imgtopdf-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-semibold">
          {tr("JPG / PNG to PDF")}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{tr("Convert Images to PDF")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {tr("Combine portrait and landscape photos or scanned forms directly into one standard vector PDF. Drag items to reorder.")}
            </p>
          </div>
        </div>

        {/* Custom Drag & Drop image area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all cursor-pointer group ${
            dragActive
              ? 'border-amber-500 bg-amber-500/5'
              : 'border-slate-300 dark:border-slate-700 hover:border-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800/45'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="images-selector-input"
            className="hidden"
            multiple
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleFileChange}
          />
          <div className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {tr("Drag & drop photo assets here")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm mx-auto">
            {tr("Supports JPEG schemas and lossless PNG scans. Stack them to create continuous page elements.")}
          </p>
        </div>

        {/* Loader */}
        {loading && (
          <div className="mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            <span>{tr("Embedding, compiling vector maps, and saving document...")}</span>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">{tr("Conversion Complete!")}</span> {tr("Scanned PDF document compiled and downloaded.")}
              </span>
            </div>
            <button
              onClick={handleReset}
              id="btn-imgtopdf-reset"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {tr("Start New")}
            </button>
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                {images.length} {images.length === 1 ? tr("IMAGE") : tr("IMAGES")} {tr("ENQUEUED")}
              </span>
              <button
                onClick={handleReset}
                id="btn-imgtopdf-clear-all"
                className="text-xs text-rose-500 font-semibold hover:text-rose-600 cursor-pointer"
              >
                {tr("Clear All")}
              </button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={images.map(img => img.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 p-4 bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800/60 max-h-[450px] overflow-y-auto">
                  {images.map((img, index) => (
                    <SortableImageItem
                      key={img.id}
                      img={img}
                      index={index}
                      formatSize={formatSize}
                      totalLength={images.length}
                      onMove={handleMove}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleCompilePdf}
                disabled={loading}
                id="btn-images-submit"
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
                {tr("Compile Images into PDF")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
