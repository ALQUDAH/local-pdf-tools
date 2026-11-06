/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { UploadCloud, File, AlertTriangle } from 'lucide-react';

import { tr } from '../i18n';
interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  title?: string;
  description?: string;
  id?: string;
  accept?: string;
}

export default function Dropzone({
  onFilesSelected,
  multiple = true,
  title = "Drag & drop PDF files here",
  description,
  id = "pdf-dropzone",
  accept = "application/pdf"
}: DropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndProcessFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (accept === "application/pdf") {
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          validFiles.push(file);
        }
      } else {
        // If accepting something else (like images or anything)
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      if (accept === "application/pdf") {
        setError(tr("Please select only valid PDF files (.pdf)"));
      } else {
        setError(tr("Please select valid files. Expected: {0}", accept));
      }
      return;
    }

    if (!multiple && validFiles.length > 1) {
      // For single file dropzones, take the first valid one
      onFilesSelected([validFiles[0]]);
    } else {
      onFilesSelected(validFiles);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFiles(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        id={id}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all duration-300 cursor-pointer group ${
          isDragActive
            ? "border-emerald-500 bg-emerald-500/5 shadow-inner"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:border-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-900/60 shadow-sm"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          id={`${id}-input`}
          className="hidden"
          multiple={multiple}
          accept={accept === "application/pdf" ? ".pdf,application/pdf" : accept}
          onChange={handleChange}
        />

        <div className={`p-4 rounded-full mb-4 transition-transform duration-300 group-hover:scale-110 ${
          isDragActive 
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" 
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/20 group-hover:text-emerald-500"
        }`}>
          <UploadCloud className="w-8 h-8 md:w-10 md:h-10" />
        </div>

        <h3 className="text-base md:text-lg font-medium text-slate-800 dark:text-slate-100 mb-1">
          {title}
        </h3>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md">
          {description ?? tr("or click to browse your local device. 100% private, files never leave your system.")}
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-rose-500 text-xs md:text-sm bg-rose-500/10 px-3 py-1.5 rounded-lg animate-pulse">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
