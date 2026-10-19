import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { ScrollLock } from './ScrollLock';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

export const AdminPasswordDialog: React.FC<Props> = ({ title, message, confirmLabel, destructive = true, onConfirm, onCancel }) => {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(err?.message || 'Could not confirm. Try again.');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <ScrollLock />
      <form onSubmit={submit} role="alertdialog" aria-modal="true" aria-label={title}
        className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <span className={`grid place-items-center w-10 h-10 rounded-2xl text-white shadow-lg shrink-0 bg-gradient-to-br ${destructive ? 'from-orange-400 to-rose-600 shadow-rose-600/30' : 'from-brand-400 to-brand-700 shadow-brand-600/30'}`}>
            <Lock className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#1b2a4e]">{title}</h3>
            <p className="text-[13px] text-slate-500 mt-1">{message}</p>
          </div>
        </div>

        <label className="block text-[11.5px] font-semibold text-slate-500">Your admin password
          <span className="relative block mt-1.5">
            <input
              ref={inputRef} type={show ? 'text' : 'password'} value={password} autoComplete="current-password"
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full h-10 pl-3 pr-10 text-[13px] text-[#1b2a4e] bg-slate-50 border border-slate-200 rounded-xl hover:bg-white focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 bg-rose-50 text-rose-700 rounded-2xl text-xs font-medium" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /><span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={busy}
            className="h-10 px-5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!password || busy}
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-5 text-xs font-semibold text-white rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${destructive
              ? 'bg-gradient-to-br from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 shadow-rose-600/30'
              : 'bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 shadow-brand-600/30'}`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
