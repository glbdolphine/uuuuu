import { matchForeman } from '../utils/foremen';
import React, { useState, useMemo, useRef } from 'react';
import { Edit2, Trash2, Phone, MapPin, Search, UserPlus, Camera, ChevronRight, Users, FileText, CheckCircle2, Clock } from 'lucide-react';
import { Foreman, LogEntry, TeamMember } from '../types';
import { UPAZILAS, upazilaKey, upazilaBn } from '../utils/upazilas';
import { compressImage, initialsOf } from '../utils/image';
import { ImageLightbox, ClickableAvatar } from './ImageLightbox';
import { ForemanProfileModal } from './ForemanProfileModal';
import { usePersistedState, useScrollMemory } from '../utils/persist';

const selectCls = 'w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600';

const UpazilaSelect: React.FC<{ value: string; onChange: (v: string) => void; className?: string }> = ({ value, onChange, className }) => (
  <select value={upazilaKey(value)} onChange={(e) => onChange(e.target.value)} className={className || selectCls}>
    <option value="">Select upazila…</option>
    {UPAZILAS.map((u) => (
      <option key={u.key} value={u.key}>{u.key} · {u.bn}</option>
    ))}
  </select>
);

const INK = 'text-[#1b2a4e]';
const SURFACE = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-16px_rgba(30,50,110,0.22)]';
const NUM = 'tabular-nums';

type Tone = 'plain' | 'good' | 'warn';
const TONE: Record<Tone, { halo: string; icon: string; num: string }> = {
  plain: { halo: 'from-brand-50', icon: 'from-brand-400 to-brand-700 shadow-brand-600/30', num: 'text-brand-700' },
  good: { halo: 'from-emerald-50', icon: 'from-teal-400 to-emerald-600 shadow-emerald-600/30', num: 'text-emerald-600' },
  warn: { halo: 'from-amber-50', icon: 'from-amber-300 to-orange-500 shadow-orange-500/30', num: 'text-amber-600' },
};

const Kpi: React.FC<{ icon: React.ElementType; label: string; value: number | string; sub: string; tone?: Tone; bar?: number }> = ({
  icon: Icon, label, value, sub, tone = 'plain', bar,
}) => {
  const t = TONE[tone];
  return (
    <div className={`relative overflow-hidden ${SURFACE} p-5 flex flex-col min-h-[10.5rem]`}>
      <span className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${t.halo} to-transparent`} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${t.icon} text-white shadow-lg`}><Icon className="w-5 h-5" /></span>
        <span className={`text-[34px] leading-none font-extrabold font-display ${NUM} ${t.num}`}>{value}</span>
      </div>
      <div className={`relative mt-4 text-[15px] font-semibold ${INK}`}>{label}</div>
      <div className="relative mt-0.5 min-h-4 text-[11.5px] text-slate-400 truncate">{sub}</div>
      <div className="relative mt-auto pt-4">
        <div className={`h-1.5 rounded-full overflow-hidden ${bar === undefined ? 'bg-transparent' : 'bg-slate-100'}`}>
          {bar !== undefined && <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />}
        </div>
      </div>
    </div>
  );
};

interface ForemanDirectoryProps {
  foremen: Foreman[];
  logs: LogEntry[];
  teamMembers?: TeamMember[];
  onCreateMember?: (input: { foremanId: string; name: string; phone: string; role: string }) => Promise<void>;
  onUpdateMember?: (id: string, input: { name: string; phone: string; role: string; active: boolean }) => Promise<void>;
  onDeleteMember?: (id: string) => Promise<void>;
  onCreate: (input: { name: string; area: string; phone: string; photoUrl?: string }) => Promise<void>;
  onUpdate: (id: string, input: { name: string; area: string; phone: string; active: boolean; photoUrl?: string; roam?: boolean; roamAreas?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isAdmin?: boolean;
}

export const ForemanDirectory: React.FC<ForemanDirectoryProps> = ({
  foremen,
  logs,
  teamMembers = [],
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
  onCreate,
  onUpdate,
  onDelete,
  isAdmin = false,
}) => {
  const [searchTerm, setSearchTerm] = usePersistedState('foremen.search', '');
  const [upazilaFilter, setUpazilaFilter] = usePersistedState('foremen.upazila', '');
  const [sortBy, setSortBy] = usePersistedState<'upazila' | 'name' | 'logs'>('foremen.sort', 'upazila');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMode, setProfileMode] = useState<'view' | 'edit'>('view');
  const [photoView, setPhotoView] = useState<{ src: string; name: string } | null>(null);

  const newPhotoInputRef = useRef<HTMLInputElement>(null);
  const profile = profileId ? foremen.find((r) => r.id === profileId) || null : null;

  const openProfile = (r: Foreman, mode: 'view' | 'edit' = 'view') => {
    setProfileMode(mode);
    setProfileId(r.id);
  };

  // Supply numbers per foreman: allocated logs, routers handed out, resolved vs pending.
  const supply = useMemo(() => {
    const map = new Map<string, { total: number; routers: number; resolved: number }>();
    for (const log of logs) {
      const f = matchForeman({ foremanId: log.foremanId, foremanName: log.foremanName }, foremen);
      const key = f ? f.id : (log.foremanName || '').trim();
      if (!key) continue;
      const e = map.get(key) || { total: 0, routers: 0, resolved: 0 };
      e.total++;
      if (log.routerSerial || log.mac) e.routers++;
      if (/resolved|closed/i.test(log.status || '')) e.resolved++;
      map.set(key, e);
    }
    return map;
  }, [logs, foremen]);
  const supplyOf = (id: string) => supply.get(id) || { total: 0, routers: 0, resolved: 0 };

  const totals = useMemo(() => {
    let ids = 0, routers = 0, resolved = 0;
    for (const e of supply.values()) { ids += e.total; routers += e.routers; resolved += e.resolved; }
    return { ids, routers, resolved, pending: ids - resolved };
  }, [supply]);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const list = foremen.filter((r) => {
      if (upazilaFilter && upazilaKey(r.area) !== upazilaFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        upazilaBn(upazilaKey(r.area)).includes(q) ||
        r.phone.toLowerCase().includes(q)
      );
    });
    const upaOrder = (r: Foreman) => {
      const i = UPAZILAS.findIndex((u) => u.key === upazilaKey(r.area));
      return i === -1 ? 99 : i;
    };
    return [...list].sort((a, b) => {
      if (sortBy === 'logs') return supplyOf(b.id).total - supplyOf(a.id).total || a.name.localeCompare(b.name);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return upaOrder(a) - upaOrder(b) || a.name.localeCompare(b.name);
    });
  }, [foremen, searchTerm, upazilaFilter, sortBy, supply]);

  const countByUpazila = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of foremen) {
      const k = upazilaKey(r.area);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [foremen]);

  const handleStartCreate = () => {
    setNewName('');
    setNewArea('');
    setNewPhone('');
    setNewPhotoUrl('');
    setIsCreating(true);
  };

  const handleSaveCreate = async () => {
    if (!newName.trim() || !newArea) return;
    try {
      await onCreate({
        name: newName.trim(),
        area: newArea,
        phone: newPhone.trim(),
        photoUrl: newPhotoUrl.trim() || undefined,
      });
      setIsCreating(false);
    } catch (e: any) {
      alert(e?.message || 'Could not add foreman.');
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 sm:gap-5 pb-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-600/25"><Users className="w-5 h-5" /></span>
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${INK}`}>Foremen</h1>
            <p className="text-[13px] text-slate-500">Partner contacts, coverage areas and the IDs, routers and progress allocated to each.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search foremen..."
              className={`h-10 pl-9 pr-3 w-48 sm:w-64 text-xs ${INK} bg-white border border-slate-200 rounded-xl hover:border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-slate-400`}
            />
          </div>
          <button
            type="button" onClick={handleStartCreate}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 text-xs font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 rounded-xl shadow-md shadow-brand-600/30 hover:-translate-y-px active:translate-y-0 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Foreman
          </button>
        </div>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <Kpi icon={Users} label="Foremen" value={foremen.length} sub={`${foremen.filter((r) => r.active).length} active`} />
        <Kpi icon={FileText} label="Allocated IDs" value={totals.ids} sub={`${totals.routers} with a router`} bar={pct(totals.routers, totals.ids)} />
        <Kpi icon={CheckCircle2} label="Resolved" value={totals.resolved} sub={`${pct(totals.resolved, totals.ids)}% of allocated IDs`} tone="good" bar={pct(totals.resolved, totals.ids)} />
        <Kpi icon={Clock} label="Pending" value={totals.pending} sub="still waiting" tone={totals.pending ? 'warn' : 'good'} bar={pct(totals.pending, totals.ids)} />
      </div>

      {/* Upazila filter chips + sort */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {[{ key: '', label: `All (${foremen.length})` }, ...UPAZILAS.filter((u) => countByUpazila.get(u.key)).map((u) => ({ key: u.key, label: `${u.key} (${countByUpazila.get(u.key)})` }))].map((c) => {
            const on = upazilaFilter === c.key;
            return (
              <button
                key={c.key || 'all'} type="button" onClick={() => setUpazilaFilter(c.key && on ? '' : c.key)} aria-pressed={on}
                className={`h-8 px-3 text-[11.5px] rounded-full border transition-colors ${on ? 'bg-brand-900 text-white border-brand-900 font-semibold shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-medium'}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <select
          value={sortBy} onChange={(e) => setSortBy(e.target.value as 'upazila' | 'name' | 'logs')} aria-label="Sort foremen"
          className={`h-9 text-xs font-medium ${INK} bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 cursor-pointer`}
        >
          <option value="upazila">Sort: Upazila</option>
          <option value="name">Sort: Name</option>
          <option value="logs">Sort: Most connections</option>
        </select>
      </div>

      {/* Creation Modal/Card */}
      {isCreating && (
        <div className={`${SURFACE} p-5 space-y-3`}>
          <div className="text-xs font-bold text-brand-900">Add New Partner Foreman</div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pb-1 border-b border-brand-100">
            <div className="relative group shrink-0">
              {newPhotoUrl ? (
                <img
                  src={newPhotoUrl}
                  alt="Foreman preview"
                  onClick={() => setPhotoView({ src: newPhotoUrl, name: newName || 'New foreman' })}
                  className="w-14 h-14 rounded-2xl object-cover border border-brand-300 shadow-xs bg-white cursor-zoom-in"
                  title="Click to view photo"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-white border border-dashed border-brand-300 text-brand-600 flex flex-col items-center justify-center text-[10px] font-medium">
                  <Camera className="w-5 h-5 text-brand-400 mb-0.5" />
                  <span>Photo</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={newPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) compressImage(f, 900).then(setNewPhotoUrl).catch((err) => alert(err?.message || 'Could not use this photo.'));
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => newPhotoInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-medium text-brand-800 bg-white hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{newPhotoUrl ? 'Change Photo' : 'Upload Profile Picture'}</span>
              </button>
              {newPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setNewPhotoUrl('')}
                  className="px-2.5 py-1 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Shabul"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Upazila <span className="text-rose-500">*</span>
              </label>
              <UpazilaSelect value={newArea} onChange={setNewArea} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Official Phone</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. +880 1711-234567"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCreate}
              disabled={!newName.trim() || !newArea}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-lg disabled:opacity-50"
            >
              Save Foreman
            </button>
          </div>
        </div>
      )}

      {/* Foreman Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
        {filtered.map((r) => {
          const sp = supplyOf(r.id);
          const pending = sp.total - sp.resolved;
          const done = pct(sp.resolved, sp.total);
          const up = upazilaKey(r.area);

          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => openProfile(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openProfile(r);
                }
              }}
              className={`group relative overflow-hidden ${SURFACE} p-5 flex flex-col cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(30,50,110,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
              title="Open profile"
            >
              <span className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-50 to-transparent" aria-hidden />

              <div className="relative flex items-center gap-3">
                <ClickableAvatar
                  photoUrl={r.photoUrl}
                  name={r.name}
                  initials={initialsOf(r.name, '?').charAt(0)}
                  onOpen={() => r.photoUrl && setPhotoView({ src: r.photoUrl, name: r.name })}
                  className="w-12 h-12 rounded-2xl"
                  textClass="text-base"
                />
                <div className="min-w-0 flex-1">
                  <h3 className={`text-[15px] font-bold truncate ${INK}`}>{r.name}</h3>
                  <span className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-slate-400 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.active ? 'bg-emerald-500' : 'bg-slate-300'}`} title={r.active ? 'Active' : 'Inactive'} />
                    <span className="truncate">{up || r.area || 'Partner Foreman'}{!r.active && ' · Inactive'}</span>
                    {r.roam && <span className="shrink-0 px-1.5 py-px rounded-full bg-teal-50 text-teal-700 text-[10px] font-semibold" title="Own broadband: can supply other upazilas">Own broadband</span>}
                  </span>
                </div>
                <span className={`shrink-0 text-[34px] leading-none font-extrabold font-display ${NUM} text-brand-700`} title="Allocated IDs">{sp.total}</span>
              </div>

              <div className="relative mt-3 space-y-1 text-xs text-slate-500 min-h-[2.75rem]">
                {r.area && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{up ? `${up} · ${upazilaBn(up)}` : r.area}</span>
                  </div>
                )}
                {r.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-700 font-mono">
                      {r.phone}
                    </a>
                  </div>
                )}
              </div>

              <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-50 py-2.5">
                  <div className="text-[10.5px] font-medium text-slate-400">Routers</div>
                  <div className={`text-sm font-bold ${NUM} ${INK}`}>{sp.routers}</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 py-2.5">
                  <div className="text-[10.5px] font-medium text-emerald-600">Resolved</div>
                  <div className={`text-sm font-bold ${NUM} text-emerald-700`}>{sp.resolved}</div>
                </div>
                <div className="rounded-2xl bg-amber-50 py-2.5">
                  <div className="text-[10.5px] font-medium text-amber-600">Pending</div>
                  <div className={`text-sm font-bold ${NUM} text-amber-700`}>{pending}</div>
                </div>
              </div>

              <div className="relative mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${done}%` }} />
                </div>
                <span className={`text-[11px] font-semibold text-slate-500 ${NUM}`}>{done}% done</span>
              </div>

              <div className="relative mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {sp.total} {sp.total === 1 ? 'connection' : 'connections'}
                  {(() => { const n = teamMembers.filter((m) => m.foremanId === r.id).length; return n > 0 ? ` · ${n} team ${n === 1 ? 'member' : 'members'}` : ''; })()}
                </span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openProfile(r, 'edit')}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg"
                    title="Edit foreman"
                    aria-label={`Edit ${r.name}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="Move to admin bin"
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-600 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className={`${SURFACE} px-4 py-12 text-xs text-slate-400 text-center`}>No foremen found.</p>
      )}

      {profile && (
        <ForemanProfileModal
          key={`${profile.id}-${profileMode}`}
          foreman={profile}
          logs={logs}
          teamMembers={teamMembers}
          onCreateMember={onCreateMember}
          onUpdateMember={onUpdateMember}
          onDeleteMember={onDeleteMember}
          initialMode={profileMode}
          onClose={() => setProfileId(null)}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isAdmin={isAdmin}
        />
      )}
      {photoView && <ImageLightbox src={photoView.src} alt={photoView.name} caption={photoView.name} onClose={() => setPhotoView(null)} />}
    </div>
  );
};
