import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Camera,
  ShieldCheck,
  UserCheck,
  KeyRound,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pencil,
  ArrowLeft,
  AtSign,
  CalendarDays,
  Maximize2,
} from 'lucide-react';
import { AppUser } from '../types';
import { updateUserProfile } from '../utils/auth';
import { compressImage, initialsOf } from '../utils/image';
import { ImageLightbox } from './ImageLightbox';
import { ScrollLock } from './ScrollLock';

interface ProfileModalProps {
  isOpen: boolean;
  user: AppUser;
  onClose: () => void;
  onUpdateUser: (updatedUser: AppUser) => void;
  onLogout: () => void;
  onChangePassword?: () => void;
}

const inputCls =
  'w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100';

const formatJoined = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  user,
  onClose,
  onUpdateUser,
  onLogout,
  onChangePassword,
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [email, setEmail] = useState(user.email || '');
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Always open on the read-only profile; editing is one click away.
  useEffect(() => {
    if (isOpen) {
      setMode('view');
      setError(null);
      setSuccess(false);
      setLightbox(false);
    }
  }, [isOpen]);

  // Keep the form in step with the saved profile whenever we are not editing.
  useEffect(() => {
    if (mode === 'view') {
      setDisplayName(user.displayName || '');
      setPhoneNumber(user.phoneNumber || '');
      setEmail(user.email || '');
      setPhotoUrl(user.photoUrl || '');
    }
  }, [mode, user]);

  if (!isOpen) return null;

  const isAdmin = user.role === 'admin';
  const initials = initialsOf(user.displayName || user.username);
  const joined = formatJoined(user.createdAt);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Photo size should be less than 12MB.');
      return;
    }
    try {
      setPhotoUrl(await compressImage(file, 900));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not use this photo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile({
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        photoUrl: photoUrl.trim(),
      });
      onUpdateUser(updated);
      setSuccess(true);
      setMode('view');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setError(null);
    setSuccess(false);
    setMode('edit');
  };

  const cancelEdit = () => {
    setError(null);
    setMode('view');
  };

  const roleBadge = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-xs font-semibold text-white ring-1 ring-white/20">
      {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
      {isAdmin ? 'Administrator' : 'Operator'}
    </span>
  );
  const avatarCls = 'w-28 h-28 rounded-3xl ring-4 ring-white/25 shadow-xl';

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 sm:p-6"
      >
      <ScrollLock />
        <div
          role="dialog" aria-modal="true" aria-label="Profile"
          className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto md:flex md:max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Identity panel */}
          <aside className="relative md:w-72 shrink-0 bg-gradient-to-b from-brand-700 via-brand-800 to-brand-900 text-white px-6 py-8 flex flex-col items-center text-center">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 15% 10%, #fff 0, transparent 40%), radial-gradient(circle at 90% 95%, #fff 0, transparent 35%)' }}
            />
            {mode === 'edit' && (
              <button type="button" onClick={cancelEdit}
                className="absolute top-4 left-4 inline-flex items-center gap-1 pl-2 pr-3 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <button type="button" onClick={onClose} title="Close" aria-label="Close"
              className="md:hidden absolute top-4 right-4 p-1.5 text-white/85 hover:text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className={`relative shrink-0 ${mode === 'edit' ? 'mt-6 md:mt-8' : ''}`}>
              {mode === 'edit' ? (
                photoUrl ? (
                  <img src={photoUrl} alt={displayName} className={`${avatarCls} object-cover bg-slate-100`} />
                ) : (
                  <div className={`${avatarCls} bg-white/15 text-white flex items-center justify-center font-display font-bold text-4xl`}>
                    {initialsOf(displayName || user.username)}
                  </div>
                )
              ) : user.photoUrl ? (
                <button type="button" onClick={() => setLightbox(true)} title="View photo" aria-label="View profile photo"
                  className={`group relative block ${avatarCls} overflow-hidden bg-slate-100 cursor-zoom-in focus:outline-none focus-visible:ring-white`}>
                  <img src={user.photoUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 flex items-center justify-center transition-colors">
                    <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
              ) : (
                <div className={`${avatarCls} bg-white/15 text-white flex items-center justify-center font-display font-bold text-4xl`}>{initials}</div>
              )}
              {mode === 'edit' && (
                <button type="button" onClick={() => fileInputRef.current?.click()} title="Change photo" aria-label="Change photo"
                  className="absolute -bottom-2 -right-2 p-2.5 bg-white text-brand-800 rounded-full shadow-lg hover:bg-brand-50 transition-colors">
                  <Camera className="w-4 h-4" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
            </div>

            <div className="relative mt-5 min-w-0 max-w-full">
              <h2 className="text-xl font-bold tracking-tight break-words">{mode === 'edit' ? (displayName || user.username) : (user.displayName || user.username)}</h2>
              <p className="mt-0.5 text-sm text-white/70 font-mono">@{user.username}</p>
              <div className="mt-3">{roleBadge}</div>
            </div>

            <div className="relative mt-6 md:mt-auto pt-6 w-full">
              {mode === 'view' ? (
                <button type="button" onClick={startEdit}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 text-sm font-semibold text-brand-900 bg-white hover:bg-brand-50 rounded-xl shadow-sm transition-colors">
                  <Pencil className="w-4 h-4" />Edit profile
                </button>
              ) : photoUrl ? (
                <button type="button" onClick={() => setPhotoUrl('')}
                  className="w-full h-10 text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                  Remove photo
                </button>
              ) : null}
            </div>
          </aside>

          {/* Details panel */}
          <div className="relative flex-1 min-w-0 md:overflow-y-auto">
            <button type="button" onClick={onClose} title="Close" aria-label="Close"
              className="hidden md:grid absolute top-4 right-4 z-10 place-items-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 sm:p-8">
              {success && mode === 'view' && (
                <div className="mb-5 flex items-center gap-2 p-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Profile updated and saved.</span>
                </div>
              )}

              {mode === 'view' ? (
                <>
                  <h3 className="text-base font-bold text-[#1b2a4e]">Contact</h3>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={user.phoneNumber} href={user.phoneNumber ? `tel:${user.phoneNumber}` : undefined} />
                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} href={user.email ? `mailto:${user.email}` : undefined} />
                  </dl>

                  <h3 className="mt-7 text-base font-bold text-[#1b2a4e]">Account</h3>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={<AtSign className="w-4 h-4" />} label="Username" value={user.username} mono />
                    <InfoRow icon={isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />} label="Role" value={isAdmin ? 'Administrator' : 'Operator'} />
                    {joined && <InfoRow icon={<CalendarDays className="w-4 h-4" />} label="Member since" value={joined} />}
                  </dl>

                  <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    {onChangePassword && (
                      <button type="button" onClick={() => { onClose(); onChangePassword(); }}
                        className="inline-flex items-center gap-2 h-10 px-4 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors">
                        <KeyRound className="w-4 h-4" />Change password
                      </button>
                    )}
                    <button type="button" onClick={() => { onClose(); onLogout(); }}
                      className="ml-auto inline-flex items-center gap-2 h-10 px-4 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-colors">
                      <LogOut className="w-4 h-4" />Log out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-[#1b2a4e]">Edit profile</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Changes are saved as soon as you press Save.</p>

                  {error && (
                    <div role="alert" className="mt-4 flex items-center gap-2 p-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <Field label="Display name" required>
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. John Doe / Support Admin" className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Phone number">
                        <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. +880 1711-234567" className={inputCls} />
                      </Field>
                      <Field label="Email address">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. operator@paceit.com" className={inputCls} />
                      </Field>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button type="button" onClick={cancelEdit}
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

      {lightbox && user.photoUrl && (
        <ImageLightbox src={user.photoUrl} alt={user.displayName || user.username} caption={user.displayName || user.username} onClose={() => setLightbox(false)} />
      )}
    </>
  );
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    <div className="relative">{children}</div>
  </div>
);

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string; href?: string; mono?: boolean }> = ({ icon, label, value, href, mono }) => (
  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100 shadow-[0_8px_24px_-18px_rgba(30,50,110,0.3)]">
    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">{icon}</div>
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold break-words ${mono ? 'font-mono' : ''}`}>
        {value ? (
          href ? <a href={href} className="text-[#1b2a4e] hover:text-brand-700 hover:underline">{value}</a>
               : <span className="text-[#1b2a4e]">{value}</span>
        ) : (
          <span className="text-slate-400 italic text-xs font-normal">Not added yet</span>
        )}
      </dd>
    </div>
  </div>
);
