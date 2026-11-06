/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { ArrowLeft, CheckCircle, FileCode, Lock, Unlock, KeyRound, Eye, EyeOff, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, protectPdf, unprotectPdf, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';

interface ProtectToolProps {
  onBack: () => void;
  initialMode?: 'encrypt' | 'decrypt';
}

type ProtectSubMode = 'encrypt' | 'decrypt';

export default function ProtectTool({ onBack, initialMode = 'encrypt' }: ProtectToolProps) {
  const [subMode, setSubMode] = useState<ProtectSubMode>(initialMode);

  // Encryption mode state
  const [fileToEncrypt, setFileToEncrypt] = useState<PDFFile | null>(null);
  const [encryptPassword, setEncryptPassword] = useState<string>('');
  const [showEncryptPassword, setShowEncryptPassword] = useState<boolean>(false);
  const [encryptLoading, setEncryptLoading] = useState(false);
  const [encryptSuccess, setEncryptSuccess] = useState(false);

  // Decryption mode state
  const [fileToDecrypt, setFileToDecrypt] = useState<File | null>(null);
  const [decryptPassword, setDecryptPassword] = useState<string>('');
  const [showDecryptPassword, setShowDecryptPassword] = useState<boolean>(false);
  const [decryptLoading, setDecryptLoading] = useState(false);
  const [decryptSuccess, setDecryptSuccess] = useState(false);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  // Handle encryption file drop
  const handleEncryptFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setEncryptLoading(true);
    setEncryptSuccess(false);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 1);

      setFileToEncrypt({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
    } catch (err) {
      console.error(err);
      alert('Error parsing document details.');
    } finally {
      setEncryptLoading(false);
    }
  };

  // Carry out military-grade lock and download
  const handleEncryptSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fileToEncrypt || !encryptPassword) return;
    setEncryptLoading(true);
    setEncryptSuccess(false);

    try {
      const protectedBytes = await protectPdf(fileToEncrypt.arrayBuffer, encryptPassword);
      
      const baseName = fileToEncrypt.name.replace(/\.pdf$/i, '');
      const filename = `${baseName}.secured.pdf`;
      
      downloadFile(protectedBytes, filename, 'application/pdf');
      setEncryptSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Failed to encrypt PDF file. Ensure file is valid.');
    } finally {
      setEncryptLoading(false);
    }
  };

  // Handle decryption file select
  const handleDecryptFileSelected = (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setFileToDecrypt(newRawFiles[0]);
    setDecryptSuccess(false);
    setDecryptionError(null);
  };

  // Carry out decryption back to normal standard PDF
  const handleDecryptSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fileToDecrypt || !decryptPassword) return;
    setDecryptLoading(true);
    setDecryptSuccess(false);
    setDecryptionError(null);

    try {
      const arrayBuffer = await fileToArrayBuffer(fileToDecrypt);
      const decryptedBytes = await unprotectPdf(arrayBuffer, decryptPassword);
      
      const newName = fileToDecrypt.name.replace(/\.secured\.pdf$/i, '_unlocked.pdf');
      const finalName = newName.endsWith('.pdf') ? newName : `${newName}.pdf`;

      downloadFile(decryptedBytes, finalName, 'application/pdf');
      setDecryptSuccess(true);
    } catch (err) {
      console.error(err);
      setDecryptionError('Incorrect decryption passphrase. Please try again.');
    } finally {
      setDecryptLoading(false);
    }
  };

  const resetEncrypt = () => {
    setFileToEncrypt(null);
    setEncryptPassword('');
    setEncryptSuccess(false);
  };

  const resetDecrypt = () => {
    setFileToDecrypt(null);
    setDecryptPassword('');
    setDecryptSuccess(false);
    setDecryptionError(null);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-protect-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-full font-semibold">
          100% Client-Side AES-256
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        {/* Toggle Mode selectors */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 pb-5 mb-6 justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">PDF Security Suite</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Secure PDF contents using AES-GCM, or unlock them without passing data to remote servers.
            </p>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-800">
            <button
              onClick={() => setSubMode('encrypt')}
              id="tab-mode-encrypt"
              className={`p-2.5 px-5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                subMode === 'encrypt'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" /> Encrypt File
            </button>
            <button
              onClick={() => setSubMode('decrypt')}
              id="tab-mode-decrypt"
              className={`p-2.5 px-5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                subMode === 'decrypt'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" /> Decrypt File
            </button>
          </div>
        </div>

        {/* --- MODE 1: ENCRYPTION --- */}
        {subMode === 'encrypt' && (
          <div className="space-y-6">
            {!fileToEncrypt && (
              <Dropzone
                id="encrypt-dropzone"
                onFilesSelected={handleEncryptFileSelected}
                multiple={false}
                title="Drop PDF to Lock"
                description="Upload a document to encrypt it with AES-GCM standard key parameters."
              />
            )}

            {encryptLoading && (
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
                <Loader2 className="w-5 h-5 text-rose-500 animate-spin" />
                <span>Reading or securing PDF file...</span>
              </div>
            )}

            {encryptSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-semibold">Successfully Locked!</span> Encrypted <strong>.secured.pdf</strong> has been downloaded.
                  </div>
                </div>
                <button
                  onClick={resetEncrypt}
                  id="btn-encrypt-reset"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Lock Another
                </button>
              </div>
            )}

            {fileToEncrypt && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                {/* Meta details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Target Document</span>
                  </div>

                  <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl space-y-4">
                    <div className="flex items-center gap-4">
                      {fileToEncrypt.previews.length > 0 ? (
                        <img
                          src={fileToEncrypt.previews[0]}
                          alt="Cover"
                          referrerPolicy="no-referrer"
                          className="w-16 h-22 object-cover rounded-md shadow-md border border-slate-200 select-none bg-white shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-22 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 shrink-0 text-slate-400 select-none">
                          <FileCode className="w-8 h-8" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{fileToEncrypt.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{formatSize(fileToEncrypt.size)}</p>
                        <p className="text-xs font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded inline-block text-slate-600 dark:text-slate-300 mt-2">
                          {fileToEncrypt.pageCount} {fileToEncrypt.pageCount === 1 ? 'page' : 'pages'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                      <button
                        onClick={resetEncrypt}
                        id="btn-encrypt-change-file"
                        className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                      >
                        Change File
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form parameters */}
                <form onSubmit={handleEncryptSubmit} className="space-y-5">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Access Configuration</span>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="encrypt-password-field" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Passphrase to Encrypt PDF
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
                          <KeyRound className="w-4 h-4" />
                        </span>
                        <input
                          type={showEncryptPassword ? 'text' : 'password'}
                          id="encrypt-password-field"
                          value={encryptPassword}
                          onChange={(e) => setEncryptPassword(e.target.value)}
                          placeholder="Type access restriction password..."
                          required
                          className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-rose-500 dark:focus:border-rose-400 focus:outline-none transition-colors font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEncryptPassword(!showEncryptPassword)}
                          id="btn-encrypt-password-toggle"
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                        >
                          {showEncryptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-orange-500/5 text-orange-600 dark:text-orange-400 text-xs leading-relaxed border border-orange-500/10 flex gap-2">
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        This creates a highly secure, client-side encrypted container. Users must use this local suite to unpack normal standard PDF sheets.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={!encryptPassword || encryptLoading}
                      id="btn-encrypt-submit"
                      className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-650/40 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {encryptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Encrypt PDF File
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* --- MODE 2: DECRYPTION --- */}
        {subMode === 'decrypt' && (
          <div className="space-y-6">
            {!fileToDecrypt && (
              <Dropzone
                id="decrypt-dropzone"
                onFilesSelected={handleDecryptFileSelected}
                multiple={false}
                title="Upload encrypted PDF (.secured.pdf) to standard PDF"
                description="Upload the securely locked file to reverse AES wrappers client-side."
              />
            )}

            {decryptLoading && (
              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                <span>Decrypting AES cipher blocks in-browser...</span>
              </div>
            )}

            {decryptSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-semibold">Successfully Decrypted!</span> The printable PDF has been unlocked and downloaded.
                  </div>
                </div>
                <button
                  onClick={resetDecrypt}
                  id="btn-decrypt-reset"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Unlock Another
                </button>
              </div>
            )}

            {decryptionError && (
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center gap-3 text-sm text-rose-600 dark:text-rose-450">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{decryptionError}</span>
              </div>
            )}

            {fileToDecrypt && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                {/* Meta details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Locked Document</span>
                  </div>

                  <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-22 flex items-center justify-center bg-indigo-500/10 text-indigo-500 rounded border border-indigo-200 dark:border-indigo-950 shrink-0 select-none">
                        <Lock className="w-8 h-8" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{fileToDecrypt.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{formatSize(fileToDecrypt.size)}</p>
                        <span className="text-[10px] font-bold text-sky-600 px-2 py-0.5 bg-sky-500/10 rounded inline-block mt-2">
                          AES-256 Protected
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                      <button
                        onClick={resetDecrypt}
                        id="btn-decrypt-change-file"
                        className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                      >
                        Change File
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form key config */}
                <form onSubmit={handleDecryptSubmit} className="space-y-5">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Configuration</span>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="decrypt-password-field" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Required Decryption Passphrase
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
                          <KeyRound className="w-4 h-4" />
                        </span>
                        <input
                          type={showDecryptPassword ? 'text' : 'password'}
                          id="decrypt-password-field"
                          value={decryptPassword}
                          onChange={(e) => setDecryptPassword(e.target.value)}
                          placeholder="Type security password..."
                          required
                          className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none transition-colors font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowDecryptPassword(!showDecryptPassword)}
                          id="btn-decrypt-password-toggle"
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                        >
                          {showDecryptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!decryptPassword || decryptLoading}
                      id="btn-decrypt-submit"
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-650/40 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {decryptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                      Unlock PDF File
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
