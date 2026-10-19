import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Phone,
  MapPin,
  Camera,
  Pencil,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Trash2,
  Maximize2,
  FileText,
  CalendarDays,
  User,
  Plus,
  Check,
} from 'lucide-react';
import { LogEntry, Foreman, TeamMember } from '../types';
import { UPAZILAS, upazilaKey, upazilaBn } from '../utils/upazilas';
import { compressImage, initialsOf } from '../utils/image';
import { ImageLightbox } from './ImageLightbox';
import { ScrollLock } from './ScrollLock';

interface ForemanProfileModalProps {
  foreman: Foreman;
  logs: LogEntry[];
  teamMembers?: TeamMember[];
  onCreateMember?: (input: { foremanId: string; name: string; phone: string; role: string }) => Promise<void>;
  onUpdateMember?: (id: string, input: { name: string; phone: string; role: string; active: boolean }) => Promise<void>;
  onDeleteMember?: (id: string) => Promise<void>;
  initialMode?: 'view' | 'edit';
  onClose: () => void;
  onUpdate: (id: string, input: { name: string; area: string; phone: string; active: boolean; photoUrl?: string; roam?: boolean; roamAreas?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void> | void;
  isAdmin?: boolean;
}

const inputCls =
  'w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100';

export const ForemanProfileModal: React.FC<ForemanProfileModalProps> = ({
  foreman,
  logs,
  teamMembers = [],
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
  initialMode = 'view',
  onClose,
  onUpdate,
  onDelete,
  isAdmin = false,
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [name, setName] = useState(foreman.name);
  const [area, setArea] = useState(upazilaKey(foreman.area) || foreman.area || '');
  const [phone, setPhone] = useState(foreman.phone || '');
  const [active, setActive] = useState(foreman.active);
  const [roam, setRoam] = useState(Boolean(foreman.roam));
  const [roamAreas, setRoamAreas] = useState<string[]>(foreman.roamAreas || []);
  const [photoUrl, setPhotoUrl] = useState(foreman.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Show the saved values again whenever we are not editing (e.g. after saving or cancelling).
  useEffect(() => {
    if (mode === 'view') {
      setName(foreman.name);
      setArea(upazilaKey(foreman.area) || foreman.area || '');
      setPhone(foreman.phone || '');
      setActive(foreman.active);
      setRoam(Boolean(foreman.roam));
      setRoamAreas(foreman.roamAreas || []);
      setPhotoUrl(foreman.photoUrl || '');
    }
  }, [mode, foreman]);

  const myLogs = logs.filter((l) => (l.foremanId ? l.foremanId === foreman.id : l.foremanName === foreman.name));
  // Connections by upazila (the log's own upazila; falls back to the home upazila).
  const byUpazila = (() => {
    const m = new Map<string, number>();
    for (const l of myLogs) {
      const k = upazilaKey(l.upazila) || upazilaKey(foreman.area) || 'Unknown';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const recent = [...myLogs]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 5);
  const upKey = upazilaKey(foreman.area);
  const added = foreman.createdAt ? new Date(foreman.createdAt) : null;
  const addedText = added && !isNaN(added.getTime()) ? added.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setPhotoUrl(await compressImage(f, 900));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not use this photo.');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !area) {
      setError('Name and upazila are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(foreman.id, { name: name.trim(), area, phone: phone.trim(), active, photoUrl: photoUrl.trim(), ...(isAdmin ? { roam, roamAreas: roam ? roamAreas : [] } : {}) });
      setMode('view');
    } catch (err: any) {
      setError(err?.message || 'Could not update foreman.');
    } finally {
      setSaving(false);
    }
  };

  const avatarCls = 'w-28 h-28 rounded-3xl ring-4 ring-white/25 shadow-xl';

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 sm:p-6"
      >
      <ScrollLock />
        <div
          role="dialog" aria-modal="true" aria-label="Foreman profile"
          className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto md:flex md:h-[min(34rem,90vh)] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Identity panel */}
          <aside className="relative md:w-72 shrink-0 bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 text-white px-6 py-8 flex flex-col items-center text-center">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 15% 10%, #fff 0, transparent 40%), radial-gradient(circle at 90% 95%, #fff 0, transparent 35%)' }}
            />
            {mode === 'edit' && (
              <button type="button" onClick={() => { setError(null); setMode('view'); }}
                className="absolute top-4 left-4 inline-flex items-center gap-1 pl-2 pr-3 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" title="Close"
              className="md:hidden absolute top-4 right-4 p-1.5 text-white/85 hover:text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className={`relative shrink-0 ${mode === 'edit' ? 'mt-6 md:mt-8' : ''}`}>
              {mode === 'edit' ? (
                photoUrl ? (
                  <img src={photoUrl} alt={name} className={`${avatarCls} object-cover bg-slate-100`} />
                ) : (
                  <div className={`${avatarCls} bg-white/15 text-white flex items-center justify-center font-display font-bold text-4xl`}>{initialsOf(name, '?')}</div>
                )
              ) : foreman.photoUrl ? (
                <button type="button" onClick={() => setLightbox(true)} title="View photo" aria-label="View foreman photo"
                  className={`group relative block ${avatarCls} overflow-hidden bg-slate-100 cursor-zoom-in focus:outline-none`}>
                  <img src={foreman.photoUrl} alt={foreman.name} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 flex items-center justify-center transition-colors">
                    <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
              ) : (
                <div className={`${avatarCls} bg-white/15 text-white flex items-center justify-center font-display font-bold text-4xl`}>{initialsOf(foreman.name, '?')}</div>
              )}
              {mode === 'edit' && (
                <button type="button" onClick={() => fileRef.current?.click()} title="Change photo" aria-label="Change photo"
                  className="absolute -bottom-2 -right-2 p-2.5 bg-white text-brand-800 rounded-full shadow-lg hover:bg-brand-50 transition-colors">
                  <Camera className="w-4 h-4" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
            </div>

            <div className="relative mt-5 min-w-0 max-w-full">
              <h2 className="text-xl font-bold tracking-tight break-words">{mode === 'edit' ? (name || foreman.name) : foreman.name}</h2>
              <p className="mt-0.5 text-sm text-white/70">Partner foreman</p>
              <span className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${(mode === 'edit' ? active : foreman.active) ? 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/30' : 'bg-white/10 text-white/70 ring-white/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${(mode === 'edit' ? active : foreman.active) ? 'bg-emerald-300' : 'bg-white/50'}`} />
                {(mode === 'edit' ? active : foreman.active) ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="relative mt-6 md:mt-auto pt-6 w-full space-y-2">
              {mode === 'view' ? (
                <button type="button" onClick={() => setMode('edit')}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 text-sm font-semibold text-brand-900 bg-white hover:bg-brand-50 rounded-xl shadow-sm transition-colors">
                  <Pencil className="w-4 h-4" />Edit foreman
                </button>
              ) : photoUrl ? (
                <button type="button" onClick={() => setPhotoUrl('')}
                  className="w-full h-10 text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors">Remove photo</button>
              ) : null}
            </div>
          </aside>

          {/* Details panel */}
          <div className="relative flex-1 min-w-0 md:overflow-y-auto">
            <button type="button" onClick={onClose} aria-label="Close" title="Close"
              className="hidden md:grid absolute top-4 right-4 z-10 place-items-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 sm:p-8">
              {mode === 'view' ? (
                <>
                  <h3 className="text-base font-bold text-[#1b2a4e]">Details</h3>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Row icon={<Phone className="w-4 h-4" />} label="Phone">
                      {foreman.phone ? (
                        <a href={`tel:${foreman.phone}`} className="text-[#1b2a4e] hover:text-brand-700 hover:underline font-mono">{foreman.phone}</a>
                      ) : (
                        <span className="text-slate-400 italic text-xs font-normal">Not added yet</span>
                      )}
                    </Row>
                    <Row icon={<MapPin className="w-4 h-4" />} label="Upazila">
                      <span className="text-[#1b2a4e]">{upKey || foreman.area || '—'}</span>
                      {upKey && <span className="block text-xs font-normal text-slate-500">{upazilaBn(upKey)}</span>}
                    </Row>
                    <Row icon={<FileText className="w-4 h-4" />} label="Total connections">
                      <span className="text-[#1b2a4e] tabular-nums">{myLogs.length}</span>
                      {foreman.roam && byUpazila.length > 0 && (
                        <span className="block text-xs font-normal text-slate-500">{byUpazila.map(([k, n]) => `${k} ${n}`).join(' · ')}</span>
                      )}
                    </Row>
                    {foreman.roam && (
                      <Row icon={<MapPin className="w-4 h-4" />} label="Own broadband">
                        <span className="text-teal-700">Can supply other upazilas</span>
                        <span className="block text-xs font-normal text-slate-500">{(foreman.roamAreas || []).length ? (foreman.roamAreas || []).join(', ') : 'Any upazila'}</span>
                      </Row>
                    )}
                    <Row icon={<CalendarDays className="w-4 h-4" />} label="Added">
                      {addedText ? <span className="text-[#1b2a4e]">{addedText}</span> : <span className="text-slate-400 italic text-xs font-normal">Unknown</span>}
                    </Row>
                  </dl>

                  {onCreateMember && onUpdateMember && onDeleteMember && (
                    <TeamManager
                      foreman={foreman}
                      members={teamMembers.filter((m) => m.foremanId === foreman.id)}
                      onCreate={onCreateMember}
                      onUpdate={onUpdateMember}
                      onDelete={onDeleteMember}
                    />
                  )}

                  <div className="mt-7 flex items-baseline justify-between">
                    <h3 className="text-base font-bold text-[#1b2a4e]">Recent connections</h3>
                    {myLogs.length > recent.length && <span className="text-xs text-slate-400">Latest {recent.length} of {myLogs.length}</span>}
                  </div>
                  {recent.length > 0 ? (
                    <ul className="mt-3 rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden bg-white">
                      {recent.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                          <span className="grid place-items-center h-8 min-w-8 px-2 rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700 tabular-nums shrink-0">#{l.logNo}</span>
                          <span className="truncate text-[#1b2a4e] font-medium">{l.customerName || '—'}</span>
                          <span className="ml-auto text-xs text-slate-400 shrink-0 tabular-nums">{l.date}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-8 text-xs text-slate-400 text-center">No connections for this foreman yet.</p>
                  )}

                  <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-end">
                    <button type="button" title="Move to admin bin"
                      onClick={async () => { await onDelete(foreman.id); onClose(); }}
                      className="inline-flex items-center gap-2 h-10 px-4 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-colors">
                      <Trash2 className="w-4 h-4" />Delete foreman
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-[#1b2a4e]">Edit foreman</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Changes are saved as soon as you press Save.</p>

                  {error && (
                    <div role="alert" className="mt-4 flex items-center gap-2 p-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={save} className="mt-5 space-y-4">
                    <Label text="Name" required>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} pl-9`} placeholder="Foreman name" required />
                      </div>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Label text="Upazila" required>
                        <select value={upazilaKey(area)} onChange={(e) => setArea(e.target.value)} className={inputCls} required>
                          <option value="">Select upazila…</option>
                          {UPAZILAS.map((u) => (<option key={u.key} value={u.key}>{u.key} · {u.bn}</option>))}
                        </select>
                      </Label>
                      <Label text="Phone">
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} pl-9`} placeholder="e.g. +880 1711-234567" />
                        </div>
                      </Label>
                    </div>
                    <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded text-brand-600 w-4 h-4" />
                      <span><span className="font-semibold text-[#1b2a4e]">Active foreman</span><span className="block text-xs text-slate-500">Inactive foremen stay on record but are marked as not working with us.</span></span>
                    </label>

                    {isAdmin && (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-3">
                        <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={roam} onChange={(e) => setRoam(e.target.checked)} className="rounded text-brand-600 w-4 h-4" />
                          <span><span className="font-semibold text-[#1b2a4e]">Own broadband – can supply outside home upazila</span><span className="block text-xs text-slate-500">Only an admin can change this. Off means the foreman supplies his home upazila only.</span></span>
                        </label>
                        {roam && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Allowed upazilas <span className="font-normal">(leave all unticked = any upazila)</span></p>
                            <div className="flex flex-wrap gap-1.5">
                              {UPAZILAS.filter((u) => u.key !== upazilaKey(area)).map((u) => {
                                const on = roamAreas.includes(u.key);
                                return (
                                  <button key={u.key} type="button"
                                    onClick={() => setRoamAreas((p) => (on ? p.filter((x) => x !== u.key) : [...p, u.key]))}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'}`}>
                                    {u.key}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { setError(null); setMode('view'); }}
                        className="h-10 px-5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
                      <button type="submit" disabled={saving}
                        className="inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition-colors disabled:opacity-50">
                        {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>Saving…</span></>) : (<><Save className="w-4 h-4" /><span>Save changes</span></>)}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightbox && foreman.photoUrl && (
        <ImageLightbox src={foreman.photoUrl} alt={foreman.name} caption={foreman.name} onClose={() => setLightbox(false)} />
      )}
    </>
  );
};

const TeamManager: React.FC<{
  foreman: Foreman;
  members: TeamMember[];
  onCreate: (input: { foremanId: string; name: string; phone: string; role: string }) => Promise<void>;
  onUpdate: (id: string, input: { name: string; phone: string; role: string; active: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ foreman, members, onCreate, onUpdate, onDelete }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Team member name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await onCreate({ foremanId: foreman.id, name: name.trim(), phone: phone.trim(), role: role.trim() });
      setName(''); setPhone(''); setRole(''); setAdding(false);
    } catch (e2: any) {
      setErr(e2?.message || 'Could not add team member.');
    } finally { setBusy(false); }
  };

  const saveEdit = async (m: TeamMember) => {
    if (!editName.trim()) { setErr('Team member name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await onUpdate(m.id, { name: editName.trim(), phone: editPhone.trim(), role: editRole.trim(), active: m.active });
      setEditId(null);
    } catch (e2: any) {
      setErr(e2?.message || 'Could not update team member.');
    } finally { setBusy(false); }
  };

  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Remove "${m.name}" from ${foreman.name}'s team?`)) return;
    await onDelete(m.id);
  };

  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-[#1b2a4e]">
          Team under {foreman.name}
          <span className="ml-2 text-xs font-semibold text-slate-400 tabular-nums">{members.length}</span>
        </h3>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setErr(null); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
            <Plus className="w-3.5 h-3.5" />Add team member
          </button>
        )}
      </div>

      {err && <p role="alert" className="mt-2 text-xs text-rose-600">{err}</p>}

      {adding && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Member name" className={inputCls} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" className={inputCls} />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className={inputCls} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="h-10 px-4 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl disabled:opacity-50">Add</button>
            <button type="button" onClick={() => { setAdding(false); setErr(null); }} className="h-10 px-3 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </form>
      )}

      {members.length > 0 ? (
        <ul className="mt-3 rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden bg-white">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              {editId === m.id ? (
                <>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputCls} !py-1.5`} placeholder="Member name" />
                  <input value={editRole} onChange={(e) => setEditRole(e.target.value)} className={`${inputCls} !py-1.5`} placeholder="Role" />
                  <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={`${inputCls} !py-1.5`} placeholder="Phone" />
                  <button type="button" disabled={busy} onClick={() => saveEdit(m)} title="Save" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check className="w-4 h-4" /></button>
                  <button type="button" onClick={() => { setEditId(null); setErr(null); }} title="Cancel" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="truncate text-[#1b2a4e] font-medium">{m.name}</span>
                  {m.role && <span className="text-xs text-slate-500 truncate">{m.role}</span>}
                  {m.phone && <span className="ml-auto text-xs text-slate-400 font-mono truncate">{m.phone}</span>}
                  <span className={m.phone ? '' : 'ml-auto'} />
                  <button type="button" onClick={() => { setEditId(m.id); setEditName(m.name); setEditRole(m.role || ''); setEditPhone(m.phone || ''); setErr(null); }} title="Edit team member" className="p-1.5 text-slate-400 hover:text-brand-700 hover:bg-slate-100 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => remove(m)} title="Remove team member" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !adding && <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-xs text-slate-400 text-center">No team members under this foreman yet.</p>
      )}
    </div>
  );
};

const Label: React.FC<{ text: string; required?: boolean; children: React.ReactNode }> = ({ text, required, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {text} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

const Row: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-[0_8px_24px_-18px_rgba(30,50,110,0.3)]">
    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">{icon}</div>
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-words">{children}</dd>
    </div>
  </div>
);
