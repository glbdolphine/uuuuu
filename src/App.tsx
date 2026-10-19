import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { logUpazila, UPAZILAS } from './utils/upazilas';
import { matchForeman } from './utils/foremen';
import { logDay, fromInputDate } from './utils/dates';
import { LogEntry, FieldSuggestionsMap, ActivityEvent, AppUser, Foreman, TeamMember, ApprovalRequest, ImportRequest, MarkAction, MarkKind } from './types';
import { Sidebar } from './components/Sidebar';
import { useSidebarSlide } from './utils/useSidebarSlide';
import { Theme, applyTheme, initialTheme } from './utils/theme';
import { LogsToolbar, StatusFilter, ViewMode, SortBy } from './components/LogsToolbar';
import { LogList, LogDetailModal } from './components/LogList';
import { DevelopedBy } from './components/DevelopedBy';
import { LogForm } from './components/LogForm';
import { FormMaker } from './components/FormMaker';
import { ForemanDirectory } from './components/ForemanDirectory';
import { Dashboard, DashboardGo } from './components/Dashboard';
import { LogSheetView } from './components/LogSheetView';
import { SuggestionsModal } from './components/SuggestionsModal';
import { BackupModal } from './components/BackupModal';
import { ActivityModal } from './components/ActivityModal';
import { AdminPanel } from './components/AdminPanel';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CsvImportModal } from './components/CsvImportModal';
import { FieldFillModal } from './components/FieldFillModal';
import type { FillKey } from './utils/bulkFill';
import { cleanCategoryLabel } from './utils/csvImporter';
import { displayCategory } from './utils/category';
import { splitName, primaryName, NameLang } from './utils/names';
import {
  loadLogs, saveLog, deleteLog, clearAllLogs, loadSuggestions, saveSuggestions,
  loadActivity, loadUserAvatars, subscribeToCloud, restoreLogs, importLocalBrowserData,
  loadForemen, createForeman, updateForeman, deleteForeman, notePasswordChanged,
  loadTeamMembers, createTeamMember, updateTeamMember, deleteTeamMember,
  saveBatchLogs, bulkFillField, bulkSetForeman, loadApprovals, requestMarks, decideApprovals, withdrawApproval,
  loadImportRequests, requestImport, decideImportRequest, withdrawImportRequest,
} from './utils/cloud';
import { RequestsTab } from './components/RequestsTab';
import { changePassword } from './utils/auth';
import { FormFilter, ImportPlan, expectsForm, formMonthOf, hasForm, monthToReceivedOn } from './utils/forms';
import { hasBill } from './utils/bills';
import { monthKey, monthLabel } from './utils/months';
import { MonthSelect } from './components/MonthSelect';
import { MissingKey, missingLabel, missingOf } from './utils/completeness';
import { indexPending } from './utils/approvals';
import { BillsPanel } from './components/BillsPanel';
import { FormsTab } from './components/FormsTab';
import { TermsPanel } from './components/TermsPanel';
import { CoverageAnalytics } from './components/CoverageAnalytics';
import { TargetsPanel } from './components/TargetsPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ProfileModal } from './components/ProfileModal';
import { FollowFilter, followState } from './utils/followUps';
import { Plus, UploadCloud, Menu } from 'lucide-react';

const DESKTOP_QUERY = '(min-width: 1024px)';

interface AppProps {
  onLock?: () => void;
  initialAdminPanelOpen?: boolean;
  currentUser: AppUser;
}

type View = 'home' | 'sheet' | 'form' | 'maker' | 'directory' | 'bills' | 'forms' | 'requests' | 'coverage' | 'targets' | 'terms';
const VIEWS: View[] = ['home', 'sheet', 'form', 'maker', 'directory', 'bills', 'forms', 'requests', 'coverage', 'targets', 'terms'];

export default function App({ onLock, currentUser, initialAdminPanelOpen = false }: AppProps) {
  const [user, setUser] = useState<AppUser>(currentUser);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    setUser(currentUser);
  }, [currentUser]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<FieldSuggestionsMap>({} as FieldSuggestionsMap);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [importRequests, setImportRequests] = useState<ImportRequest[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [markPrompt, setMarkPrompt] = useState<
    | { type: 'mark'; items: { log: LogEntry; kind: MarkKind; action: MarkAction; month?: string }[] }
    | { type: 'withdraw'; approval: ApprovalRequest }
    | { type: 'move'; kind: MarkKind; items: { log: LogEntry; from: string }[] }
    | null
  >(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  // What the "mark as received" prompt asks for: the month a bill or a form was received for.
  const [markMonth, setMarkMonth] = useState(monthKey());
  const [selectedLogId, setSelectedLogId] = useState('');
  // Remember the current page (per browser tab) so a reload or refresh stays where you were.
  const [currentView, setCurrentView] = useState<View>(() => {
    try {
      const v = sessionStorage.getItem('pace_it_view') as View | null;
      return v && VIEWS.includes(v) ? v : 'home';
    } catch { return 'home'; }
  });
  const [foremen, setForemen] = useState<Foreman[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [followFilter, setFollowFilter] = useState<FollowFilter>('all');
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  // The page a log form was opened from (Bills, Forms, Requests...). Save and Cancel return there.
  const [returnView, setReturnView] = useState<View>(() => {
    try {
      const v = sessionStorage.getItem('pace_it_return_view') as View | null;
      return v && v !== 'form' && VIEWS.includes(v) ? v : 'sheet';
    } catch { return 'sheet'; }
  });
  const openLogForm = (log: LogEntry | null) => {
    if (currentView !== 'form') {
      setReturnView(currentView);
      try { sessionStorage.setItem('pace_it_return_view', currentView); } catch { /* ignore */ }
    }
    setEditingLog(log);
    setCurrentView('form');
  };
  const closeLogForm = () => {
    setEditingLog(null);
    setCurrentView(returnView);
  };
  useEffect(() => {
    try {
      sessionStorage.setItem('pace_it_view', currentView);
      if (currentView === 'form' && editingLog?.id) sessionStorage.setItem('pace_it_editing', editingLog.id);
      else sessionStorage.removeItem('pace_it_editing');
    } catch { /* ignore */ }
  }, [currentView, editingLog?.id]);

  // Reset the page whenever a *different* user signs in. The same user keeps their page on a
  // reload (sessionStorage survives a refresh) but a fresh login always starts on the Dashboard.
  const lastUserIdRef = React.useRef(user.id);
  useEffect(() => {
    if (lastUserIdRef.current === user.id) return;
    lastUserIdRef.current = user.id;
    setCurrentView('home');
    setEditingLog(null);
  }, [user.id]);

  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  // The admin panel is never opened automatically. An admin opens it from the sidebar.
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(initialAdminPanelOpen && currentUser.role === 'admin');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isFieldFillOpen, setIsFieldFillOpen] = useState(false);
  const [formFilter, setFormFilter] = useState<FormFilter>('all');
  const [upazilaFilter, setUpazilaFilter] = useState('');
  const [foremanFilter, setForemanFilter] = useState('');
  const [missingFilter, setMissingFilter] = useState<MissingKey | ''>('');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem('pace_it_view_mode') === 'split' ? 'split' : 'list'; } catch { return 'list'; }
  });
  const [nameLang, setNameLang] = useState<NameLang>(() => {
    try { return localStorage.getItem('pace_it_name_lang') === 'en' ? 'en' : 'bn'; } catch { return 'bn'; }
  });
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  const changeNameLang = (l: NameLang) => {
    setNameLang(l);
    try { localStorage.setItem('pace_it_name_lang', l); } catch { /* ignore */ }
  };
  const changeViewMode = (m: ViewMode) => {
    setViewMode(m);
    try { localStorage.setItem('pace_it_view_mode', m); } catch { /* ignore */ }
  };

  // Sidebar: a persistent, collapsible rail on large screens, a slide-over drawer on small ones.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [sidebarDesktopOpen, setSidebarDesktopOpen] = useState(() => {
    try { return localStorage.getItem('pace_it_sidebar') !== 'closed'; } catch { return true; }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const sidebarVisible = isDesktop ? sidebarDesktopOpen : sidebarMobileOpen;
  const sidebarRowRef = React.useRef<HTMLDivElement>(null);
  const pageColumnRef = React.useRef<HTMLDivElement>(null);
  const { capture: captureSidebarSlide } = useSidebarSlide(sidebarRowRef, pageColumnRef, sidebarDesktopOpen);
  const toggleSidebar = () => {
    if (!isDesktop) { setSidebarMobileOpen((v) => !v); return; }
    captureSidebarSlide(); // remember where everything is, the page then slides to its new place
    const next = !sidebarDesktopOpen;
    setSidebarDesktopOpen(next);
    try { localStorage.setItem('pace_it_sidebar', next ? 'open' : 'closed'); } catch { /* ignore */ }
  };
  const closeSidebar = React.useCallback(() => setSidebarMobileOpen(false), []);

  const handlePrintAll = () => {
    setPrintingAll(true);
    const done = () => { setPrintingAll(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.setTimeout(() => window.print(), 150);
  };

  // Only replace state when the data really changed - avoids re-rendering the whole app for nothing.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const refreshLogs = async () => {
    try {
      const data = await loadLogs();
      setLogs((prev) => (same(prev, data) ? prev : data));
      setSelectedLogId(current => current && data.some(l => l.id === current) ? current : (data[0]?.id || ''));
    } catch (e: any) {
      console.warn('refreshLogs:', e?.message);
    }
  };

  const refreshAvatars = async () => {
    try {
      const a = await loadUserAvatars();
      const map: Record<string, string> = {};
      for (const u of a) map[u.displayName] = u.photoUrl;
      setAvatars((prev) => (same(prev, map) ? prev : map));
    } catch { /* photos are optional */ }
  };

  const refreshActivity = async () => {
    try { const d = await loadActivity(); setActivity((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
    void refreshAvatars();
  };

  const refreshForemen = async () => {
    try { const d = await loadForemen(); setForemen((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
    try { const p = await loadTeamMembers(); setTeamMembers((prev) => (same(prev, p) ? prev : p)); } catch (e) { console.error(e); }
  };

  const refreshApprovals = async () => {
    try { const d = await loadApprovals(); setApprovals((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  const refreshImports = async () => {
    try { const d = await loadImportRequests(); setImportRequests((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  const refreshSuggestions = async () => {
    try { const d = await loadSuggestions(); setSuggestions((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    let alive = true;
    loadTeamMembers().then((d) => { if (alive) setTeamMembers(d); }).catch(() => { /* teams are optional */ });
    void refreshAvatars();
    Promise.all([loadLogs(), loadActivity(), loadSuggestions(), loadForemen(), loadApprovals(), loadImportRequests().catch(() => [] as ImportRequest[])])
      .then(([loadedLogs, loadedActivity, loadedSuggestions, loadedForemen, loadedApprovals, loadedImports]) => {
        if (!alive) return;
        setApprovals(loadedApprovals);
        setImportRequests(loadedImports);
        setLogs(loadedLogs);
        setForemen(loadedForemen);
        setActivity(loadedActivity);
        setSuggestions(loadedSuggestions);
        setSelectedLogId(loadedLogs[0]?.id || '');
        try {
          const eid = sessionStorage.getItem('pace_it_editing');
          const found = eid ? loadedLogs.find((l) => l.id === eid) : undefined;
          if (found) setEditingLog(found);
        } catch { /* ignore */ }
      })
      .catch((e) => {
        console.error(e);
        if (alive) showToast(e?.message || 'Could not load shared data');
      })
      .finally(() => { if (alive) setLoading(false); });

    const unsubscribe = subscribeToCloud(refreshLogs, refreshActivity, refreshSuggestions, refreshForemen, refreshApprovals, refreshImports);
    return () => { alive = false; unsubscribe(); };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2600);
  };

  const nextLogNo = useMemo(() => {
    if (!logs.length) return 1;
    return Math.max(...logs.map(l => {
      const n = typeof l.logNo === 'number' ? l.logNo : parseInt(String(l.logNo), 10);
      return Number.isFinite(n) ? n : 0;
    })) + 1;
  }, [logs]);

  const deferredSearch = useDeferredValue(searchTerm);

  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const log of logs) {
      m.set(
        log.id,
        [
          log.logNo, log.date, log.foremanName, log.foremanPhone, log.requestType,
          log.customerName, log.nameBn, log.nameEn, log.headTeacherName, log.headTeacherPhone, log.nmsId, log.issueFound,
          log.missingWrongDetails, log.actionTaken, log.reasonForAction, log.status, log.remarks, log.mac,
          log.edcNo, log.emisEiinDghs, log.routerSerial, log.upazila, log.unionName, log.lat, log.long, log.fiberLength, log.category,
        ].filter(Boolean).join(' ').toLowerCase()
      );
    }
    return m;
  }, [logs]);

  const upazilaOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const log of logs) m.set(log.id, logUpazila(log, foremen));
    return m;
  }, [logs, foremen]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of logs) {
      const c = cleanCategoryLabel(displayCategory(l));
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const fromT = fromInputDate(dateFrom)?.getTime() ?? null;
    const toT = fromInputDate(dateTo)?.getTime() ?? null;
    return logs.filter((log) => {
      if (categoryFilter !== 'all') {
        const c = cleanCategoryLabel(displayCategory(log));
        if (c !== categoryFilter) return false;
      }
      const s = (log.status || '').toLowerCase();
      if (statusFilter === 'pending' && !s.includes('pending') && !s.includes('waiting')) return false;
      if (statusFilter === 'in_progress' && !s.includes('progress')) return false;
      if (statusFilter === 'resolved' && !s.includes('resolved') && !s.includes('closed')) return false;
      if (followFilter !== 'all' && followState(log) !== followFilter) return false;
      if (upazilaFilter && upazilaOf.get(log.id) !== upazilaFilter) return false;
      if (fromT !== null || toT !== null) {
        const t = logDay(log)?.getTime();
        if (t === undefined) return false;
        if (fromT !== null && t < fromT) return false;
        if (toT !== null && t > toT) return false;
      }
      if (missingFilter && !missingOf(log).some((m) => m.key === missingFilter)) return false;
      if (foremanFilter && matchForeman({ foremanId: log.foremanId, foremanName: log.foremanName }, foremen)?.id !== foremanFilter) return false;
      if (formFilter !== 'all') {
        if (!expectsForm(log)) return false;
        if (formFilter === 'awaiting' && hasForm(log)) return false;
        if (formFilter === 'received' && !hasForm(log)) return false;
      }
      if (!query) return true;
      return (searchIndex.get(log.id) || '').includes(query);
    });
  }, [logs, foremen, deferredSearch, statusFilter, categoryFilter, formFilter, followFilter, upazilaFilter, foremanFilter, missingFilter, dateFrom, dateTo, searchIndex, upazilaOf]);

  const followCounts = useMemo(() => ({
    today: logs.filter((l) => followState(l) === 'today').length,
    overdue: logs.filter((l) => followState(l) === 'overdue').length,
  }), [logs]);

  const [formsInitialTab, setFormsInitialTab] = useState<'awaiting' | 'received' | 'all'>('received');

  const goLogs = (t: DashboardGo) => {
    if (t.form) {
      setFormsInitialTab('awaiting');
      setCurrentView('forms');
      return;
    }
    setSearchTerm('');
    setStatusFilter(t.status ?? 'all');
    setFormFilter(t.form ?? 'all');
    setFollowFilter(t.follow ?? 'all');
    setUpazilaFilter('');
    setMissingFilter(t.missing ?? '');
    const picked = t.foremanName ? foremen.find((r) => r.name === t.foremanName) : undefined;
    setForemanFilter(picked?.id ?? '');
    if (t.foremanName && !picked) setSearchTerm(t.foremanName);
    setCurrentView('sheet');
  };

  const openUpazilaRecords = (key: string) => {
    setSearchTerm('');
    setStatusFilter('all');
    setFormFilter('all');
    setFollowFilter('all');
    setMissingFilter('');
    setForemanFilter('');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setUpazilaFilter(key);
    setCurrentView('sheet');
  };

  const displayLogs = useMemo(() => {
    const num = (l: LogEntry) => {
      const n = typeof l.logNo === 'number' ? l.logNo : parseInt(String(l.logNo), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const rank = new Map<string, number>();
    const times = new Map<string, number>();
    for (const l of filteredLogs) {
      const i = UPAZILAS.findIndex((u) => u.key === upazilaOf.get(l.id));
      rank.set(l.id, i === -1 ? 99 : i);
      times.set(l.id, logDay(l)?.getTime() ?? 0);
    }
    const upaRank = (l: LogEntry) => rank.get(l.id) ?? 99;
    const time = (l: LogEntry) => times.get(l.id) ?? 0;
    const rname = (l: LogEntry) => (l.foremanName || '').toLowerCase();
    const list = [...filteredLogs];
    switch (sortBy) {
      case 'log_desc': return list.sort((a, b) => num(b) - num(a));
      case 'date_desc': return list.sort((a, b) => time(b) - time(a) || num(b) - num(a));
      case 'date_asc': return list.sort((a, b) => time(a) - time(b) || num(a) - num(b));
      case 'upazila': return list.sort((a, b) => upaRank(a) - upaRank(b) || rname(a).localeCompare(rname(b)) || num(a) - num(b));
      case 'foreman': return list.sort((a, b) => rname(a).localeCompare(rname(b)) || time(b) - time(a));
      default: return list.sort((a, b) => num(a) - num(b));
    }
  }, [filteredLogs, sortBy, upazilaOf]);

  const scrollToLog = (id: string) => {
    window.setTimeout(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const handleSaveLog = async (entry: LogEntry, andCreateAnother = false) => {
    try {
      const existing = logs.find(l => l.id === entry.id) || null;
      const saved = await saveLog(entry, user, existing);
      setLogs((prev) => (prev.some((l) => l.id === saved.id) ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved]));
      setSelectedLogId(saved.id);
      showToast(`Connection #${saved.logNo} saved`);
      if (!andCreateAnother) {
        if (returnView === 'sheet') {
          // Back on the records list with the same filters; scroll to the saved record if it is in the list.
          scrollToLog(saved.id);
        }
        closeLogForm();
      }
      void Promise.all([refreshActivity(), refreshSuggestions()]);
    } catch (e: any) {
      showToast(e?.message || 'Could not save connection');
    }
  };

  const handleBatchImport = async (entries: LogEntry[]) => {
    try {
      if (user.role !== 'admin') {
        await requestImport(entries);
        await refreshImports();
        setCurrentView('requests');
        showToast(`Import of ${entries.length} connections sent for admin approval`);
        return;
      }
      await saveBatchLogs(entries);
      await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
      setCategoryFilter('all');
      setCurrentView('sheet');
      showToast(`Successfully imported ${entries.length} connections from CSV`);
    } catch (e: any) {
      showToast(e?.message || 'Could not import batch connections');
      throw e;
    }
  };

  const handleDecideImport = async (id: string, approve: boolean) => {
    setImportBusy(true);
    try {
      const r = await decideImportRequest(id, approve);
      await Promise.all([refreshImports(), refreshLogs(), refreshActivity(), refreshSuggestions()]);
      showToast(approve ? `Imported ${r.saved} connections` : 'Import request rejected');
    } catch (e: any) {
      showToast(e?.message || 'Could not update the import request');
      refreshImports();
    } finally {
      setImportBusy(false);
    }
  };

  const handleWithdrawImport = async (id: string) => {
    try {
      await withdrawImportRequest(id);
      await refreshImports();
      showToast('Import request withdrawn');
    } catch (e: any) {
      showToast(e?.message || 'Could not withdraw the request');
    }
  };

  const handleFieldFill = async (field: FillKey, items: { id: string; value: string }[]) => {
    const r = await bulkFillField(field, items);
    await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
    showToast(`${r.updated} connection${r.updated === 1 ? '' : 's'} updated`);
    return r;
  };

  const handleBulkForeman = async (ids: string[], foremanId: string) => {
    const r = await bulkSetForeman(ids, foremanId);
    await Promise.all([refreshLogs(), refreshActivity()]);
    showToast(`${r.updated} connection${r.updated === 1 ? '' : 's'} moved to ${r.foremanName}${r.unchanged ? ` (${r.unchanged} already his)` : ''}`);
  };

  // same as handleBulkForeman, but hands the counts back to the Fill-field window
  const handleBulkForemanFill = async (ids: string[], foremanId: string) => {
    const r = await bulkSetForeman(ids, foremanId);
    await Promise.all([refreshLogs(), refreshActivity()]);
    return { updated: r.updated, unchanged: r.unchanged, missing: r.missing };
  };

  const handleAutoLog = async (fields: Partial<LogEntry>, existingId?: string): Promise<LogEntry> => {
    const existing = existingId ? logs.find(l => l.id === existingId) || null : null;
    const now = new Date().toISOString();
    const entry = (existing ? { ...existing, ...fields } : {
      id: crypto.randomUUID(), logNo: nextLogNo, foremanName: '', foremanPhone: '',
      issueFound: '', missingWrongDetails: '', actionTaken: '', reasonForAction: '',
      foremanInformed: 'Yes - phone', followUpNeeded: 'Yes', status: 'Pending - waiting for foreman',
      supervisorInformed: 'I informed my superiors', remarks: '', createdAt: now, updatedAt: now,
      ...fields,
    }) as LogEntry;
    if (fields.customerName) {
      const n = splitName(fields.customerName);
      entry.nameBn = n.nameBn || existing?.nameBn || '';
      entry.nameEn = n.nameEn || existing?.nameEn || '';
      entry.customerName = primaryName(entry.nameBn, entry.nameEn);
    }
    const saved = await saveLog(entry, user, existing);
    await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
    showToast(`Connection #${saved.logNo} ${existing ? 'updated' : 'created'}`);
    return saved;
  };

  const pendingIdx = useMemo(() => indexPending(approvals), [approvals]);
  useEffect(() => {
    if (markPrompt?.type === 'mark') {
      setMarkMonth(markPrompt.items[0].month || monthKey());
    }
    if (markPrompt?.type === 'move') setMarkMonth(monthKey());
  }, [markPrompt]);
  const pendingList = useMemo(() => approvals.filter((a) => a.status === 'pending'), [approvals]);
  const pendingImports = useMemo(() => importRequests.filter((r) => r.status === 'pending'), [importRequests]);

  const askToggle = (log: LogEntry, kind: MarkKind, month?: string) => {
    const m = month || monthKey();
    const existing = kind === 'bill' ? pendingIdx.get(`${log.id}|bill|${m}`) : pendingIdx.get(`${log.id}|form`);
    if (existing) { setMarkPrompt({ type: 'withdraw', approval: existing }); return; }
    const got = kind === 'form' ? hasForm(log) : hasBill(log, m);
    setMarkPrompt({ type: 'mark', items: [{ log, kind, action: got ? 'not_received' : 'received', month: m }] });
  };
  const handleToggleForm = (log: LogEntry, month?: string) => askToggle(log, 'form', month);
  const handleToggleBill = (log: LogEntry, month?: string) => askToggle(log, 'bill', month);

  const askMany = (logsToMark: LogEntry[], kind: MarkKind, action: MarkAction, month?: string) => {
    if (!logsToMark.length) return;
    const m = month || monthKey();
    setMarkPrompt({ type: 'mark', items: logsToMark.map((log) => ({ log, kind, action, month: m })) });
  };

  // Move already-received forms / bills to another month (each item knows the month it is in now).
  const askMove = (items: { log: LogEntry; from: string }[], kind: MarkKind) => {
    if (!items.length) return;
    setMarkPrompt({ type: 'move', kind, items });
  };

  const handleApplyFormImport = async (plan: ImportPlan) => {
    askMany(plan.toMark.map((x) => x.log), 'form', 'received');
  };

  const confirmMarkPrompt = async () => {
    const prompt = markPrompt;
    setMarkPrompt(null);
    if (!prompt) return;
    try {
      if (prompt.type === 'withdraw') {
        await withdrawApproval(prompt.approval.id);
        showToast('Request withdrawn');
      } else if (prompt.type === 'move') {
        const reqs: Parameters<typeof requestMarks>[0] = [];
        for (const { log, from } of prompt.items) {
          if (prompt.kind === 'form') {
            if (formMonthOf(log) === markMonth) continue;
            reqs.push({ logId: log.id, kind: 'form', action: 'received', receivedOn: monthToReceivedOn(markMonth), move: true });
          } else {
            if (from === markMonth) continue;
            if (from) reqs.push({ logId: log.id, kind: 'bill', action: 'not_received', month: from });
            if (!hasBill(log, markMonth)) reqs.push({ logId: log.id, kind: 'bill', action: 'received', month: markMonth });
          }
        }
        if (!reqs.length) { showToast('Nothing to change - already in that month'); }
        else {
          const r = await requestMarks(reqs);
          showToast(r.queued ? `${prompt.items.length} month change${prompt.items.length === 1 ? '' : 's'} sent to the admin for approval` : r.applied ? `Moved to ${monthLabel(markMonth)}` : 'Nothing to change');
        }
      } else {
        const r = await requestMarks(prompt.items.map((i) => ({
          logId: i.log.id, kind: i.kind, action: i.action,
          month: i.kind === 'bill' ? (i.action === 'received' ? markMonth : i.month) : undefined,
          receivedOn: i.kind === 'form' && i.action === 'received' ? monthToReceivedOn(markMonth) : undefined,
        })));
        showToast(r.queued ? `${r.queued} request${r.queued === 1 ? '' : 's'} sent to the admin for approval` : r.applied ? `${r.applied} marked` : 'Nothing to change');
      }
      await Promise.all([refreshLogs(), refreshApprovals(), refreshActivity()]);
    } catch (e: any) {
      showToast(e?.message || 'Could not send the request');
    }
  };

  const runDecision = async (opts: { ids?: string[]; all?: boolean; approve: boolean }) => {
    setApprovalBusy(true);
    try {
      const r = await decideApprovals(opts);
      await Promise.all([refreshLogs(), refreshApprovals(), refreshActivity()]);
      showToast(opts.approve ? `${r.approved} approved` : `${r.rejected} rejected`);
    } catch (e: any) {
      showToast(e?.message || 'Could not update the requests');
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleApproveAllRequests = async (sel: { approvalIds: string[]; importIds: string[] }) => {
    if (!sel.approvalIds.length && !sel.importIds.length) return;
    setApprovalBusy(true);
    try {
      if (sel.approvalIds.length) await decideApprovals({ ids: sel.approvalIds, approve: true });
      for (const id of sel.importIds) await decideImportRequest(id, true);
      await Promise.all([refreshLogs(), refreshApprovals(), refreshImports(), refreshActivity(), refreshSuggestions()]);
      showToast('Requests approved');
    } catch (e: any) {
      showToast(e?.message || 'Could not approve all requests');
      await Promise.all([refreshApprovals(), refreshImports()]);
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleRejectAllRequests = async (sel: { approvalIds: string[]; importIds: string[] }) => {
    if (!sel.approvalIds.length && !sel.importIds.length) return;
    setApprovalBusy(true);
    try {
      if (sel.approvalIds.length) await decideApprovals({ ids: sel.approvalIds, approve: false });
      for (const id of sel.importIds) await decideImportRequest(id, false);
      await Promise.all([refreshLogs(), refreshApprovals(), refreshImports(), refreshActivity()]);
      showToast('Requests rejected');
    } catch (e: any) {
      showToast(e?.message || 'Could not reject all requests');
      await Promise.all([refreshApprovals(), refreshImports()]);
    } finally {
      setApprovalBusy(false);
    }
  };

  const markDialog = (() => {
    if (!markPrompt) return { title: '', message: '', confirm: '' };
    if (markPrompt.type === 'withdraw') {
      const a = markPrompt.approval;
      return { title: 'Withdraw this request?', message: `${a.kind === 'form' ? 'Form' : 'Bill'} ${a.action === 'received' ? 'received' : 'not received'} for #${a.logNo} ${a.customer || ''} will no longer wait for the admin.`, confirm: 'Withdraw' };
    }
    if (markPrompt.type === 'move') {
      const w = markPrompt.kind === 'form' ? 'form' : 'bill';
      const n = markPrompt.items.length;
      const things = n > 1 ? `${n} ${w}s` : `the ${w} for #${markPrompt.items[0].log.logNo} ${markPrompt.items[0].log.nameBn || markPrompt.items[0].log.customerName || ''}`;
      return {
        title: `Change month of ${n > 1 ? `${n} ${w}s` : `this ${w}`}?`,
        message: user.role === 'admin'
          ? `You are about to move ${things} to ${monthLabel(markMonth)}. This is applied immediately.`
          : `You are about to move ${things} to ${monthLabel(markMonth)}. This is sent to the admin and stays in "Waiting for confirmation" until it is approved.`,
        confirm: user.role === 'admin' ? 'Change month' : 'Send for approval',
      };
    }
    const first = markPrompt.items[0];
    const word = first.kind === 'form' ? 'form' : 'bill';
    const what = first.action === 'received' ? 'received' : 'not received';
    const many = markPrompt.items.length > 1;
    const target = many ? `${markPrompt.items.length} ${word}s` : `the ${word} for #${first.log.logNo} ${first.log.nameBn || first.log.customerName || ''}`;
    const when = first.action === 'received'
      ? ` for ${monthLabel(markMonth)}`
      : (first.kind === 'bill' && first.month ? ` for ${monthLabel(first.month)}` : '');
    return {
      title: `Mark ${many ? `${markPrompt.items.length} ${word}s` : word} as ${what}?`,
      message: user.role === 'admin'
        ? `You are about to mark ${target} as ${what}${when}. This is applied immediately.`
        : `You are about to mark ${target} as ${what}${when}. This is sent to the admin and stays in "Waiting for confirmation" until it is approved.`,
      confirm: user.role === 'admin' ? 'Confirm' : 'Send for approval',
    };
  })();

  const handleEdit = (log: LogEntry) => openLogForm(log);

  const handleDuplicate = (log: LogEntry) => {
    const now = new Date().toISOString();
    openLogForm({
      ...log,
      id: crypto.randomUUID(),
      logNo: nextLogNo,
      date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
      createdAt: now,
      updatedAt: now,
      createdBy: user.displayName,
      updatedBy: user.displayName,
      history: [],
      formReceivedAt: '',
      billReceivedAt: '',
      billMonths: [],
    });
    showToast(`Duplicated to Connection #${nextLogNo}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLog(id, user);
      await Promise.all([refreshLogs(), refreshActivity()]);
      showToast('Connection moved to the admin bin');
    } catch (e: any) {
      showToast(e?.message || 'Could not delete connection');
    }
  };

  const handleClearAllLogs = async (password: string) => {
    await clearAllLogs(password);
    await Promise.all([refreshLogs(), refreshActivity()]);
    setSelectedLogId('');
    setCurrentView('sheet');
    showToast('All connections moved to the admin bin');
  };

  const handleRestoreBackup = async (importedLogs: LogEntry[], importedSuggestions: FieldSuggestionsMap, merge: boolean, password: string) => {
    const total = await restoreLogs(importedLogs, merge, user, password);
    await saveSuggestions(importedSuggestions);
    await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
    showToast(`Restored ${total} shared connections`);
  };

  const handleUpdateSuggestions = async (updated: FieldSuggestionsMap) => {
    try {
      await saveSuggestions(updated);
      setSuggestions(updated);
      showToast('Saved values updated');
    } catch (e: any) {
      showToast(e?.message || 'Could not update saved values');
    }
  };

  const handleImportLocal = async () => {
    try {
      const total = await importLocalBrowserData(user);
      await refreshLogs();
      await refreshActivity();
      showToast(total ? `Imported ${total} local connections into shared storage` : 'No old local connections found');
    } catch (e: any) {
      showToast(e?.message || 'Could not import local data');
    }
  };

  const handleCreateForeman = async (input: { name: string; area: string; phone: string }) => {
    await createForeman(input, user);
    await Promise.all([refreshForemen(), refreshActivity()]);
    showToast('Foreman added');
  };
  const handleUpdateForeman = async (id: string, input: { name: string; area: string; phone: string; active: boolean; roam?: boolean; roamAreas?: string[] }) => {
    await updateForeman(id, input);
    await Promise.all([refreshForemen(), refreshLogs()]);
    showToast('Foreman updated');
  };
  const handleCreateTeamMember = async (input: { foremanId: string; name: string; phone: string; role: string }) => {
    await createTeamMember(input);
    await refreshForemen();
    showToast('Team member added');
  };
  const handleUpdateTeamMember = async (id: string, input: { name: string; phone: string; role: string; active: boolean }) => {
    await updateTeamMember(id, input);
    await refreshForemen();
    showToast('Team member updated');
  };
  const handleDeleteTeamMember = async (id: string) => {
    try {
      await deleteTeamMember(id);
      await refreshForemen();
      showToast('Team member removed');
    } catch (e: any) {
      showToast(e?.message || 'Could not remove team member');
    }
  };
  const handleDeleteForeman = async (id: string) => {
    try {
      await deleteForeman(id);
      await Promise.all([refreshForemen(), refreshActivity()]);
      showToast('Foreman moved to the admin bin');
    } catch (e: any) {
      showToast(e?.message || 'Could not delete foreman');
    }
  };

  const handleChangePassword = async (password: string) => {
    try {
      await changePassword(password);
      await notePasswordChanged();
      showToast('Password changed');
      setIsPasswordModalOpen(false);
    } catch (e: any) {
      showToast(e?.message || 'Could not change password');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#eef8f1] flex items-center justify-center text-sm text-slate-500">Loading shared Pace IT data…</div>;
  }

  return (
    <div className="min-h-screen bg-[#eef8f1] flex flex-col font-sans">
      <div ref={sidebarRowRef} className="flex flex-1 min-w-0">
        <Sidebar
          visible={sidebarVisible}
          isDesktop={isDesktop}
          onClose={closeSidebar}
          onToggle={toggleSidebar}
          onGoHome={() => setCurrentView('home')}
          currentView={currentView}
          onNavigate={setCurrentView}
          logsCount={logs.length}
          userName={user.displayName}
          userRole={user.role}
          userPhotoUrl={user.photoUrl}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onLogout={() => { if (onLock) onLock(); }}
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onOpenActivity={() => setIsActivityModalOpen(true)}
          onChangePassword={() => setIsPasswordModalOpen(true)}
          onOpenSuggestions={user.role === 'admin' ? () => setIsSuggestionsModalOpen(true) : undefined}
          onOpenAdmin={user.role === 'admin' ? () => setIsAdminPanelOpen(true) : undefined}
          pendingCount={pendingList.length + pendingImports.length}
          dark={theme === 'dark'}
          onToggleDark={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />

        <div ref={pageColumnRef} className="flex-1 min-w-0 flex flex-col">
      {!isDesktop && (
        <div className="no-print flex items-center h-12 px-3 bg-white/90 backdrop-blur border-b border-brand-100">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-600 hover:text-brand-800 hover:bg-brand-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Open menu"
            aria-controls="app-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      )}

      {currentView === 'sheet' && logs.length > 0 && (
        <div className="no-print md:sticky md:top-0 z-30 px-3 sm:px-4 pt-3 pb-1 bg-[#eef8f1]/90 backdrop-blur">
          <LogsToolbar totalCount={logs.length} filteredLogs={displayLogs} searchTerm={searchTerm}
            onSearchChange={setSearchTerm} statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter} onJumpToLog={setOpenLogId}
            viewMode={viewMode} onViewModeChange={changeViewMode} nameLang={nameLang} onNameLangChange={changeNameLang} onPrintAll={handlePrintAll}
            allLogs={logs} formFilter={formFilter} onFormFilterChange={setFormFilter}
            onPickFormForeman={(name) => { setSearchTerm(name); setFormFilter('awaiting'); }}
            onApplyFormImport={handleApplyFormImport}
            upazilaFilter={upazilaFilter} onUpazilaFilterChange={(v) => { setUpazilaFilter(v); setForemanFilter(''); }}
            foremanFilter={foremanFilter} onForemanFilterChange={setForemanFilter}
            sortBy={sortBy} onSortChange={setSortBy}
            dateFrom={dateFrom} dateTo={dateTo} onDateRangeChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            foremen={foremen} followFilter={followFilter} onFollowFilterChange={setFollowFilter} followCounts={followCounts}
            categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} categoryCounts={categoryCounts}
            onOpenCsvImport={() => setIsCsvImportModalOpen(true)}
            onOpenFieldFill={() => setIsFieldFillOpen(true)}
            onNewLog={() => openLogForm(null)} />
        </div>
      )}

      <main className="no-print flex-1 w-full p-3 sm:p-4 max-w-[1400px] mx-auto">
        {currentView === 'home' && (
          <Dashboard logs={logs} activity={activity} avatars={avatars} userName={user.displayName} onOpenLog={setOpenLogId} onGo={goLogs} onOpenBills={() => setCurrentView('bills')} />
        )}

        {currentView === 'forms' && (
          <FormsTab key={formsInitialTab} logs={logs} foremen={foremen} pending={pendingIdx} initialTab={formsInitialTab}
            nameLang={nameLang} onNameLangChange={changeNameLang}
            onToggleForm={handleToggleForm} onMarkMany={(ls, action, month) => askMany(ls, 'form', action, month)} onChangeMonth={(items) => askMove(items, 'form')} onOpenLog={setOpenLogId} />
        )}

        {currentView === 'bills' && (
          <BillsPanel logs={logs} foremen={foremen} pending={pendingIdx} onToggleBill={handleToggleBill}
  onMarkMany={(ls, action, month) => askMany(ls, 'bill', action, month)} onChangeMonth={(items) => askMove(items, 'bill')} onOpenLog={setOpenLogId}
  nameLang={nameLang} onNameLangChange={changeNameLang} />
        )}

        {currentView === 'terms' && <TermsPanel logs={logs} onChanged={refreshLogs} onOpenLog={setOpenLogId} />}

        {currentView === 'requests' && (
          <RequestsTab
            approvals={approvals}
            importRequests={importRequests}
            isAdmin={user.role === 'admin'}
            currentName={user.displayName}
            currentUserId={user.id}
            busy={approvalBusy || importBusy}
            onApproveAll={handleApproveAllRequests}
            onRejectAll={handleRejectAllRequests}
            onApprove={(id) => runDecision({ ids: [id], approve: true })}
            onReject={(id) => runDecision({ ids: [id], approve: false })}
            onWithdraw={(id) => {
              const a = approvals.find((x) => x.id === id);
              if (a) setMarkPrompt({ type: 'withdraw', approval: a });
            }}
            onApproveImport={(id) => handleDecideImport(id, true)}
            onRejectImport={(id) => handleDecideImport(id, false)}
            onWithdrawImport={handleWithdrawImport}
            onOpenLog={(id) => {
              const l = logs.find((x) => x.id === id);
              if (l) setOpenLogId(l.id);
            }}
          />
        )}

        {currentView === 'coverage' && (
          <CoverageAnalytics logs={logs} foremen={foremen} onOpenUpazila={openUpazilaRecords}
            onFix={(field, items) => handleFieldFill(field, items)} onOpenLog={setOpenLogId} />
        )}

        {currentView === 'targets' && <TargetsPanel logs={logs} onOpenLog={setOpenLogId} isAdmin={user.role === 'admin'} onRefresh={refreshLogs} />}

        {currentView === 'directory' && (
          <ForemanDirectory foremen={foremen} logs={logs} teamMembers={teamMembers}
            onCreateMember={handleCreateTeamMember} onUpdateMember={handleUpdateTeamMember} onDeleteMember={handleDeleteTeamMember}
            onCreate={handleCreateForeman} onUpdate={handleUpdateForeman} onDelete={handleDeleteForeman} isAdmin={user.role === 'admin'} />
        )}

        {currentView === 'maker' && (
          <FormMaker
            logs={logs}
            onLog={handleAutoLog}
            onOpenLog={(id) => { const l = logs.find(x => x.id === id); if (l) handleEdit(l); }}
          />
        )}

        {currentView === 'form' && (
          <LogForm
            initialData={editingLog}
            nextLogNo={nextLogNo}
            suggestions={suggestions}
            logs={logs}
            foremen={foremen}
            onSave={handleSaveLog}
            onCancel={closeLogForm}
          />
        )}

        {currentView === 'sheet' && logs.length === 0 && (
          <div className="bg-white rounded-2xl border border-brand-100 text-center py-16 px-4 space-y-4">
            <p className="text-sm text-slate-500 mb-2">No shared connections yet.</p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button onClick={() => openLogForm(null)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-xl shadow-xs transition-colors">
                <Plus className="w-3.5 h-3.5" /> Create first connection
              </button>
              <button onClick={() => setIsCsvImportModalOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-900 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-xl shadow-xs transition-colors">
                <UploadCloud className="w-3.5 h-3.5 text-brand-700" /> Import from CSV
              </button>
            </div>
          </div>
        )}

        {currentView === 'sheet' && logs.length > 0 && (
          <div>
            {missingFilter && (
              <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <span>Showing connections with <b>{missingLabel(missingFilter)}</b> missing ({displayLogs.length})</span>
                <button type="button" onClick={() => setMissingFilter('')} className="px-2.5 py-1 font-semibold bg-white border border-amber-300 rounded-full hover:bg-amber-100">Show all connections</button>
              </div>
            )}
            {displayLogs.length > 0 ? (
              <LogList selectedId={selectedLogId} onSelect={setSelectedLogId} onEdit={handleEdit} onDuplicate={handleDuplicate} onDelete={handleDelete} logs={displayLogs} resetKey={`${searchTerm}|${statusFilter}|${categoryFilter}|${formFilter}|${followFilter}|${upazilaFilter}|${foremanFilter}|${missingFilter}|${dateFrom}|${dateTo}|${sortBy}|${viewMode}`} mode={viewMode} nameLang={nameLang} foremen={foremen} onOpen={(l) => setOpenLogId(l.id)} onToggleForm={handleToggleForm} onToggleBill={handleToggleBill} pending={pendingIdx} onBulkForeman={handleBulkForeman} />
            ) : (
              <div className="bg-white rounded-2xl border border-brand-100 text-center py-16 px-4"><p className="text-sm text-slate-500">No connections match your search or filter.</p></div>
            )}
          </div>
        )}
      </main>

      <DevelopedBy />
        </div>
      </div>

      {/* Outside the sliding page column, so it never shifts while the sidebar moves */}
      {toastMessage && <div className="no-print fixed bottom-4 right-4 z-50 bg-brand-800 text-white text-xs px-3 py-1.5 rounded shadow-lg">{toastMessage}</div>}

      <LogDetailModal
        nameLang={nameLang}
        log={logs.find((l) => l.id === openLogId) || null}
        onClose={() => setOpenLogId(null)}
        onEdit={(l) => { setOpenLogId(null); handleEdit(l); }}
        onDuplicate={(l) => { setOpenLogId(null); handleDuplicate(l); }}
        onDelete={(id) => { setOpenLogId(null); handleDelete(id); }}
        onToggleForm={handleToggleForm}
        onToggleBill={handleToggleBill}
        pending={pendingIdx}
        foremen={foremen}
      />

      <CsvImportModal
        isOpen={isCsvImportModalOpen}
        onClose={() => setIsCsvImportModalOpen(false)}
        existingLogs={logs}
        needsApproval={user.role !== 'admin'}
        foremen={foremen}
        nextLogNo={nextLogNo}
        onImportBatch={handleBatchImport}
      />

      <FieldFillModal isOpen={isFieldFillOpen} onClose={() => setIsFieldFillOpen(false)} logs={logs} onApply={handleFieldFill} foremen={foremen} onApplyForeman={handleBulkForemanFill} />

      {printingAll && (
        <div className="hidden print:block">
          {displayLogs.map((l) => <LogSheetView key={l.id} log={l} foremen={foremen} nameLang={nameLang} />)}
        </div>
      )}

      {user.role === 'admin' && <SuggestionsModal isOpen={isSuggestionsModalOpen} onClose={() => setIsSuggestionsModalOpen(false)} suggestions={suggestions} onUpdateSuggestions={handleUpdateSuggestions} />}
      <ActivityModal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} events={activity} />
      <BackupModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} logs={logs} suggestions={suggestions} onRestore={handleRestoreBackup} onClearAllLogs={handleClearAllLogs} isAdmin={user.role === 'admin'} />
      <ConfirmDialog
        isOpen={!!markPrompt}
        title={markDialog.title}
        message={markDialog.message}
        confirmLabel={markDialog.confirm}
        isDestructive={false}
        onCancel={() => setMarkPrompt(null)}
        onConfirm={confirmMarkPrompt}
      >
        {markPrompt?.type === 'move' && (
          <div className="block text-xs font-medium text-slate-700">
            Move to which month?
            <div className="mt-1.5"><MonthSelect value={markMonth} onChange={setMarkMonth} title="Month to move the selected items to" /></div>
          </div>
        )}
        {markPrompt?.type === 'mark' && markPrompt.items[0].action === 'received' && (
          <div className="block text-xs font-medium text-slate-700">
            {markPrompt.items[0].kind === 'bill' ? 'Which month is this bill for?' : 'Which month is this form for?'}
            <div className="mt-1.5"><MonthSelect value={markMonth} onChange={setMarkMonth} title={markPrompt.items[0].kind === 'bill' ? 'Month the bill was received for' : 'Month the form was received for'} /></div>
          </div>
        )}
      </ConfirmDialog>
      <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} currentUser={user} onToast={showToast} onImportLocal={handleImportLocal}
        onBinChanged={() => { refreshLogs(); refreshForemen(); refreshActivity(); }} />
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} onSave={handleChangePassword} />
      <ProfileModal
        isOpen={isProfileModalOpen}
        user={user}
        onClose={() => setIsProfileModalOpen(false)}
        onUpdateUser={(updated) => {
          setUser(updated);
          showToast('Profile updated successfully');
        }}
        onLogout={() => {
          setIsProfileModalOpen(false);
          if (onLock) onLock();
        }}
        onChangePassword={() => setIsPasswordModalOpen(true)}
      />
    </div>
  );
}