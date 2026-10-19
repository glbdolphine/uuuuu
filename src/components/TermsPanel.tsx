import React, { useMemo, useState } from 'react';
import { exportTermXlsx } from '../utils/targetExport';
import { Download, Layers, Loader2 } from 'lucide-react';
import type { LogEntry } from '../types';
import { matchIds } from '../utils/markIds';
import { IdMatchNote } from './IdMatchNote';
import { bulkSetTerm } from '../utils/cloud';
import { usePersistedState, useScrollMemory } from '../utils/persist';

const PRESETS = ['First Term', 'Second Term', 'Third Term', 'Fourth Term'];
const surface = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-18px_rgba(30,50,110,0.25)]';
const btn = 'inline-flex items-center gap-1.5 h-10 px-4 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50';

interface Props { logs: LogEntry[]; onChanged: () => Promise<unknown> | void; onOpenLog: (id: string) => void; }

export const TermsPanel: React.FC<Props> = ({ logs, onChanged, onOpenLog }) => {
  const [term, setTerm] = usePersistedState('terms.term', PRESETS[0]);
  const [custom, setCustom] = usePersistedState('terms.custom', '');
  const [idsText, setIdsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [exportTerm, setExportTerm] = usePersistedState('terms.export', '__none__'); // '__none__' = not marked with anything

  const activeTerm = (custom.trim() || term).trim();
  const match = useMemo(() => (idsText.trim() ? matchIds(idsText, logs, (l) => (l.term || '') === activeTerm) : null), [idsText, logs, activeTerm]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) { const k = l.term || ''; m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }, [logs]);
  const terms = [...new Set([...PRESETS, ...[...counts.keys()].filter(Boolean)])];

  const apply = async (clear = false) => {
    if (!match) return;
    const targets = (clear ? match.found : match.target).map((l) => l.id);
    if (!targets.length) { setMsg('Nothing to change.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await bulkSetTerm(targets, clear ? '' : activeTerm);
      await onChanged();
      setMsg(clear ? `Cleared the term on ${r.updated} connections.` : `Marked ${r.updated} connections as ${activeTerm}${r.unchanged ? ` (${r.unchanged} already were)` : ''}.`);
      setIdsText('');
    } catch (e: any) { setMsg(e?.message || 'Failed.'); }
    setBusy(false);
  };

  const exportByUpazila = async () => {
    const sel = logs.filter((l) => (exportTerm === '__none__' ? !l.term : exportTerm === '__all__' ? true : l.term === exportTerm));
    if (!sel.length) { setMsg('No connections match that selection.'); return; }
    const what = exportTerm === '__none__' ? 'not marked with any term' : exportTerm === '__all__' ? 'all connections' : exportTerm;
    const label = exportTerm === '__none__' ? 'Rest' : exportTerm === '__all__' ? 'All' : exportTerm.replace(/\s+/g, '_');
    try {
      await exportTermXlsx(sel, what, `connections_${label}_by_upazila_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMsg(`Exported ${sel.length} connections.`);
    } catch (e: any) { setMsg(e?.message || 'Export failed.'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2"><Layers className="w-5 h-5 text-brand-600" /><h1 className="text-lg font-bold text-slate-800">Terms</h1></div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...terms, ''].map((t) => (
          <div key={t || 'none'} className={`${surface} p-3`}>
            <div className="text-[11px] text-slate-500">{t || 'Not marked'}</div>
            <div className="text-2xl font-bold text-slate-800">{counts.get(t) || 0}</div>
          </div>
        ))}
      </div>

      <div className={`${surface} p-4 space-y-3`}>
        <h2 className="text-sm font-bold text-slate-700">Bulk mark by NMS ID</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={term} onChange={(e) => setTerm(e.target.value)} className="h-10 px-3 text-[13px] bg-slate-50 rounded-xl">
            {terms.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="or type a custom term" className="h-10 px-3 text-[13px] bg-slate-50 rounded-xl" />
        </div>
        <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} rows={7}
          placeholder="Paste NMS IDs here (one per line, or separated by commas/spaces)…"
          className="w-full p-3 text-xs font-mono bg-slate-50 rounded-xl border border-transparent focus:bg-white focus:border-slate-200 focus:outline-none" />
        {match && <IdMatchNote result={match} noun={`marked ${activeTerm}`} />}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !match || !match.target.length} onClick={() => apply(false)} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Mark {match ? match.target.length : 0} as {activeTerm}
          </button>
          <button disabled={busy || !match || !match.found.length} onClick={() => apply(true)} className={`${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            Clear term on matched
          </button>
        </div>
        {msg && <p className="text-xs font-semibold text-emerald-700">{msg}</p>}
      </div>

      <div className={`${surface} p-4 space-y-3`}>
        <h2 className="text-sm font-bold text-slate-700">Export to Excel by upazila</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={exportTerm} onChange={(e) => setExportTerm(e.target.value)} className="h-10 px-3 text-[13px] bg-slate-50 rounded-xl">
            <option value="__none__">The rest (not marked with any term) - {counts.get('') || 0}</option>
            {terms.map((t) => <option key={t} value={t}>{t} - {counts.get(t) || 0}</option>)}
            <option value="__all__">Everything - {logs.length}</option>
          </select>
          <button onClick={exportByUpazila} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><Download className="w-3.5 h-3.5" />Export (one sheet per upazila)</button>
        </div>
      </div>
    </div>
  );
};
