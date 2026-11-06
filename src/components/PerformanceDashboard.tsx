import React, { useState, useEffect } from 'react';
import { Activity, X } from 'lucide-react';

export default function PerformanceDashboard() {
  const [memory, setMemory] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const updateMemory = () => {
      if ('memory' in performance) {
        // @ts-ignore
        const used = performance.memory.usedJSHeapSize;
        if (used) {
          setMemory(Math.round(used / (1024 * 1024)));
        }
      }
    };
    
    if (isOpen) {
      updateMemory();
      interval = setInterval(updateMemory, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md border border-slate-700/50 p-3 rounded-full shadow-lg z-[100] text-slate-200 transition-all group"
        title="Show Performance Metrics"
      >
        <Activity className="w-5 h-5 text-emerald-400 group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl shadow-2xl z-[100] text-slate-200 w-64 animate-fade-in relative pointer-events-auto">
      <button 
        onClick={() => setIsOpen(false)}
        className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex items-center gap-2 mb-3 border-b border-slate-700/50 pb-2 pr-6">
        <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Performance Metrics</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">Current RAM Usage</div>
          <div className="text-xl font-mono font-medium text-emerald-400 flex items-baseline gap-1">
            {memory !== null ? (
              <>
                {memory} <span className="text-xs text-slate-500 font-sans normal-case uppercase tracking-wider">MB</span>
              </>
            ) : (
              <span className="text-xs text-slate-500">API config unavailable</span>
            )}
          </div>
        </div>
        
        <div>
          <div className="text-[9px] text-slate-400 font-mono uppercase tracking-wider mb-0.5">Est. Generation Time</div>
          <div className="text-xl font-mono font-medium text-indigo-400 flex items-baseline gap-1">
            ~1.2s <span className="text-xs text-slate-500 font-sans normal-case uppercase tracking-wider">/ 10MB</span>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-700/50">
        <p className="text-[9px] text-slate-500 leading-relaxed">
          Browser client-side processing limits depend on device system allocation limits.
        </p>
      </div>
    </div>
  );
}
