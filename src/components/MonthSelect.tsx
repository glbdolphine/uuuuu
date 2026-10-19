import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { isMonthKey, monthKey, monthLabel } from '../utils/months';

interface Props {
  value: string;
  onChange: (month: string) => void;
  counts?: Map<string, number>;
  allowAll?: boolean;
  noun?: string;
  title?: string;
  className?: string;
  align?: 'left' | 'right';
  compact?: boolean;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2099;
const SHORT = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'short' }));

export const MonthSelect: React.FC<Props> = ({ value, onChange, counts, allowAll, noun = 'bills', title, className = '', align = 'left', compact = false }) => {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => (isMonthKey(value) ? Number(value.slice(0, 4)) : new Date().getFullYear()));
  const box = useRef<HTMLDivElement>(null);
  const nowKey = monthKey();

  // Opening always starts on the year of the picked month.
  useEffect(() => {
    if (open && isMonthKey(value)) setYear(Number(value.slice(0, 4)));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const pick = (m: string) => { onChange(m); setOpen(false); };
  const n = value
    ? counts?.get(value)
    : (counts ? [...counts.values()].reduce((a, b) => a + b, 0) : undefined);
  const yearTotal = (y: number) => {
    let t = 0;
    counts?.forEach((c, k) => { if (k.startsWith(`${y}-`)) t += c; });
    return t;
  };

  return (
    <div ref={box} className={`relative inline-block ${className}`} title={title}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        className={`inline-flex items-center gap-2 pl-3 pr-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors ${compact ? 'h-8 text-xs' : 'h-10 text-sm shadow-[0_8px_20px_-14px_rgba(30,50,110,0.35)]'}`}>
        <CalendarDays className="w-4 h-4 text-brand-600 shrink-0" />
        <span className="font-semibold text-[#1b2a4e]">{value ? monthLabel(value) : 'All months'}</span>
        {n ? <span className="text-xs text-slate-400 tabular-nums">· {n}</span> : null}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a month"
          className={`absolute top-full mt-2 z-50 w-72 p-3 bg-white rounded-2xl border border-slate-100 shadow-[0_24px_48px_-16px_rgba(30,50,110,0.35)] ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))} disabled={year <= MIN_YEAR} aria-label="Previous year"
              className="grid place-items-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <div className="text-center">
              <div className="text-sm font-bold text-[#1b2a4e] tabular-nums">{year}</div>
              {yearTotal(year) > 0 && <div className="text-[10.5px] text-slate-400">{yearTotal(year)} {noun} in total</div>}
            </div>
            <button type="button" onClick={() => setYear((y) => Math.min(MAX_YEAR, y + 1))} disabled={year >= MAX_YEAR} aria-label="Next year"
              className="grid place-items-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {SHORT.map((label, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              const selected = key === value;
              const c = counts?.get(key);
              return (
                <button key={key} type="button" onClick={() => pick(key)} aria-pressed={selected}
                  className={`relative h-12 rounded-xl text-[13px] font-semibold transition-colors flex flex-col items-center justify-center leading-tight
                    ${selected ? 'bg-brand-700 text-white shadow-sm' : 'text-slate-700 hover:bg-brand-50'}
                    ${!selected && key === nowKey ? 'ring-1 ring-inset ring-brand-300' : ''}`}>
                  {label}
                  {c ? <span className={`text-[10px] font-medium tabular-nums ${selected ? 'text-white/80' : 'text-brand-600'}`}>{c}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button type="button" onClick={() => pick(nowKey)} className="h-8 px-3 text-xs font-semibold text-brand-800 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors">This month</button>
            {allowAll && <button type="button" onClick={() => pick('')} className="h-8 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">All months</button>}
          </div>
        </div>
      )}
    </div>
  );
};
