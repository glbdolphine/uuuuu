import React, { useDeferredValue, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownUp, Check, ChevronDown, ChevronRight, ExternalLink, Info, Layers, Loader2, MapPin, Network, Pencil, Search, TrendingDown, TrendingUp, Wrench, X } from 'lucide-react';
import type { LogEntry, Foreman } from '../types';
import { buildCoverageReport, unionText, UnionStat, UpazilaStat } from '../utils/unionStats';
import { logUpazila, UPAZILAS } from '../utils/upazilas';
import { usePersistedState, useScrollMemory } from '../utils/persist';

interface Props {
  logs: LogEntry[];
  foremen: Foreman[];
  onOpenUpazila?: (upazilaKey: string) => void;
  onFix?: (field: 'unionName' | 'upazila', items: { id: string; value: string }[]) => Promise<unknown>;
  onOpenLog?: (id: string) => void;
}

interface FixApi {
  logsById: Map<string, LogEntry>;
  namesByUpazila: Map<string, string[]>;
  unionById: Map<string, UnionStat>;
  apply: (field: 'unionName' | 'upazila', items: { id: string; value: string }[]) => Promise<void>;
  onOpenLog?: (id: string) => void;
}

const INK = 'text-[#1b2a4e]';
const SURFACE = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-16px_rgba(30,50,110,0.22)]';
const NUM = 'tabular-nums';
const PAGE = 40;

type Tone = 'plain' | 'good' | 'warn' | 'bad';
const TONE: Record<Tone, { halo: string; icon: string; num: string; bar: string }> = {
  plain: { halo: 'from-brand-50', icon: 'from-brand-400 to-brand-700 shadow-brand-600/30', num: 'text-brand-700', bar: 'from-brand-400 to-brand-600' },
  good: { halo: 'from-emerald-50', icon: 'from-teal-400 to-emerald-600 shadow-emerald-600/30', num: 'text-emerald-600', bar: 'from-teal-400 to-emerald-500' },
  warn: { halo: 'from-amber-50', icon: 'from-amber-300 to-orange-500 shadow-orange-500/30', num: 'text-amber-600', bar: 'from-amber-300 to-orange-500' },
  bad: { halo: 'from-rose-50', icon: 'from-orange-400 to-rose-600 shadow-rose-600/30', num: 'text-rose-600', bar: 'from-orange-400 to-rose-500' },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const nameList = (names: string[], max = 2) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max} more`;

const Highlight: React.FC<{
  label: string; value: number | string; title: string; sub: string; icon: React.ElementType; tone: Tone;
}> = ({ label, value, title, sub, icon: Icon, tone }) => {
  const t = TONE[tone];
  return (
    <div className={`relative overflow-hidden ${SURFACE} p-5 flex flex-col min-h-[10.5rem]`}>
      <span className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${t.halo} to-transparent`} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${t.icon} text-white shadow-lg`}><Icon className="w-5 h-5" /></span>
        <span className={`text-[34px] leading-none font-extrabold font-display ${NUM} ${t.num}`}>{value}</span>
      </div>
      <div className="relative mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`relative mt-0.5 text-[15px] font-semibold leading-snug ${INK} line-clamp-2`} title={title}>{title}</div>
      <div className="relative mt-auto pt-2 text-[11.5px] text-slate-400 line-clamp-2">{sub}</div>
    </div>
  );
};

const Bar: React.FC<{ pct: number; tone?: Tone }> = ({ pct, tone = 'plain' }) => (
  <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden">
    <span className={`block h-full rounded-full bg-gradient-to-r ${TONE[tone].bar}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </span>
);

const Chip: React.FC<{ tone: 'good' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
    {children}
  </span>
);

// ───────────── Inline fixing ─────────────

const fixInput = 'h-8 px-2.5 text-[12px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const smallBtn = 'inline-flex items-center justify-center gap-1 h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const logTitle = (l: LogEntry) => l.nameBn || l.customerName || '(no name)';

const RecordLine: React.FC<{
  log: LogEntry; field: 'unionName' | 'upazila'; fix: FixApi; suggestionsId?: string;
}> = ({ log, field, fix, suggestionsId }) => {
  const initial = field === 'unionName' ? log.unionName || '' : log.upazila || '';
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const changed = value.trim() !== initial.trim() && value.trim() !== '';
  const save = async () => {
    setBusy(true); setErr('');
    try { await fix.apply(field, [{ id: log.id, value: value.trim() }]); }
    catch (e: any) { setErr(e?.message || 'Could not save'); }
    setBusy(false);
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-xl bg-white border border-slate-100">
      <span className={`shrink-0 text-[11px] font-bold text-brand-700 bg-brand-50 rounded-md px-1.5 py-0.5 ${NUM}`}>#{log.logNo}</span>
      <span className="flex-1 min-w-[10rem]">
        <span className={`block text-[12.5px] font-semibold truncate ${INK}`}>{logTitle(log)}</span>
        <span className="block text-[11px] text-slate-400 truncate">{[log.foremanName, log.date].filter(Boolean).join(' · ')}</span>
      </span>
      {field === 'unionName' ? (
        <input className={`${fixInput} w-44`} value={value} list={suggestionsId} placeholder="Union name"
          onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changed && !busy && save()} />
      ) : (
        <select className={`${fixInput} w-44`} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Choose upazila…</option>
          {UPAZILAS.map((u) => <option key={u.key} value={u.key}>{u.key} · {u.bn}</option>)}
        </select>
      )}
      <button type="button" onClick={save} disabled={!changed || busy}
        className={`${smallBtn} text-white bg-brand-700 hover:bg-brand-800`}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
      </button>
      {fix.onOpenLog && (
        <button type="button" onClick={() => fix.onOpenLog!(log.id)} title="Open the full record"
          className={`${smallBtn} text-slate-600 bg-slate-100 hover:bg-slate-200 px-2`}>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
      {err && <span className="w-full text-[11px] text-rose-600">{err}</span>}
    </li>
  );
};

const UnionFixPanel: React.FC<{ u: UnionStat; fix: FixApi }> = ({ u, fix }) => {
  const [name, setName] = useState(u.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const records = useMemo(() => u.logIds.map((id) => fix.logsById.get(id)).filter(Boolean) as LogEntry[], [u.logIds, fix.logsById]);
  const listId = `unions-${u.upazila}`;
  const target = unionText(name);
  const existing = target && target !== u.name ? fix.unionById.get(`${u.upazila}::${target}`) : undefined;
  const canApply = Boolean(target) && target !== u.name && !busy && records.length > 0;
  const shown = showAll ? records : records.slice(0, 6);

  const apply = async () => {
    setBusy(true); setErr('');
    try { await fix.apply('unionName', records.map((r) => ({ id: r.id, value: target }))); }
    catch (e: any) { setErr(e?.message || 'Could not save'); }
    setBusy(false);
  };

  return (
    <div className="mt-2 ml-10 mr-1 mb-1 rounded-2xl border border-amber-100 bg-amber-50/40 p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
      <datalist id={listId}>{(fix.namesByUpazila.get(u.upazila) || []).map((n) => <option key={n} value={n} />)}</datalist>

      <div>
        <p className="text-[11.5px] font-semibold text-slate-600 mb-1.5">Rename this union for all {plural(records.length, 'record')}</p>
        {u.similarTo.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[11px] text-slate-500">Looks like:</span>
            {u.similarTo.map((v) => (
              <button key={v.name} type="button" onClick={() => setName(v.name)}
                className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-white border border-amber-200 text-amber-800 hover:bg-amber-100">
                Use “{v.name}” <span className={`text-amber-600 ${NUM}`}>({v.count})</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${fixInput} flex-1 min-w-[12rem]`} value={name} list={listId} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canApply && apply()} placeholder="Correct union name" />
          <button type="button" onClick={apply} disabled={!canApply}
            className={`${smallBtn} text-white bg-brand-700 hover:bg-brand-800`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
            Apply to {records.length}
          </button>
        </div>
        {canApply && (
          <p className="mt-1.5 text-[11.5px] text-slate-500">
            {plural(records.length, 'record')} in {u.upazila}: “{u.name}” → “{target}”.
            {existing ? <b className="text-emerald-700"> They will merge with the existing “{target}” ({existing.count}).</b> : ' This creates a new spelling.'}
          </p>
        )}
        {err && <p className="mt-1.5 text-[11.5px] text-rose-600">{err}</p>}
      </div>

      <div>
        <p className="text-[11.5px] font-semibold text-slate-600 mb-1.5">Or fix single records</p>
        <ul className="space-y-1.5">
          {shown.map((r) => <RecordLine key={r.id} log={r} field="unionName" fix={fix} suggestionsId={listId} />)}
        </ul>
        {records.length > 6 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1.5 text-[12px] font-medium text-brand-700 hover:underline">
            {showAll ? 'Show fewer' : `Show all ${records.length}`}
          </button>
        )}
      </div>
    </div>
  );
};

const MissingPanel: React.FC<{ kind: 'union' | 'upazila'; records: LogEntry[]; foremen: Foreman[]; fix: FixApi; onClose: () => void }> = ({ kind, records, foremen, fix, onClose }) => {
  const [limit, setLimit] = useState(15);
  return (
    <section className={`${SURFACE} p-4 sm:p-5 border-amber-200`}>
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="w-4 h-4 text-amber-600" />
        <h2 className={`text-[14px] font-bold ${INK}`}>{kind === 'union' ? 'Records without a union' : 'Records without an upazila'}</h2>
        <span className={`text-[12px] text-slate-400 ${NUM}`}>{records.length} left</span>
        <button type="button" onClick={onClose} className="ml-auto grid place-items-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      {records.length === 0 ? (
        <p className="text-[13px] text-emerald-700">All fixed. Nothing left to do here.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {records.slice(0, limit).map((r) => {
              const up = logUpazila(r, foremen) || '';
              const lid = `unions-${up}`;
              return (
                <React.Fragment key={r.id}>
                  {kind === 'union' && <datalist id={lid}>{(fix.namesByUpazila.get(up) || []).map((n) => <option key={n} value={n} />)}</datalist>}
                  <RecordLine log={r} field={kind === 'union' ? 'unionName' : 'upazila'} fix={fix} suggestionsId={lid} />
                </React.Fragment>
              );
            })}
          </ul>
          {records.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + 15)} className="mt-2 text-[12px] font-medium text-brand-700 hover:underline">
              Show {Math.min(15, records.length - limit)} more ({records.length - limit} remaining)
            </button>
          )}
        </>
      )}
    </section>
  );
};

// ───────────── One union line ─────────────

const UnionRow: React.FC<{
  u: UnionStat; rank: number; max: number; isTop: boolean; isBottom: boolean; showUpazila?: boolean; fix?: FixApi;
}> = ({ u, rank, max, isTop, isBottom, showUpazila, fix }) => {
  const similar = u.similarTo;
  const [open, setOpen] = useState(false);
  return (
    <li className={`px-3 py-2 rounded-2xl transition-colors ${open ? 'bg-slate-50/70' : 'hover:bg-slate-50'}`}>
      <div className={`flex items-center gap-3 ${fix ? 'cursor-pointer' : ''}`}
        onClick={fix ? () => setOpen((v) => !v) : undefined}
        role={fix ? 'button' : undefined} tabIndex={fix ? 0 : undefined} aria-expanded={fix ? open : undefined}
        onKeyDown={fix ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } } : undefined}>
        <span className={`w-7 shrink-0 text-right text-[11px] text-slate-300 ${NUM}`}>{rank}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`text-[13px] font-semibold truncate ${INK}`}>{u.name}</span>
            {showUpazila && <span className="shrink-0 text-[11px] text-slate-400">· {u.upazila}</span>}
            {isTop && <Chip tone="good">Most</Chip>}
            {isBottom && !isTop && <Chip tone="warn">Least</Chip>}
            {similar.length > 0 && <Chip tone="warn">Check spelling</Chip>}
            {fix && similar.length > 0 && !open && <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"><Wrench className="w-3 h-3" />Fix</span>}
          </span>
          {similar.length > 0 && (
            <span className="block text-[11px] text-amber-700 truncate" title="Written differently but looks like the same union. Fix the spelling in the records and they will count as one.">
              Looks like: {similar.map((v) => `${v.name} (${v.count})`).join(', ')}
            </span>
          )}
        </span>
        <span className="hidden sm:block w-28 shrink-0"><Bar pct={max ? (u.count / max) * 100 : 0} tone={isBottom && !isTop ? 'warn' : 'plain'} /></span>
        <span className={`w-10 shrink-0 text-right text-[14px] font-bold ${NUM} ${INK}`}>{u.count}</span>
        {fix && (open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />)}
      </div>
      {fix && open && <UnionFixPanel u={u} fix={fix} />}
    </li>
  );
};

// ───────────── One upazila (expandable) ─────────────

const UpazilaRow: React.FC<{
  u: UpazilaStat; rank: number; max: number; isTop: boolean; isBottom: boolean;
  open: boolean; onToggle: () => void; onOpenRecords?: () => void; fix?: FixApi;
}> = ({ u, rank, max, isTop, isBottom, open, onToggle, onOpenRecords, fix }) => {
  const [asc, setAsc] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [onlySimilar, setOnlySimilar] = useState(false);
  const unions = useMemo(() => {
    const base = onlySimilar ? u.unions.filter((x) => x.similarTo.length > 0) : u.unions;
    return asc ? [...base].reverse() : base;
  }, [u.unions, asc, onlySimilar]);
  const similarCount = useMemo(() => u.unions.filter((x) => x.similarTo.length > 0).length, [u.unions]);
  const topIds = useMemo(() => new Set(u.topUnions.map((x) => x.id)), [u.topUnions]);
  const botIds = useMemo(() => new Set(u.bottomUnions.map((x) => x.id)), [u.bottomUnions]);
  const unionMax = u.unions[0]?.count || 0;
  const single = u.unions.length > 0 && u.topUnions.length === u.unions.length; // every union is tied

  return (
    <li className="rounded-2xl border border-transparent data-[open=true]:border-slate-100 data-[open=true]:bg-slate-50/50" data-open={open}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full text-left px-3 py-3 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        <span className={`w-6 shrink-0 text-right text-[11px] text-slate-300 ${NUM}`}>{rank}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`text-[14px] font-semibold ${INK}`}>{u.key}</span>
            <span className="text-[12px] text-slate-400 truncate">{u.bn}</span>
            {isTop && u.count > 0 && <Chip tone="good">Most</Chip>}
            {isBottom && !isTop && <Chip tone="warn">{u.count === 0 ? 'None' : 'Least'}</Chip>}
          </span>
          <span className="block text-[11.5px] text-slate-400">
            {plural(u.unions.length, 'union')}{u.noUnion > 0 ? ` · ${u.noUnion} without a union` : ''}
          </span>
        </span>
        <span className="hidden sm:block w-40 shrink-0"><Bar pct={max ? (u.count / max) * 100 : 0} tone={isBottom && !isTop ? 'warn' : 'plain'} /></span>
        <span className={`w-14 shrink-0 text-right text-[11px] text-slate-400 ${NUM}`}>{u.share.toFixed(1)}%</span>
        <span className={`w-12 shrink-0 text-right text-[16px] font-extrabold font-display ${NUM} ${INK}`}>{u.count}</span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[11.5px] text-slate-500">
            {u.unions.length > 0 && !single && (
              <span>
                Most: <b className={INK}>{nameList(u.topUnions.map((x) => x.name))}</b> ({u.topUnions[0].count})
                <span className="mx-2 text-slate-300">|</span>
                Least: <b className={INK}>{nameList(u.bottomUnions.map((x) => x.name))}</b> ({u.bottomUnions[0].count})
                {u.bottomUnions.length > 2 && <span className="text-slate-400"> · {u.bottomUnions.length} unions tied</span>}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              {similarCount > 0 && (
                <button type="button" onClick={() => setOnlySimilar((v) => !v)} aria-pressed={onlySimilar}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border text-[11px] font-medium ${onlySimilar ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-amber-700 hover:border-amber-300'}`}>
                  Spelling check ({similarCount})
                </button>
              )}
              {u.unions.length > 1 && (
                <button type="button" onClick={() => setAsc((v) => !v)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-600 hover:border-brand-400">
                  <ArrowDownUp className="w-3 h-3" /> {asc ? 'Least first' : 'Most first'}
                </button>
              )}
              {onOpenRecords && u.count > 0 && (
                <button type="button" onClick={onOpenRecords}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-brand-700 hover:border-brand-400">
                  View records
                </button>
              )}
            </span>
          </div>
          {u.unions.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-slate-400">
              {u.count === 0 ? 'No connections in this upazila yet.' : 'None of these connections has a union written yet.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {unions.slice(0, limit).map((x, i) => (
                <UnionRow key={x.id} u={x} rank={asc ? unions.length - i : i + 1} max={unionMax}
                  isTop={!single && topIds.has(x.id)} isBottom={!single && botIds.has(x.id)} fix={fix} />
              ))}
            </ul>
          )}
          {unions.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + PAGE)}
              className="mt-2 ml-3 text-[12px] font-medium text-brand-700 hover:underline">
              Show {Math.min(PAGE, unions.length - limit)} more of {unions.length - limit}
            </button>
          )}
        </div>
      )}
    </li>
  );
};

// ───────────── Page ─────────────

export const CoverageAnalytics: React.FC<Props> = ({ logs, foremen, onOpenUpazila, onFix, onOpenLog }) => {
  // Recomputed from the live records whenever they change, so renamed / added / deleted unions are picked up automatically.
  const report = useMemo(() => buildCoverageReport(logs, foremen), [logs, foremen]);

  const [tab, setTab] = usePersistedState<'upazila' | 'union'>('coverage.tab', 'upazila');
  const [openKey, setOpenKey] = useState<string>('');
  const [query, setQuery] = usePersistedState('coverage.query', '');
  const dq = useDeferredValue(query);
  const [unionUpazila, setUnionUpazila] = usePersistedState('coverage.unionUpazila', '');
  const [asc, setAsc] = useState(false);
  const [onlySimilar, setOnlySimilar] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [missingOpen, setMissingOpen] = useState<'union' | 'upazila' | null>(null);

  const fix = useMemo<FixApi | undefined>(() => {
    if (!onFix) return undefined;
    const logsById = new Map(logs.map((l) => [l.id, l] as const));
    const unionById = new Map(report.unions.map((u) => [u.id, u] as const));
    const namesByUpazila = new Map<string, string[]>();
    for (const u of report.unions) {
      const arr = namesByUpazila.get(u.upazila);
      if (arr) arr.push(u.name); else namesByUpazila.set(u.upazila, [u.name]);
    }
    return {
      logsById, unionById, namesByUpazila, onOpenLog,
      // The page recomputes on its own once the records reload, so a fixed union disappears or merges at once.
      apply: async (field, items) => { await onFix(field, items); },
    };
  }, [onFix, onOpenLog, logs, report.unions]);

  // Records that are left out of the numbers, so they can be listed and fixed right here.
  const missing = useMemo(() => {
    const noUnion: LogEntry[] = [];
    for (const l of logs) {
      if (l.deletedAt) continue;
      if (logUpazila(l, foremen) && !unionText(l.unionName)) noUnion.push(l);
    }
    return { noUnion, noUpazila: report.noUpazila };
  }, [logs, foremen, report.noUpazila]);

  const maxUpazila = report.upazilas[0]?.count || 0;
  const topUpIds = new Set(report.topUpazilas.map((x) => x.key));
  const botUpIds = new Set(report.bottomUpazilas.map((x) => x.key));
  const allSameUpazila = report.topUpazilas.length === report.upazilas.length;

  const topIds = useMemo(() => new Set(report.topUnions.map((x) => x.id)), [report.topUnions]);
  const botIds = useMemo(() => new Set(report.bottomUnions.map((x) => x.id)), [report.bottomUnions]);

  const unionRows = useMemo(() => {
    const q = dq.trim().toLowerCase();
    let rows = report.unions;
    if (unionUpazila) rows = rows.filter((u) => u.upazila === unionUpazila);
    if (onlySimilar) rows = rows.filter((u) => u.similarTo.length > 0);
    if (q) rows = rows.filter((u) => u.name.toLowerCase().includes(q));
    return asc ? [...rows].reverse() : rows;
  }, [report.unions, dq, unionUpazila, asc, onlySimilar]);

  const unionMax = report.unions[0]?.count || 0;
  const topUp = report.topUpazilas[0];
  const botUp = report.bottomUpazilas[0];
  const topUn = report.topUnions[0];
  const botUn = report.bottomUnions[0];
  const covered = report.upazilas.filter((u) => u.count > 0).length;
  const missingTotal = report.noUnion + report.noUpazila.length;

  if (report.total === 0) {
    return (
      <div className={`${SURFACE} p-10 text-center`}>
        <Network className="w-8 h-8 mx-auto text-slate-300" />
        <h2 className={`mt-3 text-lg font-bold ${INK}`}>No connections yet</h2>
        <p className="mt-1 text-sm text-slate-400">Once connection records are added, this page ranks upazilas and unions by connections automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className={`font-display text-2xl font-extrabold ${INK}`}>Coverage</h1>
        <p className="text-[13px] text-slate-500">
          Connections per upazila and union. Calculated live from Connection Records, so adding, editing or renaming a union updates everything here.
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Highlight tone="good" icon={TrendingUp} label="Most connections · Upazila" value={topUp.count}
          title={nameList(report.topUpazilas.map((x) => x.key))}
          sub={allSameUpazila ? 'All upazilas are level' : `${topUp.share.toFixed(1)}% of all connections · ${plural(topUp.unions.length, 'union')}`} />
        <Highlight tone="warn" icon={TrendingDown} label="Least connections · Upazila" value={botUp.count}
          title={nameList(report.bottomUpazilas.map((x) => x.key))}
          sub={botUp.count === 0 ? `${plural(report.bottomUpazilas.length, 'upazila')} with no connections yet` : `${botUp.share.toFixed(1)}% of all connections`} />
        <Highlight tone="good" icon={MapPin} label="Most connections · Union" value={topUn?.count ?? 0}
          title={topUn ? nameList(report.topUnions.map((x) => `${x.name} (${x.upazila})`), 1) : 'No unions written yet'}
          sub={topUn ? (report.topUnions.length > 1 ? `${report.topUnions.length} unions tied for the most` : 'Highest of all unions') : 'Fill in the Union field on records'} />
        <Highlight tone="warn" icon={Layers} label="Least connections · Union" value={botUn?.count ?? 0}
          title={botUn ? nameList(report.bottomUnions.map((x) => `${x.name} (${x.upazila})`), 1) : 'No unions written yet'}
          sub={botUn ? (report.bottomUnions.length > 1 ? `${plural(report.bottomUnions.length, 'union')} tied for the fewest` : 'Lowest of all unions') : ''} />
      </div>

      <div className={`${SURFACE} px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-slate-500`}>
        <span><b className={`${INK} ${NUM}`}>{report.total.toLocaleString()}</b> connections</span>
        <span><b className={`${INK} ${NUM}`}>{covered}</b> of {report.upazilas.length} upazilas covered</span>
        <span><b className={`${INK} ${NUM}`}>{report.unions.length.toLocaleString()}</b> {report.unions.length === 1 ? 'union' : 'unions'} detected</span>
        {report.lookAlikes > 0 && (
          <button type="button" onClick={() => { setTab('union'); setOnlySimilar(true); setLimit(PAGE); }}
            className="inline-flex items-center gap-1 text-amber-700 hover:underline"
            title="Unions written differently that look like the same union (e.g. Deokalash / deokalash). They are counted separately until the spelling is fixed.">
            <Info className="w-3.5 h-3.5" /><b className={NUM}>{report.lookAlikes}</b> unions need a spelling check
          </button>
        )}
        {missingTotal > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <Info className="w-3.5 h-3.5" />
            {report.noUnion > 0 && (fix
              ? <button type="button" onClick={() => setMissingOpen(missingOpen === 'union' ? null : 'union')} className="underline decoration-dotted hover:text-amber-900">{plural(report.noUnion, 'record')} without a union</button>
              : `${plural(report.noUnion, 'record')} without a union`)}
            {report.noUnion > 0 && report.noUpazila.length > 0 && ' · '}
            {report.noUpazila.length > 0 && (fix
              ? <button type="button" onClick={() => setMissingOpen(missingOpen === 'upazila' ? null : 'upazila')} className="underline decoration-dotted hover:text-amber-900">{plural(report.noUpazila.length, 'record')} without an upazila</button>
              : `${plural(report.noUpazila.length, 'record')} without an upazila`)}
            <span className="text-slate-400">(not counted below{fix ? ' · click to fix' : ''})</span>
          </span>
        )}
      </div>

      {fix && missingOpen && (
        <MissingPanel kind={missingOpen} fix={fix} foremen={foremen} onClose={() => setMissingOpen(null)}
          records={missingOpen === 'union' ? missing.noUnion : missing.noUpazila} />
      )}

      <section className={`${SURFACE} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 text-[12px] font-semibold">
            {([['upazila', 'By upazila'], ['union', 'All unions']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                className={`h-8 px-3.5 rounded-lg transition-colors ${tab === id ? 'bg-white text-brand-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'union' && (
            <>
              <div className="relative flex-1 min-w-[10rem] max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search a union…"
                  className="w-full h-9 pl-8 pr-3 text-[12px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500" />
              </div>
              <select value={unionUpazila} onChange={(e) => { setUnionUpazila(e.target.value); setLimit(PAGE); }}
                className="h-9 px-3 text-[12px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500">
                <option value="">All upazilas</option>
                {report.upazilas.map((u) => <option key={u.key} value={u.key}>{u.key}</option>)}
              </select>
              <button type="button" onClick={() => { setOnlySimilar((v) => !v); setLimit(PAGE); }} aria-pressed={onlySimilar}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12px] font-medium ${onlySimilar ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'}`}>
                Spelling check only
              </button>
              <button type="button" onClick={() => setAsc((v) => !v)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-slate-200 text-[12px] font-medium text-slate-600 hover:border-brand-400">
                <ArrowDownUp className="w-3.5 h-3.5" /> {asc ? 'Least first' : 'Most first'}
              </button>
            </>
          )}
        </div>

        {fix && tab === 'union' && (
          <p className="px-1 pb-2 text-[11.5px] text-slate-400">Click any union to rename it, merge it into another spelling, or fix single records. Changes save straight away.</p>
        )}

        {tab === 'upazila' ? (
          <ul className="space-y-0.5">
            {report.upazilas.map((u, i) => (
              <UpazilaRow key={u.key} u={u} rank={i + 1} max={maxUpazila}
                isTop={!allSameUpazila && topUpIds.has(u.key)} isBottom={!allSameUpazila && botUpIds.has(u.key)}
                open={openKey === u.key} onToggle={() => setOpenKey(openKey === u.key ? '' : u.key)}
                onOpenRecords={onOpenUpazila ? () => onOpenUpazila(u.key) : undefined} fix={fix} />
            ))}
          </ul>
        ) : unionRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-slate-400">No union matches.</p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {unionRows.slice(0, limit).map((u, i) => (
                <UnionRow key={u.id} u={u} rank={asc ? unionRows.length - i : i + 1} max={unionMax} showUpazila
                  isTop={topIds.has(u.id) && report.topUnions.length !== report.unions.length}
                  isBottom={botIds.has(u.id) && report.bottomUnions.length !== report.unions.length} fix={fix} />
              ))}
            </ul>
            {unionRows.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-3 ml-3 text-[12px] font-medium text-brand-700 hover:underline">
                Show {Math.min(PAGE, unionRows.length - limit)} more ({unionRows.length - limit} remaining)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
};
