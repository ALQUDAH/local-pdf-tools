import React from 'react';
import { CloudOff, ArrowLeft } from 'lucide-react';

import { tr } from '../i18n';
interface NotSupportedClientSideToolProps {
  title: string;
  onBack: () => void;
}

export default function NotSupportedClientSideTool({ title, onBack }: NotSupportedClientSideToolProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center max-w-2xl mx-auto my-12 animate-fade-in">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mb-6">
        <CloudOff className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-2">
        {title} {tr("Requires a Server API")}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-lg leading-relaxed">
        {tr("This application operates strictly in your browser (client-side) to ensure your privacy and data security. Operations like")} <strong>{title}</strong> {tr("require heavy computational tools, external document parsing packages, or proprietary formats (like Microsoft Office) which cannot be processed entirely in-browser.")} 
      </p>
      
      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-semibold text-sm">{tr("Return to Tools")}</span>
        </button>
      </div>
    </div>
  );
}
