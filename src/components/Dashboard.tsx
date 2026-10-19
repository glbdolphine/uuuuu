import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Clock, FilePlus2, FileText, Receipt, Users } from 'lucide-react';
import { ActivityEvent, LogEntry } from '../types';
import { logDay } from '../utils/dates';
import { expectsForm, formStats, getOverdueDays, hasForm, isFormOverdue } from '../utils/forms';
import { followDiff, followLabel, followState, startOfToday } from '../utils/followUps';
import { formatStamp } from '../utils/activity';
import { displayName } from '../utils/names';
import { billStats } from '../utils/bills';
import { completenessStats, MissingKey } from '../utils/completeness';

export interface DashboardGo {
  status?: 'pending' | 'in_progress' | 'resolved';
  form?: 'awaiting';
  follow?: 'today' | 'overdue';
  foremanName?: string;
  missing?: MissingKey;
}

interface Props {
  logs: LogEntry[];
  activity: ActivityEvent[];
  avatars?: Record<string, string>;
  userName: string;
  onOpenLog: (id: string) => void;
  onGo: (target: DashboardGo) => void;
  onOpenBills?: () => void;
}

const isPending = (s = '') => /pending|waiting/i.test(s);

type Tone = 'plain' | 'warn' | 'bad' | 'good';

const TONE: Record<Tone, { icon: string; halo: string; value: string }> = {
  plain: { icon: 'from-brand-400 to-brand-700 shadow-brand-600/30', halo: 'from-brand-50', value: 'text-brand-700' },
  good: { icon: 'from-teal-400 to-emerald-600 shadow-emerald-600/30', halo: 'from-emerald-50', value: 'text-emerald-600' },
  warn: { icon: 'from-amber-300 to-orange-500 shadow-orange-500/30', halo: 'from-amber-50', value: 'text-amber-600' },
  bad: { icon: 'from-orange-400 to-rose-600 shadow-rose-600/30', halo: 'from-rose-50', value: 'text-rose-600' },
};

const INK = 'text-[#1b2a4e]';
const SURFACE = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-16px_rgba(30,50,110,0.22)]';
const NUM = 'tabular-nums';
const PANEL_H = 'h-[26rem]';

const BAR: Record<Tone, string> = {
  plain: 'from-brand-400 to-brand-600',
  good: 'from-teal-400 to-emerald-500',
  warn: 'from-amber-300 to-orange-500',
  bad: 'from-orange-400 to-rose-500',
};

const Card: React.FC<{
  label: string; value: number | string; sub?: string; icon: React.ElementType;
  tone?: Tone; progress?: number; onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, tone = 'plain', progress, onClick }) => {
  const t = TONE[tone];
  const pct = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`group relative overflow-hidden text-left ${SURFACE} p-5 flex flex-col h-full min-h-[10.5rem] transition duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(30,50,110,0.3)] focus-visible:outline-2 focus-visible:outline-brand-500' : 'cursor-default'}`}>
      <span className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${t.halo} to-transparent`} aria-hidden />
      <span className="relative flex items-start justify-between gap-3">
        <span className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${t.icon} text-white shadow-lg`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className={`text-[34px] leading-none font-extrabold font-display ${NUM} ${t.value}`}>{value}</span>
      </span>
      <span className={`relative mt-4 block text-[15px] font-semibold ${INK}`}>{label}</span>
      <span className="relative mt-0.5 block min-h-4 text-[11.5px] text-slate-400 truncate">{sub}</span>
      <span className="relative mt-auto pt-4 block">
        <span className={`block h-1.5 rounded-full overflow-hidden ${pct === undefined ? 'bg-transparent' : 'bg-slate-100'}`}>
          {pct !== undefined && <span className={`block h-full rounded-full bg-gradient-to-r ${BAR[tone]}`} style={{ width: `${pct}%` }} />}
        </span>
      </span>
    </button>
  );
};

const PanelHead: React.FC<{ title: string; icon: React.ElementType; right?: React.ReactNode }> = ({ title, icon: Icon, right }) => (
  <h2 className={`shrink-0 px-5 pt-5 pb-3 flex items-center gap-2.5 text-[15px] font-bold border-b border-slate-100 mb-2 ${INK}`}>
    <span className="grid place-items-center w-8 h-8 rounded-xl bg-brand-50 text-brand-700 shrink-0"><Icon className="w-4 h-4" /></span>
    <span className="truncate">{title}</span>
    {right !== undefined && <span className={`ml-auto shrink-0 px-2.5 py-1 rounded-full bg-brand-50 text-[11.5px] font-semibold text-brand-700 ${NUM}`}>{right}</span>}
  </h2>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex-1 grid place-items-center px-6 pb-6">
    <p className="w-full rounded-2xl bg-slate-50 px-4 py-10 text-xs text-slate-400 text-center">{children}</p>
  </div>
);

const fillTone = (fill: number) =>
  fill >= 85 ? { bar: 'from-emerald-400 to-teal-500', text: 'text-emerald-600', ring: '#10b981' }
  : fill >= 50 ? { bar: 'from-amber-300 to-orange-400', text: 'text-amber-600', ring: '#f59e0b' }
  : { bar: 'from-orange-400 to-rose-500', text: 'text-rose-600', ring: '#f43f5e' };

const MissingPanel: React.FC<{
  total: number;
  incomplete: number;
  fields: { key: MissingKey; label: string; missing: number }[];
  onGo: (key: MissingKey) => void;
}> = ({ total, incomplete, fields, onGo }) => {
  const cells = total * fields.length;
  const gaps = fields.reduce((n, f) => n + f.missing, 0);
  const overall = cells ? Math.round(((cells - gaps) / cells) * 100) : 100;
  const tone = fillTone(overall);
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <section className={`${SURFACE} overflow-hidden flex flex-col ${PANEL_H}`}>
      <PanelHead title="What is missing" icon={AlertTriangle} right={`${incomplete} of ${total}`} />
      {total === 0 ? <Empty>No connections yet.</Empty> : (
        <>
          <div className="shrink-0 mx-3 mb-1 flex items-center gap-4 rounded-2xl bg-slate-50/80 px-4 py-3">
            <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r={R} fill="none" className="stroke-slate-200" strokeWidth="7" />
              <circle cx="32" cy="32" r={R} fill="none" stroke={tone.ring} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - overall / 100)} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
            </svg>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Details filled in</div>
              <div className={`text-2xl font-extrabold leading-tight ${NUM} ${tone.text}`}>{overall}%</div>
              <div className="text-[11.5px] text-slate-500">{incomplete === 0 ? 'Every connection is complete' : `${incomplete} connections still have gaps`}</div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {fields.map((f) => {
              const fill = Math.round(((total - f.missing) / total) * 100);
              const t = fillTone(fill);
              return (
                <button key={f.key} type="button" disabled={!f.missing} onClick={() => onGo(f.key)}
                  className="group w-full text-left px-3 py-2 rounded-2xl enabled:hover:bg-slate-50 disabled:cursor-default transition-colors">
                  <span className="flex items-center gap-2 text-[13px]">
                    <span className={`flex-1 min-w-0 truncate font-semibold ${INK}`}>{f.label}</span>
                    {f.missing ? (
                      <>
                        <span className={`shrink-0 font-bold ${NUM} ${t.text}`}>{f.missing}</span>
                        <span className="shrink-0 text-[11.5px] text-slate-400">missing</span>
                        <ChevronRight className="shrink-0 w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition" />
                      </>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> All filled</span>
                    )}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span className={`block h-full rounded-full bg-gradient-to-r ${t.bar}`} style={{ width: `${fill}%` }} />
                    </span>
                    <span className={`w-9 text-right text-[11px] text-slate-400 ${NUM}`}>{fill}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

const shortDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const STATUS_DOT: Record<string, string> = { resolved: 'bg-emerald-500', progress: 'bg-amber-400', pending: 'bg-rose-400' };
const statusDot = (st = '') => (/resolved/i.test(st) ? STATUS_DOT.resolved : /progress/i.test(st) ? STATUS_DOT.progress : STATUS_DOT.pending);

const TodayPanel: React.FC<{ todays: LogEntry[]; all: LogEntry[]; onOpen: (id: string) => void }> = ({ todays, all, onOpen }) => {
  const resolved = todays.filter((l) => /resolved/i.test(l.status || '')).length;
  const awaitingForm = todays.filter((l) => expectsForm(l) && !hasForm(l)).length;
  // On a quiet day, show the latest logs instead of an empty box.
  const latest = useMemo(
    () => [...all].sort((a, b) => (Number(b.logNo) || 0) - (Number(a.logNo) || 0)).slice(0, 6),
    [all],
  );
  const Item: React.FC<{ l: LogEntry; right: string }> = ({ l, right }) => (
    <button type="button" onClick={() => onOpen(l.id)} className="group w-full text-left px-3 py-2 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-colors">
      <span className={`h-9 w-1 rounded-full shrink-0 ${statusDot(l.status)}`} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-semibold truncate ${INK}`}>{displayName(l) || 'Untitled'}</span>
        <span className="block text-[11.5px] text-slate-400 truncate">#{l.logNo}{[l.foremanName, l.requestType].filter(Boolean).length ? ' · ' : ''}{[l.foremanName, l.requestType].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`shrink-0 text-[11.5px] font-semibold text-slate-400 ${NUM}`}>{right}</span>
      <ChevronRight className="shrink-0 w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition" />
    </button>
  );
  return (
    <section className={`${SURFACE} overflow-hidden flex flex-col ${PANEL_H}`}>
      <PanelHead title="Today's connections" icon={FileText} right={todays.length} />
      {todays.length === 0 ? (
        <>
          <div className="shrink-0 mx-3 mb-1 flex items-center gap-3 rounded-2xl bg-slate-50/80 px-4 py-3">
            <span className="grid place-items-center w-10 h-10 rounded-2xl bg-white text-brand-600 shadow-sm shrink-0"><FilePlus2 className="w-5 h-5" /></span>
            <div className="min-w-0">
              <div className={`text-[13.5px] font-bold ${INK}`}>Nothing logged yet today</div>
              <div className="text-[11.5px] text-slate-500">New connections will appear here as they come in.</div>
            </div>
          </div>
          {latest.length > 0 && (
            <>
              <div className="shrink-0 px-5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Latest connections</div>
              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
                {latest.map((l) => <Item key={l.id} l={l} right={shortDate(l.createdAt) || shortDate(l.date)} />)}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="shrink-0 mx-3 mb-1 grid grid-cols-3 gap-2">
            {[
              { label: 'Added', value: todays.length, cls: 'text-brand-700 bg-brand-50' },
              { label: 'Resolved', value: resolved, cls: 'text-emerald-600 bg-emerald-50' },
              { label: 'Form due', value: awaitingForm, cls: awaitingForm ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-50' },
            ].map((t) => (
              <div key={t.label} className={`rounded-2xl px-3 py-2 ${t.cls}`}>
                <div className={`text-lg font-extrabold leading-tight ${NUM}`}>{t.value}</div>
                <div className="text-[11px] font-semibold opacity-80">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {[...todays].reverse().map((l) => (
              <Item key={l.id} l={l} right={expectsForm(l) ? (hasForm(l) ? 'form ✓' : 'form ○') : ''} />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

const AVATAR = ['bg-brand-600', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500'];
const avatarOf = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR[h % AVATAR.length];
};
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const AgentAvatar: React.FC<{ name: string; photoUrl?: string }> = ({ name, photoUrl }) => {
  const [broken, setBroken] = React.useState(false);
  if (photoUrl && !broken) {
    return <img src={photoUrl} alt={name} onError={() => setBroken(true)} className="w-9 h-9 rounded-full object-cover shrink-0 bg-slate-100 border border-slate-200" />;
  }
  return <span className={`grid place-items-center w-9 h-9 rounded-full text-[12px] font-bold text-white shrink-0 ${avatarOf(name)}`}>{initialsOf(name)}</span>;
};

const AgentPanel: React.FC<{ rows: { name: string; created: number; edited: number; deleted: number; week: number; last: string }[]; avatars: Record<string, string> }> = ({ rows, avatars }) => {
  const sum = (k: 'created' | 'edited' | 'deleted') => rows.reduce((n, r) => n + r[k], 0);
  const top = rows.reduce((m, r) => Math.max(m, r.week), 0) || 1;
  const tiles = [
    { label: 'New today', value: sum('created'), cls: 'text-emerald-600 bg-emerald-50' },
    { label: 'Edited today', value: sum('edited'), cls: 'text-sky-600 bg-sky-50' },
    { label: 'Deleted today', value: sum('deleted'), cls: 'text-rose-600 bg-rose-50' },
  ];
  return (
    <section className={`${SURFACE} overflow-hidden flex flex-col ${PANEL_H}`}>
      <PanelHead title="Agent activity" icon={Users} right="last 7 days" />
      {rows.length === 0 ? <Empty>No activity in the last 7 days.</Empty> : (
        <>
          <div className="shrink-0 mx-3 mb-1 grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <div key={t.label} className={`rounded-2xl px-3 py-2 ${t.cls}`}>
                <div className={`text-lg font-extrabold leading-tight ${NUM}`}>{t.value}</div>
                <div className="text-[11px] font-semibold opacity-80">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {rows.map((a) => {
              const today = a.created + a.edited + a.deleted;
              return (
                <div key={a.name} className="px-3 py-2.5 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={a.name} photoUrl={avatars[a.name]} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] font-semibold truncate ${INK}`}>{a.name}</span>
                      <span className="block text-[11.5px] text-slate-400 truncate">Last active {formatStamp(a.last)}</span>
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <span className={`block text-[15px] font-extrabold ${NUM} ${INK}`}>{a.week}</span>
                      <span className="block text-[10.5px] text-slate-400">in 7 days</span>
                    </span>
                  </div>
                  <div className="mt-2 ml-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${Math.max(4, Math.round((a.week / top) * 100))}%` }} />
                  </div>
                  <div className="mt-1.5 ml-12 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    {today === 0 && <span className="text-slate-300 font-medium">No changes today</span>}
                    {a.created > 0 && <span className="rounded-full bg-emerald-50 text-emerald-600 px-2 py-0.5">{a.created} new</span>}
                    {a.edited > 0 && <span className="rounded-full bg-sky-50 text-sky-600 px-2 py-0.5">{a.edited} edited</span>}
                    {a.deleted > 0 && <span className="rounded-full bg-rose-50 text-rose-600 px-2 py-0.5">{a.deleted} deleted</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export const Dashboard: React.FC<Props> = ({ logs, activity, avatars = {}, userName, onOpenLog, onGo, onOpenBills }) => {
  const d = useMemo(() => {
    const today = startOfToday();
    const limit = getOverdueDays();
    const todays = logs.filter((l) => logDay(l)?.getTime() === today.getTime());
    const pending = logs.filter((l) => isPending(l.status));
    const forms = formStats(logs);
    const overdueForms = logs.filter((l) => isFormOverdue(l, limit));
    const overdueFollow = logs.filter((l) => followState(l, today) === 'overdue')
      .sort((a, b) => (followDiff(a, today) ?? 0) - (followDiff(b, today) ?? 0));
    const dueToday = logs.filter((l) => followState(l, today) === 'today');

    // Agent activity from the shared activity feed
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    const agents = new Map<string, { created: number; edited: number; deleted: number; week: number; last: string }>();
    for (const e of activity) {
      if (!['created', 'edited', 'deleted'].includes(e.action)) continue;
      const at = new Date(e.at);
      if (isNaN(at.getTime()) || at < weekAgo) continue;
      const a = agents.get(e.by) || { created: 0, edited: 0, deleted: 0, week: 0, last: '' };
      a.week++;
      if (at >= today) {
        if (e.action === 'created') a.created++;
        else if (e.action === 'edited') a.edited++;
        else a.deleted++;
      }
      if (!a.last || e.at > a.last) a.last = e.at;
      agents.set(e.by, a);
    }
    const agentRows = [...agents.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((x, y) => (y.created + y.edited + y.deleted) - (x.created + x.edited + x.deleted) || y.week - x.week);

    const bills = billStats(logs);
    const info = completenessStats(logs);

    return { limit, todays, pending, forms, overdueForms, overdueFollow, dueToday, agentRows, bills, info };
  }, [logs, activity]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const formsDone = pctOf(d.forms.received, d.forms.sent);
  const billsDone = pctOf(d.bills.received, d.bills.total);

  return (
    <div className="w-full flex flex-col gap-4 sm:gap-5 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className={`text-2xl sm:text-[28px] font-extrabold tracking-tight ${INK}`}>{greet}, {userName}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {d.todays.length === 0 ? 'No connections added yet today.' : `${d.todays.length} ${d.todays.length === 1 ? 'connection' : 'connections'} added today, ${logs.length} in total.`}
          </p>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-100 shadow-[0_8px_20px_-12px_rgba(30,50,110,0.25)]">
          <CalendarClock className="w-4 h-4 text-brand-600" />{todayLabel}
        </p>
      </header>

      {/* Row 1: the overall picture. Four equal cards. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <Card label="Institutes" value={logs.length} sub={`${d.info.complete} fully filled in`} icon={FileText}
          progress={pctOf(d.info.complete, logs.length)} />
        <Card label="Forms received" value={`${d.forms.received}/${d.forms.sent}`} sub={`${d.forms.awaiting} still awaited`}
          icon={ClipboardCheck} tone={d.forms.awaiting ? 'warn' : 'good'} progress={formsDone} onClick={() => onGo({ form: 'awaiting' })} />
        <Card label="Bills received" value={`${d.bills.received}/${d.bills.total}`} sub={`${d.bills.notReceived} pending · ${d.bills.pct}%`}
          icon={Receipt} tone={d.bills.notReceived ? 'warn' : 'good'} progress={billsDone} onClick={onOpenBills} />
        <Card label="Missing details" value={d.info.incomplete} sub="connections with information missing"
          icon={AlertTriangle} tone={d.info.incomplete ? 'bad' : 'good'} progress={pctOf(d.info.incomplete, logs.length)}
          onClick={() => onGo({ missing: d.info.perField[0]?.missing ? d.info.perField[0].key : undefined })} />
      </div>

      {/* Row 2: what needs action. Four equal cards, same grid as row 1. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <Card label="Pending" value={d.pending.length} sub="waiting for foreman" icon={Clock}
          tone={d.pending.length ? 'warn' : 'good'} progress={pctOf(d.pending.length, logs.length)} onClick={() => onGo({ status: 'pending' })} />
        <Card label="Forms awaiting" value={d.forms.awaiting}
          sub={d.overdueForms.length ? `${d.overdueForms.length} overdue (${d.limit}+ days)` : `${d.forms.received} of ${d.forms.sent} received`}
          icon={ClipboardCheck} tone={d.overdueForms.length ? 'bad' : d.forms.awaiting ? 'warn' : 'good'}
          progress={pctOf(d.overdueForms.length, d.forms.awaiting)} onClick={() => onGo({ form: 'awaiting' })} />
        <Card label="Follow-up today" value={d.dueToday.length} sub={d.dueToday.length ? 'due today' : 'nothing due today'} icon={CalendarClock}
          tone={d.dueToday.length ? 'warn' : 'good'} onClick={() => onGo({ follow: 'today' })} />
        <Card label="Overdue follow-ups" value={d.overdueFollow.length} sub={d.overdueFollow.length ? 'past their date' : 'all caught up'} icon={AlertTriangle}
          tone={d.overdueFollow.length ? 'bad' : 'good'} onClick={() => onGo({ follow: 'overdue' })} />
      </div>

      {/* Row 3: three equal panels, one fixed height, each scrolls inside itself. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">
        <MissingPanel total={logs.length} incomplete={d.info.incomplete} fields={d.info.perField} onGo={(key) => onGo({ missing: key })} />

        <TodayPanel todays={d.todays} all={logs} onOpen={onOpenLog} />

        <AgentPanel rows={d.agentRows} avatars={avatars} />
      </div>
    </div>
  );
};
