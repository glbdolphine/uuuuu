import React, { useMemo, useState } from 'react';
import { displayCategory } from '../utils/category';
import { CalendarDays, CheckCircle2, Clock, Download, FileText, Hourglass, ListChecks, MessageCircle, Receipt, Search, Users, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LogEntry, MarkAction, Foreman } from '../types';
import { billMonthCounts, billMonthsOf, billStats, hasBill, latestBillMonth } from '../utils/bills';
import { monthKey, monthLabel } from '../utils/months';
import { MonthSelect } from './MonthSelect';
import { PendingIndex, pendingFor } from '../utils/approvals';
import { matchForeman } from '../utils/foremen';
import { billChaseMessage, waLink } from '../utils/whatsapp';
import { showDate } from '../utils/dates';
import { NameLang, nameFor } from '../utils/names';
import { exportBillsPdf } from '../utils/exportPdf';
import { matchIds, IdMatchResult } from '../utils/markIds';
import { IdMatchNote } from './IdMatchNote';
import { usePersistedState, useScrollMemory } from '../utils/persist';

type Tab = 'not_received' | 'received' | 'all';

interface Props {
  logs: LogEntry[];
  foremen?: Foreman[];
  pending: PendingIndex;
  onToggleBill: (log: LogEntry, month?: string) => void;
  onMarkMany: (logs: LogEntry[], action: MarkAction, month?: string) => void;
  onChangeMonth: (items: { log: LogEntry; from: string }[]) => void;
  onOpenLog: (id: string) => void;
  nameLang?: NameLang;
  onNameLangChange?: (lang: NameLang) => void;
}

const foremanOf = (l: LogEntry) => l.foremanName?.trim() || 'Unassigned';

export const BillsPanel: React.FC<Props> = ({ logs, foremen = [], pending, onToggleBill, onMarkMany, onChangeMonth, onOpenLog, nameLang = 'bn', onNameLangChange }) => {
  const [tab, setTab] = usePersistedState<Tab>('bills.tab', 'received');
  const [search, setSearch] = usePersistedState('bills.search', '');
  const [foreman, setForeman] = usePersistedState('bills.foreman', '');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [idsText, setIdsText] = useState('');
  const [idsNote, setIdsNote] = useState('');
  const [idsResult, setIdsResult] = useState<IdMatchResult | null>(null);
  const [idsAction, setIdsAction] = useState<MarkAction>('received');
  const [showBulk, setShowBulk] = useState(false);

  // Bills arrive month by month, so "received" always means received for the picked month.
  const monthCounts = useMemo(() => billMonthCounts(logs), [logs]);
  const [pickedMonth, setPickedMonth] = usePersistedState<string | null>('bills.month', null);
  const scroll = useScrollMemory(`bills:${tab}`);
  const month = pickedMonth ?? ([...monthCounts.keys()].sort().pop() || monthKey());
  // An empty month means "All months": a bill counts as received if it came in for any month.
  const allMonths = month === '';
  const monthText = allMonths ? 'All months' : monthLabel(month);
  const fileMonth = allMonths ? 'all-months' : month;
  const stats = useMemo(() => billStats(logs, month), [logs, month]);
  const scoped = useMemo(() => (foreman ? billStats(logs.filter((l) => foremanOf(l) === foreman), month) : stats), [logs, foreman, month, stats]);

  // Per foreman: how many bills they gave us in the chosen month (the pane follows the month picker).
  const byForeman = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) {
      if (!hasBill(l, month)) continue;
      const k = foremanOf(l);
      m.set(k, (m.get(k) || 0) + 1);
    }
    // Keep the selected foreman visible even if they gave nothing this month.
    if (foreman && !m.has(foreman)) m.set(foreman, 0);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [logs, month, foreman]);
  const topCount = byForeman.reduce((mx, r) => Math.max(mx, r.count), 0);

  // Bills still missing for the chosen month, per foreman (for the WhatsApp reminder).
  const missingByForeman = useMemo(() => {
    const m = new Map<string, LogEntry[]>();
    for (const l of logs) {
      if (hasBill(l, month)) continue;
      const k = foremanOf(l);
      const arr = m.get(k) || [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [logs, month]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (tab === 'received' && !hasBill(l, month)) return false;
      if (tab === 'not_received' && hasBill(l, month)) return false;
      if (foreman && foremanOf(l) !== foreman) return false;
      if (!q) return true;
      return [l.logNo, l.customerName, l.nameBn, l.nameEn, l.nmsId, l.edcNo, l.foremanName, l.upazila].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [logs, tab, search, foreman, month]);

  const picks = rows.filter((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((l) => picked.has(l.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((l) => l.id)));

  const markPicked = (action: MarkAction) => {
    if (allMonths && action === 'not_received') { setIdsNote('Pick a month at the top to mark bills as not received.'); return; }
    const target = picks.filter((l) => hasBill(l, month) !== (action === 'received'));
    if (!target.length) { setIdsNote('Nothing to change in the selection.'); return; }
    setIdsNote('');
    onMarkMany(target, action, month || undefined);
    setPicked(new Set());
  };

  // Move the selected, already-received bills to another month. In "All months" each bill moves from its latest month.
  const receivedPicks = picks.filter((l) => hasBill(l, month));
  const changePickedMonth = () => {
    if (!receivedPicks.length) { setIdsNote('Select bills that are already received to change their month.'); return; }
    setIdsNote('');
    onChangeMonth(receivedPicks.map((l) => ({ log: l, from: allMonths ? latestBillMonth(l) : month })));
    setPicked(new Set());
  };

  // Paste a list of NMS IDs / EDC numbers / log numbers and mark them in one go.
  // `received` marks them received (the month is asked next); `not_received` takes off the bill for the month picked at the top.
  const markFromIds = (action: MarkAction = 'received') => {
    if (!idsText.trim()) { setIdsNote('Paste one or more NMS IDs first.'); setIdsResult(null); return; }
    if (allMonths && action === 'not_received') { setIdsNote('Pick a month at the top to mark bills as not received.'); setIdsResult(null); return; }
    const r = matchIds(idsText, logs, (l) => hasBill(l, month) === (action === 'received'));
    setIdsNote('');
    setIdsAction(action);
    setIdsResult(r);
    if (r.target.length) onMarkMany(r.target, action, month || undefined);
  };

  const exportList = () => {
    const data = rows.map((l) => ({
      'Connection No': l.logNo,
      'Institute (Bangla)': l.nameBn || l.customerName,
      'Institute (English)': l.nameEn || '',
      'NMS ID': l.nmsId,
      'Foreman': l.foremanName,
      'Upazila': l.upazila || '',
      'Category / POP': displayCategory(l),
      'Bill month': monthText,
      'Bill': hasBill(l, month) ? 'Received' : 'Not received',
      'Bill received months': billMonthsOf(l).map((m) => monthLabel(m)).join(', '),
      'Latest bill received on': l.billReceivedAt ? showDate(new Date(l.billReceivedAt)) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bills');
    XLSX.writeFile(wb, `Pace_IT_Bills_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => exportBillsPdf({
    logs: rows,
    monthText,
    listLabel: tab === 'received' ? 'Received' : tab === 'not_received' ? 'Pending' : 'All',
    foremanName: foreman || undefined,
    hasBill: (l) => hasBill(l, month),
    nameLang,
    fileName: `Pace_IT_Bills_${fileMonth}_${tab}_${new Date().toISOString().slice(0, 10)}.pdf`,
  });

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'received', label: 'Received', n: scoped.received },
    { key: 'not_received', label: 'Pending', n: scoped.notReceived },
    { key: 'all', label: 'All', n: scoped.total },
  ];
  const waiting = logs.filter((l) => pendingFor(pending, l.id, 'bill', month)).length;
  const pickForeman = (name: string) => { setForeman(name); setPicked(new Set()); };

  const surface = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-18px_rgba(30,50,110,0.25)]';
  const ghost = 'inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors';

  const Kpi: React.FC<{ icon: React.ElementType; label: string; value: number; sub: string; tone: 'sky' | 'rose' | 'amber'; bar?: number }> = ({ icon: Icon, label, value, sub, tone, bar }) => {
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
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/25"><Receipt className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1b2a4e]">Bills</h1>
            <p className="text-[13px] text-slate-500">Monthly billing records and batch status by foreman.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect align="right" allowAll noun="bills" value={month} onChange={(m) => { setPickedMonth(m); setPicked(new Set()); }} counts={monthCounts}
            title="Bills are marked for this receiving month. Choose All months to see every bill together." />
          {onNameLangChange && (
            <div className="inline-flex p-0.5 h-10 rounded-xl bg-slate-100 text-xs font-semibold" role="group" aria-label="Institute name language">
              {([['bn', 'বাংলা', 'Show institute names in Bangla'], ['en', 'EN', 'Show institute names in English']] as const).map(([k, label, tip]) => (
                <button key={k} type="button" onClick={() => onNameLangChange(k)} aria-pressed={nameLang === k} title={tip}
                  className={`w-14 rounded-[10px] transition-all ${nameLang === k ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-brand-900'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={exportList} disabled={!rows.length} className={`${ghost} h-10 disabled:opacity-40`} title="Download this list as Excel"><Download className="w-4 h-4" />Excel</button>
          <button type="button" onClick={exportPdf} disabled={!rows.length} className={`${ghost} h-10 disabled:opacity-40`} title="Download this list as PDF"><FileText className="w-4 h-4" />PDF</button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <Kpi icon={CheckCircle2} tone="sky" label={`Received · ${monthText}`} value={stats.received} sub={`of ${stats.total} institutes · ${stats.pct}%`} bar={stats.pct} />
        <Kpi icon={Clock} tone="rose" label="Pending" value={stats.notReceived} sub={allMonths ? 'no bill received yet' : `remaining for ${monthText}`} bar={stats.total ? 100 - stats.pct : 0} />
        <Kpi icon={Hourglass} tone="amber" label="Waiting for admin" value={waiting} sub="requests pending approval" />
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
            {allMonths ? 'Bills received · ' : 'Bills received in '}<span className="font-semibold text-slate-700">{monthText}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 max-h-72 lg:max-h-none">
            <button type="button" onClick={() => pickForeman('')} aria-pressed={!foreman}
              className={`w-full text-left px-3 py-2.5 rounded-2xl flex items-center gap-2 text-[13px] transition-colors ${!foreman ? 'bg-brand-700 text-white font-semibold shadow-sm' : 'text-slate-700 hover:bg-slate-50 font-medium'}`}>
              <span className="flex-1">All foremen</span>
              <span className={`text-[11px] tabular-nums ${!foreman ? 'text-white/80' : 'text-slate-400'}`}>{stats.received}</span>
            </button>
            {byForeman.map((r) => {
              const on = foreman === r.name;
              const rpct = topCount ? Math.round((r.count / topCount) * 100) : 0;
              const missing = missingByForeman.get(r.name) || [];
              const rs = matchForeman({ foremanName: r.name }, foremen);
              const phone = rs?.phone || missing.find((l) => l.foremanPhone)?.foremanPhone || '';
              const wa = missing.length && phone ? waLink(phone, billChaseMessage(r.name, missing, allMonths ? monthLabel(monthKey()) : monthText)) : null;
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
                    <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.name} about ${missing.length} missing bill${missing.length === 1 ? '' : 's'}`}
                      className="shrink-0 grid place-items-center w-9 text-emerald-600 hover:bg-emerald-50 rounded-r-2xl"><MessageCircle className="w-4 h-4" /></a>
                  ) : (
                    <span title={missing.length === 0 ? 'Nothing outstanding to chase' : 'No phone number saved for this foreman (add it in Foremen)'}
                      className="shrink-0 grid place-items-center w-9 text-slate-300 cursor-default"><MessageCircle className="w-4 h-4" /></span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* The list */}
        <section className={`${surface} overflow-hidden min-w-0 flex flex-col lg:h-full min-h-0`}>
          <div className="shrink-0 p-4 flex flex-wrap items-center gap-2.5 border-b border-slate-100">
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 text-xs font-semibold" role="tablist">
              {tabs.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setPicked(new Set()); }}
                  className={`h-8 px-3.5 rounded-[10px] transition-colors ${tab === t.key ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {t.label} <span className={`ml-1 tabular-nums ${tab === t.key ? 'text-brand-600' : 'text-slate-400'}`}>{t.n}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institute, NMS ID, foreman"
                className="w-full h-10 pl-9 pr-3 text-[13px] bg-slate-50 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:border-slate-200 placeholder:text-slate-400" />
            </div>
            <button type="button" onClick={() => setShowBulk((v) => !v)} aria-pressed={showBulk}
              className={`${ghost} h-10 ${showBulk ? 'bg-brand-50 border-brand-200 text-brand-800' : ''}`}>
              <ListChecks className="w-4 h-4" />Bulk mark by ID
            </button>
          </div>

          {showBulk && (
            <div className="shrink-0 p-4 border-b border-slate-100 bg-slate-50/60 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
              <div>
                <h3 className="text-[13px] font-bold text-[#1b2a4e]">Bulk mark by NMS ID</h3>
                <p className="text-xs text-slate-500 mt-0.5 mb-2">Paste NMS IDs, EDC numbers or connection numbers, separated by spaces, commas or new lines. They are marked for {monthText}.</p>
                <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} rows={3} placeholder="55001 55002 55003"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600" />
              </div>
              <div className="flex md:flex-col gap-2 md:justify-end">
                <button type="button" onClick={() => markFromIds('received')} className="flex-1 md:flex-none h-10 text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition-colors">Mark received</button>
                <button type="button" onClick={() => markFromIds('not_received')} className={`${ghost} flex-1 md:flex-none h-10 justify-center`}>Mark not received</button>
              </div>
              {(idsNote || idsResult) && (
                <div className="md:col-span-2 space-y-1">
                  {idsNote && <p className="text-xs text-slate-600">{idsNote}</p>}
                  {idsResult && <IdMatchNote result={idsResult} noun={idsAction === 'received' ? 'received' : 'not received'} />}
                </div>
              )}
            </div>
          )}

          <div className="shrink-0 px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={allPicked} onChange={pickAll} className="w-4 h-4 rounded accent-brand-700" />Select all {rows.length}
            </label>
            {foreman && (
              <span className="inline-flex items-center gap-1 pl-2.5 pr-1 h-6 rounded-full bg-brand-50 text-brand-800 font-semibold">
                {foreman}
                <button type="button" onClick={() => pickForeman('')} aria-label="Show all foremen" className="grid place-items-center w-4 h-4 rounded-full hover:bg-brand-100"><X className="w-3 h-3" /></button>
              </span>
            )}
            {picks.length > 0 && (
              <>
                <span className="text-slate-500 tabular-nums">{picks.length} selected</span>
                <button type="button" onClick={() => markPicked('received')} className="h-7 px-3 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">Mark received</button>
                <button type="button" onClick={() => markPicked('not_received')} className="h-7 px-3 font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">Mark not received</button>
                {receivedPicks.length > 0 && (
                  <button type="button" onClick={changePickedMonth} title="Move the selected received bills to another month"
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
                const pend = pendingFor(pending, l.id, 'bill', month);
                const got = hasBill(l, month);
                const months = billMonthsOf(l);
                const shownMonth = allMonths ? latestBillMonth(l) : month;
                return (
                  <div key={l.id} className="group px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 hover:bg-brand-50/50 transition-colors">
                    <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select connection ${l.logNo}`} className="w-4 h-4 rounded accent-brand-700 shrink-0" />
                    <span className="grid place-items-center h-7 min-w-8 px-1.5 rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700 tabular-nums shrink-0">#{l.logNo}</span>
                    <button type="button" onClick={() => onOpenLog(l.id)} className="flex-1 min-w-[11rem] text-left">
                      <span className="block text-[13.5px] font-semibold leading-relaxed text-[#1b2a4e] truncate">{nameFor(l, nameLang).text || 'Untitled'}</span>
                      <span className="block text-[11.5px] text-slate-400 truncate">{[l.foremanName, l.nmsId, l.upazila].filter(Boolean).join(' · ')}</span>
                    </button>
                    {pend ? (
                      <button type="button" onClick={() => onToggleBill(l, pend.month || month || undefined)} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors" title="Waiting for admin - click to withdraw">
                        <Hourglass className="w-3 h-3" />{pend.action === 'received' ? 'received' : 'not received'} · waiting
                      </button>
                    ) : (
                      <button type="button" onClick={() => onToggleBill(l, allMonths ? (got ? shownMonth : undefined) : month)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${got ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'}`}>
                        {got ? <><CheckCircle2 className="w-3.5 h-3.5" />Received · {monthLabel(shownMonth, true)}{allMonths && months.length > 1 ? ` +${months.length - 1}` : ''}</> : 'Not received'}
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
