/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Sliders, Play, Loader2, RefreshCw, Download, FileText, User, BookOpen, Key, Settings, Heart } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, getPdfMetadata, updatePdfMetadata, downloadFile, PdfMetadata } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

import { tr } from '../i18n';
interface MetadataToolProps {
  onBack: () => void;
}

export default function MetadataTool({ onBack }: MetadataToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Metadata form parameters
  const [metadata, setMetadata] = useState<PdfMetadata>({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
  });

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
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);
      
      // Parse current metadata
      const existingMeta = await getPdfMetadata(arrayBuffer);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });

      setMetadata(existingMeta);
    } catch (err) {
      console.error(err);
      alert(tr("Error viewing PDF structure and parsing metadata fields."));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const compiledBytes = await updatePdfMetadata(file.arrayBuffer, metadata);
      const baseName = file.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}_metadata_patched.pdf`;

      downloadFile(compiledBytes, filename, 'application/pdf');
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Failed to rewrite custom metadata tags into the PDF file structure."));
    } finally {
      setLoading(false);
    }
  };

  const resetTool = () => {
    setFile(null);
    setMetadata({
      title: '',
      author: '',
      subject: '',
      keywords: '',
      creator: '',
      producer: '',
    });
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-metadata-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold">
          {tr("Pro Metadata Editor")}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{tr("Edit PDF Metadata")}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Read, modify, and assign standard document headers like Title, Creator, Author, and indexing Keywords for pristine SEO.")}
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="metadata-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title={tr("Upload PDF to extract metadata properties")}
              description={tr("Once uploaded, current metadata fields will parse instantly into matching input cells below.")}
            />
          </div>
        )}

        {loading && (
          <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-305 mb-6">
            <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
            <span>{tr("Scanning catalogs and reading dictionary object descriptors...")}</span>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">{tr("Successfully Metatagged!")}</span> {tr("Your revised metadata-stamped document has been compiled and downloaded.")}
              </span>
            </div>
            <button
              onClick={resetTool}
              id="btn-metadata-reset"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {tr("Start New")}
            </button>
          </div>
        )}

        {file && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            
            {/* Left Box: Preview and File Meta info */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                <Sliders className="w-3.5 h-3.5" />
                <span>{tr("Selected Document")}</span>
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center gap-4">
                  {file.previews.length > 0 ? (
                    <img
                      src={file.previews[0]}
                      alt={tr("Cover Screen")}
                      referrerPolicy="no-referrer"
                      className="w-16 h-22 object-cover rounded-md shadow-md border border-slate-200 bg-white shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-22 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 shrink-0 text-slate-400 select-none">
                      <FileCode className="w-8 h-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold">{formatSize(file.size)}</p>
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded inline-block text-slate-600 dark:text-slate-300 mt-2">
                      {file.pageCount} {tr("Pages Loaded")}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-850 flex justify-end">
                  <button
                    type="button"
                    onClick={resetTool}
                    id="btn-metadata-change-file"
                    className="text-xs font-semibold text-violet-500 hover:text-violet-600 cursor-pointer"
                  >
                    {tr("Change File")}
                  </button>
                </div>
              </div>

              {/* Informative tips box */}
              <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 space-y-2 text-xs">
                <h5 className="font-bold text-violet-750 dark:text-violet-300 flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 shrink-0" /> {tr("Why Edit Metadata?")}
                </h5>
                <p className="text-slate-500 dark:text-slate-450 leading-relaxed">
                  {tr("Proper catalog identifiers like subject details and keywords greatly refine document SEO rankings, ensure consistent reference indexes across system storage engines, and block identity leaks in file properties.")}
                </p>
              </div>
            </div>

            {/* Right Box: Settings Modifiers Form */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase mb-2">
                <Settings className="w-3.5 h-3.5" />
                <span>{tr("Edit Document Fields")}</span>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label htmlFor="meta-title-field" className="block text-xs font-bold text-slate-600 dark:text-slate-450 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-violet-505" /> {tr("Document Title")}
                </label>
                <input
                  type="text"
                  id="meta-title-field"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                  placeholder={tr("e.g. Q2 Financial Statement")}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Author Input */}
              <div className="space-y-1.5">
                <label htmlFor="meta-author-field" className="block text-xs font-bold text-slate-600 dark:text-slate-450 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-violet-505" /> {tr("Author / Creator")}
                </label>
                <input
                  type="text"
                  id="meta-author-field"
                  value={metadata.author}
                  onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                  placeholder={tr("e.g. John Doe Consulting")}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Subject Input */}
              <div className="space-y-1.5">
                <label htmlFor="meta-subject-field" className="block text-xs font-bold text-slate-600 dark:text-slate-450 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-violet-505" /> {tr("Document Subject")}
                </label>
                <input
                  type="text"
                  id="meta-subject-field"
                  value={metadata.subject}
                  onChange={(e) => setMetadata({ ...metadata, subject: e.target.value })}
                  placeholder={tr("e.g. Corporate Earnings & Assets Analysis")}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Keywords Input */}
              <div className="space-y-1.5">
                <label htmlFor="meta-keywords-field" className="block text-xs font-bold text-slate-600 dark:text-slate-450 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-violet-505" /> {tr("Keywords (Comma Separated)")}
                </label>
                <input
                  type="text"
                  id="meta-keywords-field"
                  value={metadata.keywords}
                  onChange={(e) => setMetadata({ ...metadata, keywords: e.target.value })}
                  placeholder={tr("e.g. taxes, annual, financial-report")}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Creator & Producer side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="meta-creator-field" className="block text-xs font-bold text-slate-600 dark:text-slate-401">
                    {tr("Application / Creator")}
                  </label>
                  <input
                    type="text"
                    id="meta-creator-field"
                    value={metadata.creator}
                    onChange={(e) => setMetadata({ ...metadata, creator: e.target.value })}
                    placeholder={tr("e.g. Adobe InDesign")}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:border-violet-500 focus:outline-none leading-normal font-sans"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="meta-producer-field" className="block text-xs font-bold text-slate-600 dark:text-slate-401">
                    {tr("Producer Engine")}
                  </label>
                  <input
                    type="text"
                    id="meta-producer-field"
                    value={metadata.producer}
                    onChange={(e) => setMetadata({ ...metadata, producer: e.target.value })}
                    placeholder={tr("e.g. pdf-lib bundle tool")}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:border-violet-500 focus:outline-none leading-normal font-sans"
                  />
                </div>
              </div>

              {/* Form submit key */}
              <button
                type="submit"
                disabled={loading}
                id="btn-metadata-submit"
                className="w-full mt-4 py-3 bg-violet-600 hover:bg-violet-505 disabled:bg-violet-650/40 text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                {tr("Rewrite & Save Metadata Tags")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
