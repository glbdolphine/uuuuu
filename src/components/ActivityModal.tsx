import React, { useMemo, useState } from 'react';
import { X, Search, History, Plus, Pencil, Trash2, RotateCcw, UserPlus, UserX, UserCheck, KeyRound, Eraser } from 'lucide-react';
import { formatStamp } from '../utils/activity';
import { ActivityEvent } from '../types';
import { ScrollLock } from './ScrollLock';

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ActivityEvent[];
}

type Style = { label: string; icon: React.ElementType; tile: string; pill: string };
const ACTIONS: Record<ActivityEvent['action'], Style> = {
  created: { label: 'Created', icon: Plus, tile: 'from-teal-400 to-emerald-600 shadow-emerald-600/25', pill: 'bg-emerald-50 text-emerald-700' },
  edited: { label: 'Edited', icon: Pencil, tile: 'from-brand-400 to-brand-700 shadow-brand-600/25', pill: 'bg-brand-50 text-brand-700' },
  deleted: { label: 'Deleted', icon: Trash2, tile: 'from-orange-400 to-rose-600 shadow-rose-600/25', pill: 'bg-rose-50 text-rose-700' },
  cleared: { label: 'Cleared', icon: Eraser, tile: 'from-orange-400 to-rose-600 shadow-rose-600/25', pill: 'bg-rose-50 text-rose-700' },
  restored: { label: 'Restored', icon: RotateCcw, tile: 'from-amber-300 to-orange-500 shadow-orange-500/25', pill: 'bg-amber-50 text-amber-700' },
  user_created: { label: 'User created', icon: UserPlus, tile: 'from-violet-400 to-violet-600 shadow-violet-600/25', pill: 'bg-violet-50 text-violet-700' },
  user_disabled: { label: 'User disabled', icon: UserX, tile: 'from-orange-400 to-rose-600 shadow-rose-600/25', pill: 'bg-rose-50 text-rose-700' },
  user_enabled: { label: 'User enabled', icon: UserCheck, tile: 'from-teal-400 to-emerald-600 shadow-emerald-600/25', pill: 'bg-emerald-50 text-emerald-700' },
  purged: { label: 'Purged', icon: Trash2, tile: 'from-orange-400 to-rose-600 shadow-rose-600/25', pill: 'bg-rose-50 text-rose-700' },
  password_reset: { label: 'Password reset', icon: KeyRound, tile: 'from-violet-400 to-violet-600 shadow-violet-600/25', pill: 'bg-violet-50 text-violet-700' },
};
const FALLBACK: Style = { label: 'Other', icon: History, tile: 'from-slate-300 to-slate-500 shadow-slate-500/20', pill: 'bg-slate-100 text-slate-600' };
const styleOf = (a: string): Style => (ACTIONS as Record<string, Style>)[a] ?? { ...FALLBACK, label: a };

const INK = 'text-[#1b2a4e]';
type Chip = 'all' | 'created' | 'edited' | 'deleted' | 'other';
const chipOf = (a: string): Chip => (a === 'created' || a === 'edited' ? a : a === 'deleted' || a === 'cleared' || a === 'purged' ? 'deleted' : 'other');
const CHIPS: { key: Chip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'created', label: 'Created' },
  { key: 'edited', label: 'Edited' },
  { key: 'deleted', label: 'Deleted' },
  { key: 'other', label: 'Other' },
];

export const ActivityModal: React.FC<ActivityModalProps> = ({ isOpen, onClose, events }) => {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<Chip>('all');

  const counts = useMemo(() => {
    const c: Record<Chip, number> = { all: events.length, created: 0, edited: 0, deleted: 0, other: 0 };
    for (const e of events) c[chipOf(e.action)]++;
    return c;
  }, [events]);

  const filtered = useMemo(() => events.filter((e) => {
    if (chip !== 'all' && chipOf(e.action) !== chip) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [e.by, e.action, e.logNo, e.customer, e.detail]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  }), [events, query, chip]);

  if (!isOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm">
      <ScrollLock />
      <div role="dialog" aria-modal="true" aria-label="Activity"
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col h-[min(42rem,90vh)]">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/30"><History className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h2 className={`text-base font-bold ${INK}`}>Activity</h2>
            <p className="text-xs text-slate-500">Who changed what, newest first.</p>
          </div>
          <span className="ml-auto shrink-0 px-2.5 py-1 rounded-full bg-brand-50 text-[11.5px] font-semibold text-brand-700 tabular-nums">
            {filtered.length === events.length ? events.length : `${filtered.length} of ${events.length}`}
          </span>
          <button onClick={onClose} aria-label="Close" title="Close"
            className="grid place-items-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Search + filter chips */}
        <div className="shrink-0 px-6 py-3 border-b border-slate-100 space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name, action or connection..."
              className={`w-full h-10 pl-9 pr-3 text-xs ${INK} bg-slate-50 border border-slate-200 rounded-xl hover:bg-white focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-slate-400`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by action">
            {CHIPS.map((c) => {
              const on = chip === c.key;
              return (
                <button key={c.key} type="button" onClick={() => setChip(c.key)} aria-pressed={on}
                  className={`h-7 px-3 inline-flex items-center gap-1.5 text-[11.5px] rounded-full border transition-colors ${on ? 'bg-brand-900 text-white border-brand-900 font-semibold shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-medium'}`}>
                  {c.label}
                  <span className={`tabular-nums text-[10.5px] ${on ? 'text-white/70' : 'text-slate-400'}`}>{counts[c.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <p className="mx-3 my-4 rounded-2xl bg-slate-50 px-4 py-12 text-xs text-slate-400 text-center">
              {events.length === 0 ? 'No activity recorded yet.' : 'No activity matches your filter.'}
            </p>
          ) : (
            filtered.map((e) => {
              const st = styleOf(e.action);
              const Icon = st.icon;
              return (
                <div key={e.id} className="px-3 py-3 flex items-start gap-3 rounded-2xl hover:bg-slate-50 transition-colors">
                  <span className={`grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br ${st.tile} text-white shadow-md shrink-0`}><Icon className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-[13px] font-semibold ${INK}`}>{e.by}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${st.pill}`}>{st.label}</span>
                      {e.logNo !== undefined && e.logNo !== '' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10.5px] font-semibold text-slate-600 tabular-nums">
                          Connection #{e.logNo}{e.customer ? ` · ${e.customer}` : ''}
                        </span>
                      )}
                    </div>
                    {e.detail && <p className="mt-1 text-xs text-slate-500 break-words">{e.detail}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap tabular-nums pt-0.5">{formatStamp(e.at)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
