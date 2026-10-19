import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, Clock, Download, FileText, Hourglass, ListChecks, MessageCircle, Search, Users, X } from 'lucide-react';
import { exportFormsSample } from '../utils/formsExport';
import { exportTopsheet } from '../utils/topsheetExport';
import { exportTopsheetPdf } from '../utils/topsheetPdf';
import { LogEntry, MarkAction, Foreman } from '../types';
import {
  awaitingByForeman, daysAwaiting, expectsForm, formMonthCounts, formMonthOf, formStats, getOverdueDays,
  hasForm, setOverdueDays,
} from '../utils/forms';
import { PendingIndex, pendingFor } from '../utils/approvals';
import { matchForeman } from '../utils/foremen';
import { chaseMessage, waLink } from '../utils/whatsapp';
import { monthKey, monthLabel } from '../utils/months';
import { MonthSelect } from './MonthSelect';
import { NameLang, nameFor } from '../utils/names';
import { exportFormsPdf } from '../utils/exportPdf';
import { matchIds, IdMatchResult } from '../utils/markIds';
import { IdMatchNote } from './IdMatchNote';
import { usePersistedState, useScrollMemory } from '../utils/persist';

type Tab = 'awaiting' | 'received' | 'all';

interface Props {
  logs: LogEntry[];
  foremen: Foreman[];
  pending: PendingIndex;
  onToggleForm: (log: LogEntry, month?: string) => void;
  onMarkMany: (logs: LogEntry[], action: MarkAction, month?: string) => void;
  onChangeMonth: (items: { log: LogEntry; from: string }[]) => void;
  onOpenLog: (id: string) => void;
  initialTab?: Tab;
  nameLang?: NameLang;
  onNameLangChange?: (lang: NameLang) => void;
}

const foremanOf = (l: LogEntry) => l.foremanName?.trim() || 'Unassigned';

export const FormsTab: React.FC<Props> = ({ logs, foremen, pending, onToggleForm, onMarkMany, onChangeMonth, onOpenLog, initialTab = 'received', nameLang = 'bn', onNameLangChange }) => {
  const [tab, setTab] = usePersistedState<Tab>(`forms.tab.${initialTab}`, initialTab);
  const [search, setSearch] = usePersistedState('forms.search', '');
  const [foreman, setForeman] = usePersistedState('forms.foreman', '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [idsText, setIdsText] = useState('');
  const [idsNote, setIdsNote] = useState('');
  const [idsResult, setIdsResult] = useState<IdMatchResult | null>(null);
  const [idsAction, setIdsAction] = useState<MarkAction>('received');
  const [showBulk, setShowBulk] = useState(false);
  const [limit, setLimit] = usePersistedState('forms.limit', getOverdueDays());
  const scroll = useScrollMemory(`forms:${tab}`);

  // Only logs that expect a signed form (New User ID / EDC book) belong in this list.
  const expecting = useMemo(() => logs.filter(expectsForm), [logs]);
  const stats = useMemo(() => formStats(logs), [logs]);
  const waiting = useMemo(() => awaitingByForeman(logs), [logs]);
  const overdueCount = useMemo(
    () => expecting.filter((l) => !hasForm(l) && daysAwaiting(l) >= limit).length,
    [expecting, limit],
  );

  // Forms are marked received for a month, like bills.
  const monthCounts = useMemo(() => formMonthCounts(logs), [logs]);
  const [pickedMonth, setPickedMonth] = usePersistedState<string | null>('forms.month', null);
  const month = pickedMonth ?? ([...monthCounts.keys()].sort().pop() || monthKey());
  // An empty month means "All months": every received form, whatever month it was marked for.
  const allMonths = month === '';
  const monthText = allMonths ? 'All months' : monthLabel(month);
  const fileMonth = allMonths ? 'all-months' : month;
  const inMonth = (l: LogEntry) => hasForm(l) && (allMonths || formMonthOf(l) === month);
  const receivedInMonth = useMemo(() => expecting.filter(inMonth).length, [expecting, month]);
  const pct = stats.sent ? Math.round((receivedInMonth / stats.sent) * 100) : 0;

  // Per foreman: how many forms they gave us in the chosen month (the pane follows the month picker).
  const byForeman = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of expecting) {
      if (!inMonth(l)) continue;
      const k = foremanOf(l);
      m.set(k, (m.get(k) || 0) + 1);
    }
    // Keep the selected foreman visible even if they gave nothing this month.
    if (foreman && !m.has(foreman)) m.set(foreman, 0);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [expecting, month, foreman]);
  const topCount = byForeman.reduce((mx, r) => Math.max(mx, r.count), 0);

  // The tab counts follow the chosen foreman.
  const scope = useMemo(() => (foreman ? expecting.filter((l) => foremanOf(l) === foreman) : expecting), [expecting, foreman]);
  const scopedReceived = scope.filter(inMonth).length;
  const scopedAwaiting = scope.filter((l) => !hasForm(l)).length;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scope.filter((l) => {
      if (tab === 'received' && !inMonth(l)) return false;
      if (tab === 'awaiting' && hasForm(l)) return false;
      if (!q) return true;
      return [l.logNo, l.customerName, l.nameBn, l.nameEn, l.nmsId, l.edcNo, l.foremanName, l.upazila]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [scope, tab, search, month]);

  const picks = rows.filter((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((l) => picked.has(l.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((l) => l.id)));
  const pickForeman = (name: string) => { setForeman(name); setPicked(new Set()); };

  const markPicked = (action: MarkAction) => {
    const target = picks.filter((l) => hasForm(l) !== (action === 'received'));
    if (!target.length) { setIdsNote('Nothing to change in the selection.'); return; }
    setIdsNote('');
    onMarkMany(target, action, month || undefined);
    setPicked(new Set());
  };

  // Move the selected, already-received forms to another month.
  const receivedPicks = picks.filter(hasForm);
  const changePickedMonth = () => {
    if (!receivedPicks.length) { setIdsNote('Select forms that are already received to change their month.'); return; }
    setIdsNote('');
    onChangeMonth(receivedPicks.map((l) => ({ log: l, from: formMonthOf(l) })));
    setPicked(new Set());
  };

  // Paste a list of NMS IDs / EDC numbers / log numbers and mark them in one go.
  const markFromIds = (action: MarkAction = 'received') => {
    if (!idsText.trim()) { setIdsNote('Paste one or more NMS IDs first.'); setIdsResult(null); return; }
    const r = matchIds(idsText, expecting, (l) => hasForm(l) === (action === 'received'));
    setIdsNote('');
    setIdsAction(action);
    setIdsResult(r);
    if (r.target.length) onMarkMany(r.target, action, month || undefined);
  };

  // Excel: same layout as the "EDC Bill" sample sheet (see utils/formsExport.ts).
  const exportList = () => {
    exportFormsSample(rows, foremen, `Pace_IT_Forms_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      .catch((e) => { console.error(e); alert('Could not create the Excel file: ' + (e?.message || e)); });
  };

  // Top Sheet: one sheet per upazila, 20 institutes per sheet (see utils/topsheetExport.ts).
  const exportTop = () => {
    exportTopsheet(rows, foremen, `Pace_IT_TopSheet_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      .catch((e) => { console.error(e); alert('Could not create the Top Sheet: ' + (e?.message || e)); });
  };

  // Top Sheet as PDF: same layout as the Excel Top Sheet, A4 landscape, 20 institutes per page.
  const exportTopPdf = () => {
    exportTopsheetPdf(rows, foremen, `Pace_IT_TopSheet_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.pdf`)
      .catch((e) => { console.error(e); alert('Could not create the Top Sheet PDF: ' + (e?.message || e)); });
  };

  const exportPdf = () => exportFormsPdf({
    logs: rows,
    monthText,
    listLabel: tab === 'received' ? 'Received' : tab === 'awaiting' ? 'Pending' : 'All',
    foremanName: foreman || undefined,
    hasForm,
    nameLang,
    fileName: `Pace_IT_Forms_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.pdf`,
  });

  const tabs: { key: Tab; label: string; n: number; active: string; dot: string }[] = [
    { key: 'received', label: 'Received', n: scopedReceived, active: 'bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-emerald-600/30', dot: 'bg-emerald-500' },
    { key: 'awaiting', label: 'Pending', n: scopedAwaiting, active: 'bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-rose-500/30', dot: 'bg-rose-500' },
    { key: 'all', label: 'All', n: scope.length, active: 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand-600/30', dot: 'bg-brand-500' },
  ];
  const waitingForAdmin = expecting.filter((l) => pendingFor(pending, l.id, 'form')).length;

  const surface = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-18px_rgba(30,50,110,0.25)]';
  const ghost = 'inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  // Same size system as the Connection Records toolbar: every control is 32px tall.
  const groupBox = 'inline-flex items-stretch h-8 shrink-0 p-[2px] bg-slate-100/80 rounded-xl border border-slate-200/70';
  const cell = 'inline-flex items-center justify-center rounded-[10px] text-[11px] font-semibold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
  const segOn = 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm';
  const segOff = 'text-slate-600 hover:bg-white hover:text-brand-900';

  const Kpi: React.FC<{ icon: React.ElementType; label: string; value: number; sub: React.ReactNode; tone: 'sky' | 'rose' | 'amber'; bar?: number }> = ({ icon: Icon, label, value, sub, tone, bar }) => {
    const t = {
      sky: { halo: 'from-sky-50', icon: 'from-sky-400 to-sky-600', num: 'text-sky-700', bar: 'from-sky-400 to-teal-500' },
      rose: { halo: 'from-rose-50', icon: 'from-orange-400 to-rose-500', num: 'text-rose-600', bar: 'from-orange-400 to-rose-500' },
      amber: { halo: 'from-amber-50', icon: 'from-amber-300 to-orange-500', num: 'text-amber-600', bar: 'from-amber-300 to-orange-500' },
    }[tone];
    return (
      <div className={`relative overflow-hidden ${surface} p-5`}>
        <span className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${t.halo} to-transparent`} aria-hidden />
        <div className="relative flex items-start justify-between gap-3">
          <span className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${t.icon} text-white shadow-lg`}><Icon className="w-5 h-5" /></span>
          <span className={`text-[34px] leading-none font-extrabold font-display tabular-nums ${t.num}`}>{value}</span>
        </div>
        <div className="relative mt-4 text-[15px] font-semibold text-[#1b2a4e]">{label}</div>
        <div className="relative mt-0.5 min-h-6 flex items-center text-[11.5px] text-slate-400">{sub}</div>
        <div className={`relative mt-3.5 h-1.5 rounded-full overflow-hidden ${bar === undefined ? 'bg-transparent' : 'bg-slate-100'}`}>
          {bar !== undefined && <div className={`h-full rounded-full bg-gradient-to-r ${t.bar}`} style={{ width: `${bar}%` }} />}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-5 pb-4">
      {/* Toolbar: same card language as the Connection Records toolbar */}
      <div className="no-print @container relative w-full bg-white rounded-2xl border border-slate-100 shadow-[0_12px_32px_-16px_rgba(30,50,110,0.22)] flex flex-col text-xs">
        <span className="absolute inset-x-0 top-0 h-24 rounded-t-2xl bg-gradient-to-b from-brand-50 to-transparent pointer-events-none" aria-hidden />

        {/* Row 1: identity on the left, month + every export on the right */}
        <div className="relative px-4 sm:px-5 pt-3 pb-2 flex flex-wrap @min-[900px]:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/30 shrink-0"><ClipboardCheck className="w-4 h-4" /></span>
            <div className="min-w-0">
              <h1 className="text-[15px] leading-tight font-extrabold tracking-tight whitespace-nowrap text-[#1b2a4e]">Forms</h1>
              <p className="text-[11px] text-slate-500 tabular-nums truncate">
                {rows.length === scope.length ? `${scope.length.toLocaleString()} institutes` : `${rows.length.toLocaleString()} of ${scope.length.toLocaleString()} institutes`} · {monthText}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap @min-[900px]:flex-nowrap items-center justify-end gap-1.5 shrink-0">
            <MonthSelect compact align="right" allowAll noun="forms" value={month} onChange={(m) => { setPickedMonth(m); setPicked(new Set()); }} counts={monthCounts}
              title="Forms are marked received for this month. Choose All months to see every form together." />

            {onNameLangChange && (
              <div className={groupBox} role="group" aria-label="Institute name language">
                {([['bn', 'বাংলা', 'Show institute names in Bangla'], ['en', 'EN', 'Show institute names in English']] as const).map(([k, label, tip]) => (
                  <button key={k} type="button" onClick={() => onNameLangChange(k)} aria-pressed={nameLang === k} title={tip}
                    className={`${cell} w-[46px] ${nameLang === k ? segOn : segOff}`}>{label}</button>
                ))}
              </div>
            )}

            <div className={groupBox} role="group" aria-label="Download this list">
              <button type="button" onClick={exportList} disabled={!rows.length} title="Download this list as Excel" aria-label="Excel"
                className={`${cell} px-2.5 gap-1.5 text-emerald-700 hover:bg-white disabled:opacity-30`}><Download className="w-3.5 h-3.5" /><span>Excel</span></button>
              <button type="button" onClick={exportPdf} disabled={!rows.length} title="Download this list as PDF" aria-label="PDF"
                className={`${cell} px-2.5 gap-1.5 text-rose-600 hover:bg-white disabled:opacity-30`}><FileText className="w-3.5 h-3.5" /><span>PDF</span></button>
            </div>

            <div className={groupBox} role="group" aria-label="Top Sheet">
              <span className="inline-flex items-center gap-1.5 pl-2 pr-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none" title="One sheet per upazila, 20 institutes per sheet">
                <ClipboardCheck className="w-3.5 h-3.5 text-brand-600" /><span className="hidden @min-[1100px]:inline">Top Sheet</span>
              </span>
              <button type="button" onClick={exportTop} disabled={!rows.length} title="Download the Top Sheet as Excel: one sheet per upazila, 20 institutes per sheet" aria-label="Top Sheet Excel"
                className={`${cell} px-2.5 text-emerald-700 hover:bg-white disabled:opacity-30`}>Excel</button>
              <button type="button" onClick={exportTopPdf} disabled={!rows.length} title="Download the Top Sheet as PDF: A4 landscape, 20 institutes per page" aria-label="Top Sheet PDF"
                className={`${cell} px-2.5 text-rose-600 hover:bg-white disabled:opacity-30`}>PDF</button>
            </div>
          </div>
        </div>

        {/* Row 2: list tabs, search, bulk action */}
        <div className="relative px-4 sm:px-5 pb-3 flex flex-wrap @min-[900px]:flex-nowrap items-center gap-1.5">
          <div className="inline-flex items-stretch h-8 shrink-0 p-[2px] bg-slate-100/80 rounded-xl border border-slate-200/70" role="tablist" aria-label="Form status">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => { setTab(t.key); setPicked(new Set()); }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 rounded-[10px] text-[11px] whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    active ? `${t.active} font-semibold shadow-md` : 'text-slate-600 hover:bg-white hover:text-slate-900 font-medium'}`}>
                  {!active && t.key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
                  <span>{t.label}</span>
                  <span className={`font-mono tabular-nums text-[10px] px-1.5 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-slate-200/70 text-slate-500'}`}>{t.n}</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[110px] flex-1 basis-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institute, NMS ID, foreman..."
              className="w-full h-8 pl-9 pr-8 text-xs text-[#1b2a4e] bg-slate-50 border border-slate-200 rounded-xl hover:bg-white focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-slate-400" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="w-3 h-3" /></button>
            )}
          </div>

          {foreman && (
            <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 max-w-[14rem] shrink-0 rounded-xl border border-brand-300 bg-brand-50 text-brand-900 font-semibold">
              <Users className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span className="truncate">{foreman}</span>
              <button type="button" onClick={() => pickForeman('')} aria-label="Show all foremen" className="grid place-items-center w-5 h-5 rounded-full hover:bg-brand-100"><X className="w-3 h-3" /></button>
            </span>
          )}

          <button type="button" onClick={() => setShowBulk((v) => !v)} aria-pressed={showBulk}
            className={`inline-flex items-center justify-center gap-1.5 h-8 shrink-0 px-3 whitespace-nowrap text-[11px] font-semibold rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              showBulk ? 'bg-brand-50 border-brand-300 text-brand-900' : 'text-brand-900 bg-brand-50 hover:bg-brand-100 border-brand-200'}`}>
            <ListChecks className="w-3.5 h-3.5 text-brand-700" />Bulk mark by ID
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${showBulk ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showBulk && (
          <div className="relative px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem] animate-in fade-in slide-in-from-top-1 duration-150">
            <div>
              <h3 className="text-[13px] font-bold text-[#1b2a4e]">Bulk mark by NMS ID</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">Paste NMS IDs, EDC numbers or connection numbers, separated by spaces, commas or new lines. They are marked for {monthText}.</p>
              <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} rows={3} placeholder="55001 55002 55003"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            </div>
            <div className="flex md:flex-col gap-2 md:justify-end">
              <button type="button" onClick={() => markFromIds('received')} className="flex-1 md:flex-none h-8 text-xs font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 rounded-xl shadow-md shadow-brand-600/30 transition-all">Mark received</button>
              <button type="button" onClick={() => markFromIds('not_received')} className="flex-1 md:flex-none h-8 inline-flex items-center justify-center text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">Mark not received</button>
            </div>
            {(idsNote || idsResult) && (
              <div className="md:col-span-2 space-y-1">
                {idsNote && <p className="text-xs text-slate-600">{idsNote}</p>}
                {idsResult && <IdMatchNote result={idsResult} noun={idsAction === 'received' ? 'received' : 'not received'} />}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <Kpi icon={CheckCircle2} tone="sky" label={`Received · ${monthText}`} value={receivedInMonth} sub={`of ${stats.sent} institutes · ${pct}%`} bar={pct} />
        <Kpi icon={Clock} tone="rose" label="Pending" value={stats.awaiting} bar={stats.sent ? Math.round((stats.awaiting / stats.sent) * 100) : 0}
          sub={
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-semibold ${overdueCount ? 'text-rose-600' : 'text-emerald-600'}`}>{overdueCount} overdue</span>
              <span>after</span>
              <input type="number" min={1} max={90} value={limit} aria-label="Overdue after how many days"
                onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 365) { setLimit(n); setOverdueDays(n); } }}
                className="w-12 h-6 px-1 text-xs text-slate-700 border border-slate-200 rounded-md text-center bg-white" />
              <span>days</span>
            </span>
          } />
        <Kpi icon={Hourglass} tone="amber" label="Waiting for admin" value={waitingForAdmin} sub="requests pending approval" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[16.5rem_minmax(0,1fr)] gap-4 sm:gap-5 lg:items-stretch lg:h-[max(28rem,min(44rem,calc(100vh_-_8rem)))]">
        {/* The one foreman filter */}
        <section className={`${surface} overflow-hidden flex flex-col lg:h-full min-h-0`}>
          <h2 className="shrink-0 px-4 pt-4 pb-3 flex items-center gap-2 text-[14px] font-bold text-[#1b2a4e] border-b border-slate-100">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-brand-50 text-brand-700"><Users className="w-4 h-4" /></span>
            Foremen
            <span className="ml-auto text-[11px] font-semibold text-slate-400 tabular-nums">{byForeman.length}</span>
          </h2>
          <div className="shrink-0 px-4 py-1.5 text-[11.5px] text-slate-500 bg-slate-50/70 border-b border-slate-100">
            {allMonths ? 'Forms received · ' : 'Forms received in '}<span className="font-semibold text-slate-700">{monthText}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 max-h-72 lg:max-h-none">
            <button type="button" onClick={() => pickForeman('')} aria-pressed={!foreman}
              className={`w-full text-left px-3 py-2.5 rounded-2xl flex items-center gap-2 text-[13px] transition-colors ${!foreman ? 'bg-brand-700 text-white font-semibold shadow-sm' : 'text-slate-700 hover:bg-slate-50 font-medium'}`}>
              <span className="flex-1">All foremen</span>
              <span className={`text-[11px] tabular-nums ${!foreman ? 'text-white/80' : 'text-slate-400'}`}>{receivedInMonth}</span>
            </button>
            {byForeman.map((r) => {
              const on = foreman === r.name;
              const rpct = topCount ? Math.round((r.count / topCount) * 100) : 0;
              const awaiting = waiting.get(r.name) || waiting.get(r.name === 'Unassigned' ? 'Unassigned Foreman' : r.name) || [];
              const rs = matchForeman({ foremanName: r.name }, foremen);
              const phone = rs?.phone || awaiting.find((l) => l.foremanPhone)?.foremanPhone || '';
              const wa = awaiting.length && phone ? waLink(phone, chaseMessage(r.name, awaiting)) : null;
              return (
                <div key={r.name} className={`mt-0.5 flex items-stretch rounded-2xl transition-colors ${on ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50'}`}>
                  <button type="button" onClick={() => pickForeman(on ? '' : r.name)} aria-pressed={on} className="flex-1 min-w-0 text-left px-3 py-2">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className={`flex-1 truncate ${on ? 'font-bold text-brand-900' : 'font-medium text-slate-800'}`}>{r.name}</span>
                      <span className={`min-w-[1.5rem] text-right text-[13px] font-bold tabular-nums ${r.count ? 'text-brand-700' : 'text-slate-300'}`}>{r.count}</span>
                    </span>
                    <span className="mt-1.5 block h-1 rounded-full bg-slate-100 overflow-hidden">
                      <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${rpct}%` }} />
                    </span>
                  </button>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.name} about ${awaiting.length} awaiting form${awaiting.length === 1 ? '' : 's'}`}
                      className="shrink-0 grid place-items-center w-9 text-emerald-600 hover:bg-emerald-50 rounded-r-2xl"><MessageCircle className="w-4 h-4" /></a>
                  ) : (
                    <span title={awaiting.length === 0 ? 'Nothing outstanding to chase' : 'No phone number saved for this foreman (add it in Foremen)'}
                      className="shrink-0 grid place-items-center w-9 text-slate-300 cursor-default"><MessageCircle className="w-4 h-4" /></span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* The list */}
        <section className={`${surface} overflow-hidden min-w-0 flex flex-col lg:h-full min-h-0`}>

          <div className="shrink-0 px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={allPicked} onChange={pickAll} className="w-4 h-4 rounded accent-brand-700" />Select all {rows.length}
            </label>
            {picks.length > 0 && (
              <>
                <span className="text-slate-500 tabular-nums">{picks.length} selected</span>
                <button type="button" onClick={() => markPicked('received')} className="h-7 px-3 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">Mark received</button>
                <button type="button" onClick={() => markPicked('not_received')} className="h-7 px-3 font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">Mark not received</button>
                {receivedPicks.length > 0 && (
                  <button type="button" onClick={changePickedMonth} title="Move the selected received forms to another month"
                    className="inline-flex items-center gap-1.5 h-7 px-3 font-semibold text-brand-800 bg-brand-50 border border-brand-100 hover:bg-brand-100 rounded-lg transition-colors">
                    <CalendarDays className="w-3.5 h-3.5" />Change month
                  </button>
                )}
              </>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="flex-1 grid place-content-center px-4 py-16 text-center">
              <p className="text-sm font-semibold text-[#1b2a4e]">No institutes in this list</p>
              <p className="text-xs text-slate-400 mt-1">Try another tab, foreman or search.</p>
            </div>
          ) : (
            <div {...scroll} className="flex-1 min-h-0 max-h-[34rem] lg:max-h-none overflow-y-auto divide-y divide-slate-100">
              {rows.slice(0, 400).map((l) => {
                const pend = pendingFor(pending, l.id, 'form');
                const got = hasForm(l);
                const days = daysAwaiting(l);
                const late = !got && days >= limit;
                const gotMonth = formMonthOf(l);
                return (
                  <div key={l.id} className="group px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 hover:bg-brand-50/50 transition-colors">
                    <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select connection ${l.logNo}`} className="w-4 h-4 rounded accent-brand-700 shrink-0" />
                    <span className="grid place-items-center h-7 min-w-8 px-1.5 rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700 tabular-nums shrink-0">#{l.logNo}</span>
                    <button type="button" onClick={() => onOpenLog(l.id)} className="flex-1 min-w-[11rem] text-left">
                      <span className="block text-[13.5px] font-semibold leading-relaxed text-[#1b2a4e] truncate">{nameFor(l, nameLang).text || 'Untitled'}</span>
                      <span className="block text-[11.5px] text-slate-400 truncate">{[l.foremanName, l.nmsId, l.upazila].filter(Boolean).join(' · ')}</span>
                    </button>
                    {pend ? (
                      <button type="button" onClick={() => onToggleForm(l, month || undefined)} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors" title="Waiting for admin - click to withdraw">
                        <Hourglass className="w-3 h-3" />{pend.action === 'received' ? 'received' : 'not received'} · waiting
                      </button>
                    ) : (
                      <button type="button" onClick={() => onToggleForm(l, month || undefined)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${got ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : late ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'}`}>
                        {got
                          ? <><CheckCircle2 className="w-3.5 h-3.5" />Received{gotMonth ? ` · ${monthLabel(gotMonth, true)}` : ''}</>
                          : `Awaited${days > 0 ? ` · ${days}d` : ''}${late ? ' · overdue' : ''}`}
                      </button>
                    )}
                  </div>
                );
              })}
              {rows.length > 400 && <p className="px-4 py-3 text-[11px] text-slate-400 text-center">Showing the first 400 of {rows.length}. Use search or pick a foreman to narrow the list.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};