import React, { useEffect, useState } from 'react';
import { X, UserPlus, Shield, KeyRound, UserX, UserCheck, Upload, RefreshCw, Trash2, RotateCcw, Shuffle, Users, Archive, Lock } from 'lucide-react';
import { AppUser, AdminUserSummary, LogEntry, Foreman } from '../types';
import { changePassword } from '../utils/auth';
import { getAccessToken } from '../utils/cloud';
import {
  createUserAccount, disableUserAccount, listUsers, resetUserPassword,
  loadBin, restoreBinLog, restoreBinForeman, purgeBinLog, purgeBinForeman, emptyBin,
} from '../utils/cloud';
import { ConfirmDialog } from './ConfirmDialog';
import { formatStamp } from '../utils/activity';
import { ScrollLock } from './ScrollLock';

// Easy to read out loud: no 0/O or 1/l/I.
const makePassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onToast: (message: string) => void;
  onImportLocal: () => void;
  onBinChanged: () => void;
}

export const AdminPanel: React.FC<Props> = ({ isOpen, onClose, currentUser, onToast, onImportLocal, onBinChanged }) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [bin, setBin] = useState<{ logs: LogEntry[]; foremen: Foreman[] }>({ logs: [], foremen: [] });
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [purge, setPurge] = useState<{ kind: 'log' | 'foreman'; id: string; label: string } | null>(null);
  const [tab, setTab] = useState<'accounts' | 'bin' | 'security'>('accounts');

  const load = async () => {
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (e: any) { setError(e?.message || 'Could not load users.'); }
  };
  const loadTheBin = async () => {
    try { setBin(await loadBin()); } catch (e: any) { setError(e?.message || 'Could not load the bin.'); }
  };
  useEffect(() => {
    if (isOpen && currentUser.role === 'admin') { load(); loadTheBin(); }
  }, [isOpen, currentUser.role]);

  const doReset = async (u: AdminUserSummary) => {
    if (resetPwd.length < 8) return setError('New password must be at least 8 characters.');
    setBusy(true); setError('');
    try {
      await resetUserPassword(u.id, resetPwd);
      setResetId(null); setResetPwd('');
      await load();
      onToast(`Password reset for ${u.username}`);
    } catch (e: any) { setError(e?.message || 'Could not reset password.'); }
    finally { setBusy(false); }
  };

  const binAct = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setError('');
    try { await fn(); await loadTheBin(); onBinChanged(); onToast(msg); }
    catch (e: any) { setError(e?.message || 'Bin action failed.'); }
    finally { setBusy(false); }
  };

  if (!isOpen || currentUser.role !== 'admin') return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('New user password must be at least 8 characters.');
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      await createUserAccount(token, username, password, displayName || username);
      setUsername(''); setDisplayName(''); setPassword('');
      await load();
      onToast('User account created');
    } catch (e: any) { setError(e?.message || 'Could not create user.'); }
    finally { setBusy(false); }
  };

  const toggle = async (u: AdminUserSummary) => {
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      await disableUserAccount(token, u.id, !u.disabled);
      await load();
      onToast(u.disabled ? `${u.username} enabled` : `${u.username} disabled`);
    } catch (e: any) { setError(e?.message || 'Could not update account.'); }
    finally { setBusy(false); }
  };

  const changeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword.length < 8) return setError('Admin password must be at least 8 characters.');
    if (adminPassword !== confirm) return setError('Passwords do not match.');
    setBusy(true); setError('');
    try {
      await changePassword(adminPassword);
      setAdminPassword(''); setConfirm('');
      onToast('Admin password changed');
    } catch (e: any) { setError(e?.message || 'Could not change admin password.'); }
    finally { setBusy(false); }
  };

  const binCount = bin.logs.length + bin.foremen.length;
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const field = 'h-10 px-3.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 placeholder:text-slate-400';
  const ghostBtn = 'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const dangerBtn = 'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const TABS = [
    { id: 'accounts' as const, label: 'Accounts', icon: Users, count: users.length },
    { id: 'bin' as const, label: 'Bin', icon: Archive, count: binCount },
    { id: 'security' as const, label: 'Security', icon: Lock, count: undefined },
  ];

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm">
      <ScrollLock />
      <div role="dialog" aria-modal="true" aria-label="Administrator"
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden h-[min(44rem,90vh)] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/30"><Shield className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#1b2a4e]">Administrator</h2>
            <p className="text-xs text-slate-500">Accounts, deleted items and security</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid place-items-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Section switcher */}
          <nav aria-label="Admin sections" className="shrink-0 md:w-56 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 p-3 flex md:flex-col gap-1.5 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] whitespace-nowrap transition-colors ${active ? 'bg-brand-700 text-white font-semibold shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
                  <t.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{t.label}</span>
                  {t.count !== undefined && <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-white text-slate-500 border border-slate-100'}`}>{t.count}</span>}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
            {error && (
              <div role="alert" className="flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError('')} aria-label="Dismiss" className="text-rose-400 hover:text-rose-700"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {tab === 'accounts' && (
              <>
                <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                  <h3 className="text-sm font-bold text-[#1b2a4e]">Create a colleague account</h3>
                  <p className="text-xs text-slate-500 mt-0.5 mb-3.5">They sign in with this username and password. Passwords are stored securely and can't be viewed later, so note it down now. If it's forgotten, use Reset to set a new one.</p>
                  <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] gap-2.5">
                    <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="Username / ID" aria-label="Username" className={field} />
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" aria-label="Display name" className={field} />
                    <div className="flex gap-1.5">
                      <input value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Initial password" aria-label="Initial password" className={`${field} w-full min-w-0 font-mono`} />
                      <button type="button" onClick={() => setPassword(makePassword())} title="Generate a password" aria-label="Generate a password" className="shrink-0 grid place-items-center w-10 h-10 border border-slate-200 bg-white rounded-xl text-slate-600 hover:bg-slate-50"><Shuffle className="w-4 h-4" /></button>
                    </div>
                    <button disabled={busy} className="h-10 px-5 inline-flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors sm:col-span-2 lg:col-span-1"><UserPlus className="w-4 h-4" />Create account</button>
                  </form>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <h3 className="text-sm font-bold text-[#1b2a4e]">Accounts <span className="font-medium text-slate-400 tabular-nums">({users.length})</span></h3>
                  </div>
                  <ul className="space-y-2.5">
                    {users.map(u => {
                      const me = u.id === currentUser.id;
                      return (
                        <li key={u.id} className="rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_-18px_rgba(30,50,110,0.3)]">
                          <div className="p-3.5 flex flex-wrap items-center gap-x-4 gap-y-3">
                            <span className={`grid place-items-center w-11 h-11 rounded-full text-sm font-bold shrink-0 ${u.disabled ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-700'}`}>{initials(u.displayName)}</span>
                            <div className="min-w-0 flex-1 basis-40">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[#1b2a4e] truncate">{u.displayName}</span>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.disabled ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{u.disabled ? 'Disabled' : 'Active'}</span>
                              </div>
                              <div className="text-xs text-slate-500 font-mono truncate">{u.username}</div>
                            </div>
                            <div className="flex gap-1.5 ml-auto">
                              <button disabled={busy || me} onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPwd(''); }} className={ghostBtn}><KeyRound className="w-3.5 h-3.5" />Reset</button>
                              <button disabled={busy || me} onClick={() => toggle(u)} className={u.disabled ? ghostBtn : dangerBtn}>
                                {u.disabled ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}{u.disabled ? 'Enable' : 'Disable'}
                              </button>
                            </div>
                          </div>
                          {resetId === u.id && (
                            <div className="px-3.5 pb-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60 rounded-b-2xl">
                              <input value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="New password (8+ characters)" aria-label="New password" className={`${field} h-9 w-64 font-mono`} />
                              <button type="button" onClick={() => setResetPwd(makePassword())} className={ghostBtn}><Shuffle className="w-3.5 h-3.5" />Generate</button>
                              <button type="button" disabled={busy} onClick={() => doReset(u)} className="h-8 px-3.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50">Set password</button>
                              <button type="button" onClick={() => setResetId(null)} className="h-8 px-3 text-xs text-slate-500 hover:text-slate-800">Cancel</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}

            {tab === 'bin' && (
              <section>
                <div className="flex items-center justify-between mb-1 gap-3">
                  <h3 className="text-sm font-bold text-[#1b2a4e]">Bin <span className="font-medium text-slate-400 tabular-nums">({binCount})</span></h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={loadTheBin} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
                    <button type="button" disabled={busy || binCount === 0} onClick={() => setConfirmEmpty(true)} className={dangerBtn}><Trash2 className="w-3.5 h-3.5" />Empty bin</button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3.5">Anything staff delete lands here. It stays until you restore it or delete it forever.</p>
                {binCount === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-14 text-center">
                    <span className="mx-auto mb-2 grid place-items-center w-11 h-11 rounded-full bg-white text-slate-300 border border-slate-100"><Archive className="w-5 h-5" /></span>
                    <p className="text-sm font-semibold text-slate-600">The bin is empty</p>
                    <p className="text-xs text-slate-400 mt-0.5">Deleted connections and foremen will show up here.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {bin.logs.map(l => (
                      <li key={l.id} className="rounded-2xl border border-slate-100 bg-white p-3 flex flex-wrap items-center gap-3">
                        <span className="px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">Connection</span>
                        <div className="flex-1 basis-48 min-w-0">
                          <div className="text-[13px] font-semibold text-[#1b2a4e] truncate">#{l.logNo} · {l.customerName || 'Untitled'}</div>
                          <div className="text-xs text-slate-500 truncate">{[l.foremanName, l.nmsId, `deleted by ${l.deletedBy || 'unknown'}`, l.deletedAt ? formatStamp(l.deletedAt) : ''].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="flex gap-1.5 ml-auto">
                          <button disabled={busy} onClick={() => binAct(() => restoreBinLog(l.id), `Connection #${l.logNo} restored`)} className={ghostBtn}><RotateCcw className="w-3.5 h-3.5" />Restore</button>
                          <button disabled={busy} onClick={() => setPurge({ kind: 'log', id: l.id, label: `Log #${l.logNo}` })} className={dangerBtn}><Trash2 className="w-3.5 h-3.5" />Delete forever</button>
                        </div>
                      </li>
                    ))}
                    {bin.foremen.map(r => (
                      <li key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 flex flex-wrap items-center gap-3">
                        <span className="px-2 py-1 rounded-lg bg-violet-100 text-[11px] font-semibold text-violet-700">Foreman</span>
                        <div className="flex-1 basis-48 min-w-0">
                          <div className="text-[13px] font-semibold text-[#1b2a4e] truncate">{r.name}</div>
                          <div className="text-xs text-slate-500 truncate">{[r.area, r.phone, `deleted by ${r.deletedBy || 'unknown'}`, r.deletedAt ? formatStamp(r.deletedAt) : ''].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="flex gap-1.5 ml-auto">
                          <button disabled={busy} onClick={() => binAct(() => restoreBinForeman(r.id), `${r.name} restored`)} className={ghostBtn}><RotateCcw className="w-3.5 h-3.5" />Restore</button>
                          <button disabled={busy} onClick={() => setPurge({ kind: 'foreman', id: r.id, label: r.name })} className={dangerBtn}><Trash2 className="w-3.5 h-3.5" />Delete forever</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === 'security' && (
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                <form onSubmit={changeAdminPassword} className="rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_-18px_rgba(30,50,110,0.3)] p-5">
                  <h3 className="text-sm font-bold text-[#1b2a4e] flex items-center gap-2"><span className="grid place-items-center w-8 h-8 rounded-xl bg-brand-50 text-brand-700"><KeyRound className="w-4 h-4" /></span>Change admin password</h3>
                  <p className="text-xs text-slate-500 mt-2 mb-4">The initial administrator password is <b>admin</b>. Change it before using this in production.</p>
                  <div className="space-y-2.5">
                    <input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} type="password" minLength={8} required placeholder="New admin password" aria-label="New admin password" className={`${field} w-full`} />
                    <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" minLength={8} required placeholder="Repeat new password" aria-label="Repeat new password" className={`${field} w-full`} />
                    <button disabled={busy} className="w-full h-10 bg-brand-700 hover:bg-brand-800 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">Change password</button>
                  </div>
                </form>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
                  <h3 className="text-sm font-bold text-[#1b2a4e] flex items-center gap-2"><span className="grid place-items-center w-8 h-8 rounded-xl bg-amber-100 text-amber-700"><Upload className="w-4 h-4" /></span>One-time local migration</h3>
                  <p className="text-xs text-slate-600 mt-2 mb-4">Imports old connections from this browser into the shared database. Use it from the computer that holds the existing data.</p>
                  <button onClick={onImportLocal} className="w-full h-10 border border-amber-200 bg-white hover:bg-amber-50 text-amber-900 rounded-xl text-sm font-semibold transition-colors">Import this browser's old connections</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmEmpty}
        title="Empty the bin?"
        message="Everything in the bin is deleted forever. This cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => { setConfirmEmpty(false); binAct(() => emptyBin(), 'Bin emptied'); }}
      />
      <ConfirmDialog
        isOpen={!!purge}
        title={`Delete ${purge?.label || ''} forever?`}
        message="This cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setPurge(null)}
        onConfirm={() => {
          const p = purge; setPurge(null);
          if (p) binAct(() => (p.kind === 'log' ? purgeBinLog(p.id) : purgeBinForeman(p.id)), `${p.label} deleted forever`);
        }}
      />
    </div>
  );
};
