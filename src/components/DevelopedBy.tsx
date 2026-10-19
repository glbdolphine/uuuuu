import React from 'react';

export const DevelopedBy: React.FC<{ className?: string; tone?: 'light' | 'dark' }> = ({ className = '', tone = 'light' }) => {
  const dark = tone === 'dark';
  return (
    <footer className={`no-print flex items-center justify-center gap-2 py-5 text-sm ${dark ? 'text-emerald-100/70' : 'text-slate-600'} ${className}`}>
      <span>Developed by</span>
      <span className={`font-display text-lg font-bold tracking-tight leading-none ${dark ? 'text-white' : 'text-brand-700'}`}>
        Pace <span className={dark ? 'text-brand-300' : 'text-brand-500'}>IT</span>
      </span>
    </footer>
  );
};
