/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Sun, Moon, Laptop, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeSwitcherProps {
  currentMode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  labels?: Partial<Record<ThemeMode, string>>;
}

export default function ThemeSwitcher({ currentMode, onChange, labels = {} }: ThemeSwitcherProps) {
  const modes: { id: ThemeMode; label: string; icon: React.ComponentType<any>; tooltip: string }[] = [
    {
      id: 'light',
      label: labels.light ?? 'Light',
      icon: Sun,
      tooltip: 'Constant light-colored workspace interface'
    },
    {
      id: 'system',
      label: labels.system ?? 'System',
      icon: Laptop,
      tooltip: 'Synchronizes automatically with your system preference'
    },
    {
      id: 'dark',
      label: labels.dark ?? 'Dark',
      icon: Moon,
      tooltip: 'Protected eye-safe low light canvas'
    }
  ];

  return (
    <div className="relative flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-1.5 rounded-2xl select-none">
      {/* Sliding Active Pill Animation */}
      <div className="absolute inset-y-1.5 left-1.5 right-1.5 flex pointer-events-none">
        {modes.map((mode, index) => (
          <div 
            key={mode.id} 
            className="flex-1 h-full"
            style={{ position: 'relative' }}
          >
            {currentMode === mode.id && (
              <motion.div
                layoutId="activeThemePill"
                className="absolute inset-0 bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200/20 dark:border-slate-700/30"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Button Controls */}
      {modes.map((mode) => {
        const IconComponent = mode.icon;
        const isActive = currentMode === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            id={`btn-theme-${mode.id}`}
            title={mode.tooltip}
            className={`relative flex-1 py-1.5 px-3 md:px-4 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-300 cursor-pointer focus:outline-none ${
              isActive
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <motion.div
              animate={isActive ? { rotate: [0, 8, -8, 0], scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center"
            >
              <IconComponent className={`w-4 h-4 transition-colors ${
                isActive 
                  ? 'text-teal-600 dark:text-teal-400' 
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
              }`} />
            </motion.div>
            
            <span className="hidden sm:inline font-sans truncate">
              {mode.label}
            </span>

            {/* Sparkle decorator for system preference */}
            {mode.id === 'system' && (
              <Sparkles className="w-2.5 h-2.5 text-teal-500/80 animate-pulse absolute top-1 right-2 hidden sm:block" />
            )}
          </button>
        );
      })}
    </div>
  );
}
