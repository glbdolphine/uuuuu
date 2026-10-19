import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogEntry } from '../types';
import {
  Search,
  Plus,
  Table,
  Tag,
  Check,
  FileText,
  FileSpreadsheet,
  Printer,
  List,
  PanelRight,
  SlidersHorizontal,
  UploadCloud,
  ListChecks,
  ChevronDown,
  X,
  Calendar,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { exportBatchLogsPdf } from '../utils/exportPdf';
import { exportBatchLogsExcel } from '../utils/exportExcel';
import type { FormFilter, ImportPlan } from '../utils/forms';
import type { FollowFilter } from '../utils/followUps';
import type { Foreman } from '../types';
import { UPAZILAS, upazilaKey, foremanServes } from '../utils/upazilas';
import { toInputDate } from '../utils/dates';
import type { NameLang } from '../utils/names';
import { categoryStyle } from '../utils/categoryStyle';

export type StatusFilter = 'all' | 'pending' | 'in_progress' | 'resolved';
export type ViewMode = 'list' | 'split';
export type SortBy = 'log_desc' | 'log_asc' | 'date_desc' | 'date_asc' | 'upazila' | 'foreman';

const STATUS_OPTIONS: { key: StatusFilter; label: string; active: string; dot: string }[] = [
  { key: 'all', label: 'All', active: 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand-600/30', dot: 'bg-brand-500' },
  { key: 'pending', label: 'Pending', active: 'bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-rose-500/30', dot: 'bg-rose-500' },
  { key: 'in_progress', label: 'In Progress', active: 'bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-orange-500/30', dot: 'bg-amber-500' },
  { key: 'resolved', label: 'Resolved', active: 'bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-emerald-600/30', dot: 'bg-emerald-500' },
];

const INK = 'text-[#1b2a4e]';

export const STANDARD_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'Primary Education', label: 'Primary' },
  { key: 'Secondary and Higher Secondary Education', label: 'Secondary & Higher Secondary' },
  { key: 'Technical Education', label: 'Technical' },
  { key: 'Ministry of Law', label: 'Ministry of Law' },
  { key: 'Department of Social Services', label: 'Social Services' },
  { key: 'Diabetic Association of Bangladesh', label: 'Diabetic Association' },
  { key: 'National University', label: 'National University' },
  { key: 'Madrasa Education', label: 'Madrasa' },
  { key: 'Health Service', label: 'Health' },
  { key: 'Land Reform Board', label: 'Land Reform' },
  { key: 'Govt. Organization', label: 'Govt. Org' },
];

interface LogsToolbarProps {
  totalCount: number;
  filteredLogs: LogEntry[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onJumpToLog: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  nameLang?: NameLang;
  onNameLangChange?: (lang: NameLang) => void;
  onPrintAll: () => void;
  allLogs: LogEntry[];
  formFilter: FormFilter;
  onFormFilterChange: (f: FormFilter) => void;
  onPickFormForeman: (name: string) => void;
  onApplyFormImport: (plan: ImportPlan) => Promise<void>;
  foremen: Foreman[];
  followFilter: FollowFilter;
  onFollowFilterChange: (f: FollowFilter) => void;
  followCounts: { today: number; overdue: number };
  upazilaFilter: string;
  onUpazilaFilterChange: (v: string) => void;
  foremanFilter: string;
  onForemanFilterChange: (v: string) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (cat: string) => void;
  categoryCounts?: Record<string, number>;
  onOpenCsvImport?: () => void;
  onOpenFieldFill?: () => void;
  onNewLog?: () => void;
}

const CategoryMenu: React.FC<{
  value: string;
  onChange: (key: string) => void;
  counts: Record<string, number>;
  total: number;
}> = ({ value, onChange, counts, total }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = STANDARD_CATEGORIES.find((c) => c.key === value) ?? STANDARD_CATEGORIES[0];
  const isAll = current.key === 'all';
  const countOf = (key: string) => (key === 'all' ? total : counts[key] || 0);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 h-8 pl-2.5 pr-2 max-w-full min-w-0 rounded-xl border text-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          open || !isAll
            ? 'bg-white border-brand-300 shadow-[0_6px_16px_-10px_rgba(30,50,110,0.35)]'
            : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'
        }`}
      >
        <span className={`grid place-items-center w-6 h-6 shrink-0 rounded-lg ${isAll ? 'bg-brand-50 text-brand-700' : categoryStyle(current.key).pill}`}>
          <Tag className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden @min-[1500px]:inline shrink-0">Category</span>
        <span title={isAll ? 'All' : current.key} className={`font-semibold ${INK} min-w-0 max-w-[7rem] truncate`}>{isAll ? 'All' : current.key}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-mono font-semibold text-slate-600 tabular-nums shrink-0">{countOf(current.key)}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Institute category"
          className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-100 shadow-[0_18px_40px_-14px_rgba(30,50,110,0.35)] p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {STANDARD_CATEGORIES.map((cat) => {
            const active = value === cat.key;
            const st = categoryStyle(cat.key);
            const n = countOf(cat.key);
            return (
              <button
                key={cat.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(cat.key); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                  active ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${cat.key === 'all' ? 'bg-brand-500' : st.dot}`} />
                <span className={`flex-1 truncate ${active ? 'font-bold text-brand-900' : `font-medium ${INK}`}`}>
                  {cat.key === 'all' ? 'All categories' : cat.key}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono tabular-nums ${active ? 'bg-brand-200 text-brand-900 font-semibold' : 'bg-slate-100 text-slate-500'}`}>
                  {n}
                </span>
                <Check className={`w-3.5 h-3.5 shrink-0 text-brand-600 ${active ? 'opacity-100' : 'opacity-0'}`} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const LogsToolbar: React.FC<LogsToolbarProps> = ({
  totalCount,
  filteredLogs,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onJumpToLog,
  viewMode,
  onViewModeChange,
  nameLang = 'bn',
  onNameLangChange,
  onPrintAll,
  allLogs,
  formFilter,
  onFormFilterChange,
  onPickFormForeman,
  onApplyFormImport,
  foremen,
  followFilter,
  onFollowFilterChange,
  followCounts,
  upazilaFilter,
  onUpazilaFilterChange,
  foremanFilter,
  onForemanFilterChange,
  sortBy,
  onSortChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  categoryFilter = 'all',
  onCategoryFilterChange,
  categoryCounts = {},
  onOpenCsvImport,
  onOpenFieldFill,
  onNewLog,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: allLogs.length, pending: 0, in_progress: 0, resolved: 0 };
    for (const l of allLogs) {
      const t = (l.status || '').toLowerCase();
      if (t.includes('pending') || t.includes('waiting')) c.pending++;
      if (t.includes('progress')) c.in_progress++;
      if (t.includes('resolved') || t.includes('closed')) c.resolved++;
    }
    return c;
  }, [allLogs]);

  const none = filteredLogs.length === 0;
  const foremanOptions = foremen
    .filter((r) => !upazilaFilter || foremanServes(r, upazilaFilter))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasAdvancedActive = Boolean(dateFrom || dateTo || followFilter !== 'all');
  // Typing in the search box is searching, not filtering, so it doesn't count here.
  const hasAnyFilterActive = Boolean(
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    upazilaFilter ||
    foremanFilter ||
    dateFrom ||
    dateTo ||
    followFilter !== 'all' ||
    formFilter !== 'all'
  );

  const handleClearAllFilters = () => {
    onSearchChange('');
    onStatusFilterChange('all');
    if (onCategoryFilterChange) onCategoryFilterChange('all');
    onUpazilaFilterChange('');
    onForemanFilterChange('');
    onDateRangeChange('', '');
    onFollowFilterChange('all');
    onFormFilterChange('all');
  };

  // One size system: every control is 32px tall; segmented cells are 46px wide, standalone buttons 98px (= two cells).
  const selClass =
    `h-8 min-w-0 text-xs font-medium ${INK} bg-slate-50 border border-slate-200 hover:bg-white hover:border-slate-300 rounded-xl px-2.5 focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors cursor-pointer truncate`;
  const actionBtn =
    'inline-flex items-center justify-center gap-1.5 h-8 w-[98px] @max-[1180px]:w-[90px] shrink-0 px-2 whitespace-nowrap text-[11px] font-semibold rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
  const groupBox = 'inline-flex items-stretch h-8 shrink-0 p-[2px] bg-slate-100/80 rounded-xl border border-slate-200/70';
  const cell = 'w-[46px] @max-[1180px]:w-[40px] inline-flex items-center justify-center rounded-[10px] text-[11px] font-semibold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
  const segOn = 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm';
  const segOff = 'text-slate-600 hover:bg-white hover:text-brand-900';

  return (
    <div className="no-print @container relative w-full max-w-[1400px] mx-auto bg-white rounded-2xl border border-slate-100 shadow-[0_12px_32px_-16px_rgba(30,50,110,0.22)] flex flex-col text-xs">
      <span className="absolute inset-x-0 top-0 h-24 rounded-t-2xl bg-gradient-to-b from-brand-50 to-transparent pointer-events-none" aria-hidden />

      {/* ── ROW 1: identity + category on the left, every action on the right ── */}
      <div className="relative px-4 sm:px-5 pt-3 pb-2 flex flex-wrap @min-[900px]:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3 min-w-0 shrink">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/30 shrink-0">
            <Table className="w-4 h-4" />
          </span>
          <div className="shrink-0">
            <h1 className={`text-[15px] leading-tight font-extrabold tracking-tight whitespace-nowrap ${INK}`}>Connection Records</h1>
            <p className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
              {filteredLogs.length === totalCount
                ? `${totalCount.toLocaleString()} connections`
                : `${filteredLogs.length.toLocaleString()} of ${totalCount.toLocaleString()} connections`}
            </p>
          </div>
          {onCategoryFilterChange && (
            <div className="ml-1 sm:ml-2 min-w-0 shrink">
              <CategoryMenu value={categoryFilter} onChange={onCategoryFilterChange} counts={categoryCounts} total={allLogs.length} />
            </div>
          )}
          {hasAnyFilterActive && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="inline-flex items-center justify-center h-8 w-8 shrink-0 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
              title="Reset all filters" aria-label="Reset all filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap @min-[900px]:flex-nowrap items-center justify-end gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => exportBatchLogsExcel(filteredLogs)}
            disabled={none}
            className={`${actionBtn} text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed`}
            title={`Export the ${filteredLogs.length.toLocaleString()} connections currently listed (with your filters) as an Excel file`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export this list</span>
          </button>

          {onOpenFieldFill && (
            <button
              type="button"
              onClick={onOpenFieldFill}
              className={`${actionBtn} text-brand-900 bg-brand-50 hover:bg-brand-100 border-brand-200`}
              title="Fill one field (e.g. MAC) on many connections from a pasted list"
            >
              <ListChecks className="w-3.5 h-3.5 text-brand-700" />
              <span>Fill field</span>
            </button>
          )}

          {onOpenCsvImport && (
            <button
              type="button"
              onClick={onOpenCsvImport}
              className={`${actionBtn} text-brand-900 bg-brand-50 hover:bg-brand-100 border-brand-200`}
              title="Bulk import connections from CSV"
            >
              <UploadCloud className="w-3.5 h-3.5 text-brand-700" />
              <span>Import CSV</span>
            </button>
          )}

          {/* Export / print */}
          <div className={groupBox} role="group" aria-label="Export and print">
            <button type="button" onClick={() => exportBatchLogsExcel(filteredLogs)} disabled={none}
              className={`${cell} text-emerald-700 hover:bg-white disabled:opacity-30`} title="Export Excel">Excel</button>
            <button type="button" onClick={() => exportBatchLogsPdf(filteredLogs, nameLang)} disabled={none}
              className={`${cell} text-rose-600 hover:bg-white disabled:opacity-30`} title="Export PDF">PDF</button>
            <button type="button" onClick={onPrintAll} disabled={none}
              className={`${cell} text-slate-700 hover:bg-white disabled:opacity-30`} title="Print all">Print</button>
          </div>

          {/* Institute name language: Bangla (default) or English */}
          {onNameLangChange && (
            <div className={groupBox} role="group" aria-label="Institute name language">
              {([['bn', 'বাংলা', 'Show institute names in Bangla'], ['en', 'EN', 'Show institute names in English']] as const).map(([k, label, tip]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNameLangChange(k)}
                  aria-pressed={nameLang === k}
                  title={tip}
                  className={`${cell} ${nameLang === k ? segOn : segOff}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* List / Split view mode toggle */}
          <div className={groupBox} role="group" aria-label="View mode">
            {([['list', List, 'List'], ['split', PanelRight, 'Split view: list with details panel']] as const).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onViewModeChange(k)}
                aria-pressed={viewMode === k}
                title={label}
                aria-label={label}
                className={`${cell} ${viewMode === k ? segOn : segOff}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {onNewLog && (
            <button
              type="button"
              onClick={onNewLog}
              className="inline-flex items-center justify-center gap-1.5 h-8 w-[104px] shrink-0 px-2 whitespace-nowrap text-[11px] font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 rounded-xl shadow-md shadow-brand-600/30 hover:-translate-y-px active:translate-y-0 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-3.5 h-3.5 @max-[1180px]:hidden" />
              <span>New Connection</span>
            </button>
          )}
        </div>
      </div>

      {/* ── ROW 2: search, status, dropdowns, dates ── */}
      <div className="relative px-4 sm:px-5 pb-3 flex flex-wrap @min-[900px]:flex-nowrap items-center gap-1.5">
        <div className="relative min-w-[110px] flex-1 basis-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search connections..."
            className={`w-full h-8 pl-9 pr-3 text-xs ${INK} bg-slate-50 border border-slate-200 rounded-xl hover:bg-white focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-slate-400`}
          />
        </div>

        {/* Status filter: each state keeps its dashboard colour */}
        <div className="grid grid-flow-col auto-cols-fr items-stretch h-8 shrink-0 p-[2px] bg-slate-100/80 rounded-xl border border-slate-200/70" role="group" aria-label="Status">
          {STATUS_OPTIONS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onStatusFilterChange(f.key)}
                aria-pressed={active}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 @max-[1180px]:px-1.5 rounded-[10px] text-[11px] whitespace-nowrap transition-all ${
                  active ? `${f.active} font-semibold shadow-md` : 'text-slate-600 hover:bg-white hover:text-slate-900 font-medium'
                }`}
              >
                {!active && f.key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
                <span>{f.label}</span>
                <span className={`font-mono tabular-nums text-[10px] px-1.5 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-slate-200/70 text-slate-500'}`}>
                  {statusCounts[f.key]}
                </span>
              </button>
            );
          })}
        </div>

        <select value={upazilaFilter} onChange={(e) => onUpazilaFilterChange(e.target.value)} className={`${selClass} w-[128px] @max-[1180px]:w-[108px] shrink-0`} aria-label="Filter by upazila">
          <option value="">All upazilas</option>
          {UPAZILAS.map((u) => (
            <option key={u.key} value={u.key}>{u.key}</option>
          ))}
        </select>

        <select value={foremanFilter} onChange={(e) => onForemanFilterChange(e.target.value)} className={`${selClass} w-[128px] @max-[1180px]:w-[108px] shrink-0`} aria-label="Filter by foreman">
          <option value="">All foremen ({foremanOptions.length})</option>
          {foremanOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {!upazilaFilter && upazilaKey(r.area) ? ` (${upazilaKey(r.area)})` : ''}
            </option>
          ))}
        </select>

        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as SortBy)} className={`${selClass} w-[128px] @max-[1180px]:w-[108px] shrink-0`} aria-label="Sort connections">
          <option value="date_desc">Date (newest)</option>
          <option value="date_asc">Date (oldest)</option>
          <option value="log_desc">Connection # (highest)</option>
          <option value="log_asc">Connection # (lowest)</option>
          <option value="upazila">Upazila</option>
          <option value="foreman">Foreman</option>
        </select>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`inline-flex items-center justify-center gap-1.5 h-8 w-[128px] @max-[1180px]:w-[96px] shrink-0 px-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
            hasAdvancedActive || showAdvanced
              ? 'bg-brand-50 border-brand-300 text-brand-900 font-semibold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300'
          }`}
          title="Date range, follow-ups & quick jump"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600" />
          <span>Dates</span>
          {hasAdvancedActive && <span className="w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white" />}
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ── EXPANDABLE TRAY: Dates, Presets & Follow-up Filters ───────────── */}
      {showAdvanced && (
        <div className="relative px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex flex-wrap items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Inputs */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => onDateRangeChange(e.target.value, dateTo)}
                className="h-7 text-xs bg-white border border-slate-200 rounded-md px-1.5"
              />
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => onDateRangeChange(dateFrom, e.target.value)}
                className="h-7 text-xs bg-white border border-slate-200 rounded-md px-1.5"
              />
            </div>

            {/* Date Presets */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { label: 'Today', days: 0 },
                { label: '7 days', days: 6 },
                { label: '30 days', days: 29 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - p.days);
                    onDateRangeChange(toInputDate(from), toInputDate(now));
                  }}
                  className="px-2 py-0.5 text-[10px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Follow-up Filter Pills */}
            <div className="flex flex-wrap items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-semibold px-2">Follow-up:</span>
              {([
                ['all', 'Any', 0],
                ['today', 'Due today', followCounts.today],
                ['overdue', 'Overdue', followCounts.overdue],
              ] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onFollowFilterChange(k)}
                  className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                    followFilter === k
                      ? 'bg-brand-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                  {k !== 'all' && n > 0 && (
                    <span className={`ml-1 font-mono ${k === 'overdue' ? 'text-rose-300' : 'text-amber-300'}`}>
                      {n}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Log Opener */}
          {!none && (
            <div className="flex items-center gap-1.5">
              <select
                value=""
                onChange={(e) => e.target.value && onJumpToLog(e.target.value)}
                className="h-7 text-xs text-slate-800 bg-white border border-slate-200 rounded-md px-2 max-w-[220px] truncate"
              >
                <option value="">Jump to connection...</option>
                {filteredLogs.slice(0, 150).map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.logNo} — {item.customerName || 'Untitled'} ({item.nmsId})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
