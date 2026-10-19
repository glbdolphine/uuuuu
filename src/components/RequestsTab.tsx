import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, FileUp, Hourglass, Inbox, Search, X } from 'lucide-react';
import { ApprovalRequest, ImportRequest } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { formatStamp } from '../utils/activity';
import { actionLabel, kindLabel } from '../utils/approvals';
import { monthLabel } from '../utils/months';
import { usePersistedState, useScrollMemory } from '../utils/persist';

type FilterKey = 'all' | 'form' | 'bill' | 'import';

export interface BulkSelection { approvalIds: string[]; importIds: string[] }

interface Props {
  approvals: ApprovalRequest[];
  importRequests: ImportRequest[];
  isAdmin: boolean;
  currentName: string;
  currentUserId: string;
  busy?: boolean;
  onApproveAll: (sel: BulkSelection) => void;
  onRejectAll: (sel: BulkSelection) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onWithdraw: (id: string) => void;
  onApproveImport: (id: string) => void;
  onRejectImport: (id: string) => void;
  onWithdrawImport: (id: string) => void;
  onOpenLog: (logId: string) => void;
}

interface Row {
  id: string;
  kind: 'form' | 'bill' | 'import';
  logId?: string;
  logNo?: string | number;
  customer?: string;
  count?: number;
  sample?: string;
  action?: 'received' | 'not_received';
  month?: string;
  receivedOn?: string;
  requestedBy: string;
  requestedById?: string;
  requestedAt: string;
  status?: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
}

const surface = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-18px_rgba(30,50,110,0.25)]';

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
      <div className="relative mt-0.5 text-[11.5px] text-slate-400">{sub}</div>
      <div className={`relative mt-3.5 h-1.5 rounded-full overflow-hidden ${bar === undefined ? 'bg-transparent' : 'bg-slate-100'}`}>
        {bar !== undefined && <div className={`h-full rounded-full bg-gradient-to-r ${t.bar}`} style={{ width: `${bar}%` }} />}
      </div>
    </div>
  );
};

export const RequestsTab: React.FC<Props> = ({
  approvals, importRequests, isAdmin, currentName, currentUserId, busy,
  onApproveAll, onRejectAll, onApprove, onReject, onWithdraw,
  onApproveImport, onRejectImport, onWithdrawImport, onOpenLog,
}) => {
  const [filter, setFilter] = usePersistedState<FilterKey>('requests.filter', 'all');
  const [search, setSearch] = usePersistedState('requests.search', '');
  const [bulk, setBulk] = useState<'approve' | 'reject' | null>(null);

  const pendingApprovals = useMemo(() => approvals.filter((a) => a.status === 'pending'), [approvals]);
  const pendingImports = useMemo(() => importRequests.filter((r) => r.status === 'pending'), [importRequests]);

  const formsCount = pendingApprovals.filter((a) => a.kind === 'form').length;
  const billsCount = pendingApprovals.filter((a) => a.kind === 'bill').length;
  const importsCount = pendingImports.length;
  const totalPending = formsCount + billsCount + importsCount;

  const allRows = useMemo<Row[]>(() => {
    const list: Row[] = [
      ...pendingApprovals.map<Row>((a) => ({
        id: a.id,
        kind: a.kind,
        logId: a.logId,
        logNo: a.logNo,
        customer: a.customer,
        action: a.action,
        month: a.month,
        receivedOn: a.receivedOn,
        requestedBy: a.requestedBy,
        requestedById: a.requestedById,
        requestedAt: a.requestedAt,
      })),
      ...pendingImports.map<Row>((r) => ({
        id: r.id,
        kind: 'import',
        count: r.count,
        sample: r.sample,
        requestedBy: r.requestedBy,
        requestedById: r.requestedById,
        requestedAt: r.requestedAt,
      })),
    ];
    return list.sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  }, [pendingApprovals, pendingImports]);

  // Ownership is by account id; requests made before ids were recorded fall back to the name.
  const isMine = (r: { requestedBy: string; requestedById?: string }) =>
    r.requestedById ? r.requestedById === currentUserId : r.requestedBy === currentName;

  // Decided requests, newest first. Admins see everyone's; everyone else sees only their own.
  const decided = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    const list: Row[] = [
      ...approvals.filter((a) => a.status !== 'pending').map<Row>((a) => ({
        id: a.id, kind: a.kind, logId: a.logId, logNo: a.logNo, customer: a.customer, action: a.action, month: a.month,
        receivedOn: a.receivedOn, requestedBy: a.requestedBy, requestedById: a.requestedById, requestedAt: a.requestedAt,
        status: a.status, decidedBy: a.decidedBy, decidedAt: a.decidedAt,
      })),
      ...importRequests.filter((r) => r.status !== 'pending').map<Row>((r) => ({
        id: r.id, kind: 'import', count: r.count, sample: r.sample, requestedBy: r.requestedBy, requestedById: r.requestedById,
        requestedAt: r.requestedAt, status: r.status, decidedBy: r.decidedBy, decidedAt: r.decidedAt,
      })),
    ];
    return list
      .filter((r) => isAdmin || isMine(r))
      .filter((r) => filter === 'all' || r.kind === filter)
      .filter((r) => !q || [r.logNo, r.customer, r.requestedBy, r.decidedBy, r.sample, r.kind, r.action].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')))
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals, importRequests, filter, search, isAdmin, currentUserId, currentName]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (filter === 'form' && r.kind !== 'form') return false;
      if (filter === 'bill' && r.kind !== 'bill') return false;
      if (filter === 'import' && r.kind !== 'import') return false;
      if (!q) return true;
      return [r.logNo, r.customer, r.requestedBy, r.sample, r.kind, r.action]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [allRows, filter, search]);

  const selection = useMemo<BulkSelection>(() => ({
    approvalIds: rows.filter((r) => r.kind !== 'import').map((r) => r.id),
    importIds: rows.filter((r) => r.kind === 'import').map((r) => r.id),
  }), [rows]);
  const filtered = filter !== 'all' || search.trim() !== '';

  const chips: { key: FilterKey; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: totalPending },
    { key: 'form', label: 'Forms', n: formsCount },
    { key: 'bill', label: 'Bills', n: billsCount },
    { key: 'import', label: 'CSV imports', n: importsCount },
  ];

  return (
    <div className="w-full space-y-5 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/25"><Inbox className="w-5 h-5" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1b2a4e]">Requests</h1>
            <p className="text-[13px] text-slate-500">Form marks, bill marks and CSV imports waiting for admin approval.</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <Kpi icon={Hourglass} tone="amber" label="Waiting for approval" value={totalPending} sub="every request in the queue"
          bar={totalPending ? 100 : 0} />
        <Kpi icon={CheckCheck} tone="sky" label="Mark requests" value={formsCount + billsCount}
          sub={`${formsCount} form${formsCount === 1 ? '' : 's'} · ${billsCount} bill${billsCount === 1 ? '' : 's'}`}
          bar={totalPending ? Math.round(((formsCount + billsCount) / totalPending) * 100) : 0} />
        <Kpi icon={FileUp} tone="sky" label="CSV imports" value={importsCount}
          sub={importsCount ? 'bulk connection imports to review' : 'no bulk imports waiting'}
          bar={totalPending ? Math.round((importsCount / totalPending) * 100) : 0} />
      </div>

      <section className={`${surface} overflow-hidden min-w-0 flex flex-col`}>
        <div className="p-4 flex flex-wrap items-center gap-2.5 border-b border-slate-100">
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 text-xs font-semibold flex-wrap" role="tablist">
            {chips.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)}
                className={`h-8 px-3.5 rounded-[10px] transition-colors ${filter === c.key ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {c.label} <span className={`ml-1 tabular-nums ${filter === c.key ? 'text-brand-600' : 'text-slate-400'}`}>{c.n}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search connection, institute or requester"
              className="w-full h-10 pl-9 pr-3 text-[13px] bg-slate-50 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:border-slate-200 placeholder:text-slate-400" />
          </div>
          {isAdmin && rows.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" disabled={busy} onClick={() => setBulk('reject')}
                className="h-9 px-3.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50 transition-colors">
                {filtered ? `Reject shown (${rows.length})` : 'Reject all'}
              </button>
              <button type="button" disabled={busy} onClick={() => setBulk('approve')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm disabled:opacity-50 transition-colors">
                <CheckCheck className="w-3.5 h-3.5" />{filtered ? `Approve shown (${rows.length})` : `Approve all (${rows.length})`}
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="grid place-content-center px-4 py-20 text-center">
            <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-slate-50 text-slate-300"><Inbox className="w-6 h-6" /></span>
            <p className="text-sm font-semibold text-[#1b2a4e]">Nothing waiting for confirmation</p>
            <p className="text-xs text-slate-400 mt-1">
              {totalPending === 0 ? 'New form, bill and CSV import requests will appear here.' : 'No request matches your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[calc(100vh_-_24rem)] overflow-y-auto">
            {rows.map((r) => {
              const isImport = r.kind === 'import';
              const badgeCls = r.kind === 'form'
                ? 'bg-emerald-100 text-emerald-800'
                : r.kind === 'bill'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-amber-100 text-amber-800';
              const badge = r.kind === 'form' ? 'FORM' : r.kind === 'bill' ? 'BILL' : 'IMPORT';
              const mine = isMine(r);

              return (
                <div key={`${r.kind}-${r.id}`} className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 hover:bg-brand-50/50 transition-colors">
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${badgeCls}`}>{badge}</span>
                  {!isImport && (
                    <span className="grid place-items-center h-7 min-w-8 px-1.5 rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700 tabular-nums shrink-0">#{r.logNo}</span>
                  )}
                  {isImport ? (
                    <div className="flex-1 min-w-[11rem] text-left">
                      <span className="block text-[13.5px] font-semibold leading-relaxed text-[#1b2a4e] truncate">
                        {r.count} connection{r.count === 1 ? '' : 's'} to import
                      </span>
                      <span className="block text-[11.5px] text-slate-400 truncate">
                        {r.sample ? `${r.sample}${r.count && r.count > 3 ? ' …' : ''} · ` : ''}
                        asked by {r.requestedBy} · {formatStamp(r.requestedAt)}
                      </span>
                    </div>
                  ) : (
                    <button type="button" onClick={() => r.logId && onOpenLog(r.logId)} className="flex-1 min-w-[11rem] text-left">
                      <span className="block text-[13.5px] font-semibold leading-relaxed text-[#1b2a4e] truncate">{r.customer || 'Untitled'}</span>
                      <span className="block text-[11.5px] text-slate-400 truncate">
                        {kindLabel(r.kind as 'form' | 'bill')} {actionLabel(r.action as 'received' | 'not_received')}
                        {r.action === 'received' && r.kind === 'bill' && r.month ? ` · ${monthLabel(r.month)}` : ''}
                        {r.action === 'received' && r.kind === 'form' && r.receivedOn ? ` · ${monthLabel(r.receivedOn.slice(0, 7))}` : ''}
                        {' · asked by '}{r.requestedBy} · {formatStamp(r.requestedAt)}
                      </span>
                    </button>
                  )}

                  {isAdmin ? (
                    <span className="shrink-0 flex items-center gap-1.5">
                      <button type="button" disabled={busy}
                        onClick={() => (isImport ? onApproveImport(r.id) : onApprove(r.id))}
                        className="inline-flex items-center gap-1 h-8 px-3.5 text-[11.5px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full disabled:opacity-50 transition-colors">
                        <Check className="w-3.5 h-3.5" />{isImport ? 'Approve & import' : 'Approve'}
                      </button>
                      <button type="button" disabled={busy}
                        onClick={() => (isImport ? onRejectImport(r.id) : onReject(r.id))}
                        title="Reject" aria-label="Reject"
                        className="grid place-items-center w-8 h-8 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-full disabled:opacity-50 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ) : mine ? (
                    <button type="button" onClick={() => (isImport ? onWithdrawImport(r.id) : onWithdraw(r.id))}
                      className="shrink-0 h-8 px-3.5 text-[11.5px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors">
                      Withdraw
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
      {decided.length > 0 && (
        <section className={`${surface} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#1b2a4e]">Recent decisions</h2>
            <span className="text-[11.5px] text-slate-400">{isAdmin ? 'latest 15' : 'your requests, latest 15'}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {decided.map((r) => {
              const ok = r.status === 'approved';
              const isImport = r.kind === 'import';
              const what = isImport
                ? `${r.count} connection${r.count === 1 ? '' : 's'} import`
                : `${kindLabel(r.kind as 'form' | 'bill')} ${actionLabel(r.action as 'received' | 'not_received')} · #${r.logNo} ${r.customer || ''}`;
              return (
                <div key={`d-${r.kind}-${r.id}`} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
                    {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{ok ? 'Approved' : 'Rejected'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#1b2a4e] truncate">{what}</span>
                    <span className="block text-[11.5px] text-slate-400 truncate">
                      asked by {isMine(r) ? 'you' : r.requestedBy} · {ok ? 'approved' : 'rejected'} by {r.decidedBy || 'admin'} · {formatStamp(r.decidedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={bulk !== null}
        title={bulk === 'approve' ? `Approve ${rows.length} request${rows.length === 1 ? '' : 's'}?` : `Reject ${rows.length} request${rows.length === 1 ? '' : 's'}?`}
        message={bulk === 'approve'
          ? `${filtered ? 'The requests currently shown' : 'Every waiting request'} will be applied right away${selection.importIds.length ? `, including ${selection.importIds.length} CSV import${selection.importIds.length === 1 ? '' : 's'} that will add connections` : ''}.`
          : `${filtered ? 'The requests currently shown' : 'Every waiting request'} will be rejected. Nothing will be changed on the connections.`}
        confirmLabel={bulk === 'approve' ? 'Approve' : 'Reject'}
        isDestructive={bulk === 'reject'}
        onCancel={() => setBulk(null)}
        onConfirm={() => { const b = bulk; setBulk(null); if (b === 'approve') onApproveAll(selection); else if (b === 'reject') onRejectAll(selection); }}
      />
    </div>
  );
};