import { DevelopedBy } from './DevelopedBy';
import React, { useState } from 'react';
import { Eye, EyeOff, Shield, X } from 'lucide-react';
import { login, getLastUser } from '../utils/auth';
import { AppUser } from '../types';
import logo from '../logo/logo-mark.png';
import { LoginStage } from './LoginStage';
import { BRAND_SLOGAN } from '../brand';

interface LoginScreenProps {
  onUnlock: (user: AppUser) => void;
  onAdminUnlock?: (user: AppUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onUnlock, onAdminUnlock }) => {
  const [username, setUsername] = useState(getLastUser());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const name = username.trim();
    if (name.length < 2) {
      setError('Enter your username.');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const user = await login(name, password);
      if (user.role === 'admin' && onAdminUnlock) {
        onAdminUnlock(user);
      } else {
        onUnlock(user);
      }
    } catch (err) {
      await new Promise((r) => setTimeout(r, 300));
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setShake((n) => n + 1);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const [slogan1, slogan2] = BRAND_SLOGAN.split(/(?<=\.)\s+/);

  const inputCls =
    'login-input block w-full h-11 px-3 text-sm text-white bg-white/10 border border-white/20 rounded-lg backdrop-blur-sm focus:outline-none focus:border-emerald-300/80 focus:bg-white/15 focus:ring-2 focus:ring-emerald-300/20 transition-colors placeholder:text-emerald-100/40';

  return (
    <div className="login-bg relative min-h-screen overflow-hidden flex flex-col lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* Stage: the live network of upazilas, behind the whole page */}
      <LoginStage busy={busy} className="absolute inset-0" />

      {/* Left column on wide screens / banner on narrow ones */}
      <section className="relative h-60 sm:h-72 lg:h-auto pointer-events-none">
        <div className="hidden lg:block absolute left-12 xl:left-16 bottom-14 z-10 max-w-md text-white">
          <h1 className="font-display text-3xl xl:text-4xl font-bold leading-[1.15] tracking-tight">
            {slogan1}
            <br />
            {slogan2}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-emerald-100/75">
            Foreman connections, user IDs and forms for the 13 upazilas of Sylhet.
          </p>
        </div>
      </section>

      {/* Sign-in */}
      <main className="relative z-10 flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <form
            key={shake}
            onSubmit={handleSubmit}
            className={`w-full max-w-[24rem] ${shake ? 'login-shake' : ''}`}
          >
            {/* Logo in a frosted-glass tile */}
            <div className="relative mx-auto mb-6 w-fit rounded-3xl border border-white/25 bg-white/[0.07] px-5 py-4 backdrop-blur-xl backdrop-saturate-150 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]">
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 via-white/0 to-white/0" />
              <img
                src={logo}
                alt="Pace IT - Solution For Technology"
                width={557}
                height={751}
                draggable={false}
                className="relative block w-[132px] sm:w-[144px] [@media(max-height:700px)]:w-[112px] h-auto select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
              />
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="username" className="block text-sm text-emerald-100/80">
                    Username<span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <span className="text-[11px] text-emerald-200/70">Operator or Admin</span>
                </div>
                <input
                  id="username"
                  type="text"
                  autoFocus={!username}
                  autoComplete="username"
                  placeholder="e.g. admin or username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-emerald-100/80 mb-1.5">
                  Password<span className="text-red-400 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoFocus={Boolean(username)}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 text-emerald-100/60 hover:text-white"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error & Rate-limiting feedback */}
            {error ? (
              <div className="mt-2.5 p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs leading-relaxed" role="alert">
                {error}
              </div>
            ) : (
              <p className="h-4 mt-1.5 text-xs text-transparent select-none">&nbsp;</p>
            )}

            <button
              type="submit"
              disabled={busy || !password || !username.trim()}
              className="mt-3 block w-full h-11 text-sm font-semibold text-white bg-[#2f8f3a] hover:bg-[#36a043] rounded-lg shadow-[0_8px_24px_-8px_rgba(63,160,85,0.8)] transition-colors disabled:opacity-50 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b2f25] focus-visible:ring-emerald-300"
            >
              {busy ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <DevelopedBy tone="dark" />
      </main>
    </div>
  );
};
