import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UserCircle2, KeyRound, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import { initialsOf } from '../utils/image';

interface AccountMenuProps {
  open: boolean;
  collapsed?: boolean;
  onClose: () => void;
  userName: string;
  userRole: string;
  userPhotoUrl?: string;
  onViewProfile: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  children: React.ReactNode; // the button that opens the menu
}

export const AccountMenu: React.FC<AccountMenuProps> = ({
  open,
  collapsed = false,
  onClose,
  userName,
  userRole,
  userPhotoUrl,
  onViewProfile,
  onChangePassword,
  onLogout,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // The slim rail clips anything that sticks out of it, so in that mode the menu is fixed to the
  // screen, just right of the button and bottom-aligned with it.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !collapsed || !ref.current) { setPos(null); return; }
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      setPos({ left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const item =
    'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          style={collapsed ? { position: 'fixed', left: pos?.left ?? -9999, bottom: pos?.bottom ?? 0, width: '15rem' } : undefined}
          className={`${collapsed ? 'account-pop-side' : 'absolute bottom-full left-0 min-w-[15rem] right-0 mb-2'} bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50 ${collapsed ? '' : 'animate-in fade-in slide-in-from-bottom-1 duration-100'}`}
        >
          <div className="px-3.5 py-3 bg-gradient-to-br from-brand-50 to-white border-b border-slate-100 flex items-center gap-2.5">
            {userPhotoUrl ? (
              <img src={userPhotoUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-brand-200 shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-700 to-brand-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {initialsOf(userName)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">{userName}</div>
              <div className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                {userRole === 'admin' ? <ShieldCheck className="w-3 h-3 text-amber-600" /> : <UserCheck className="w-3 h-3 text-brand-600" />}
                {userRole === 'admin' ? 'Admin' : 'Operator'}
              </div>
            </div>
          </div>

          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              className={`${item} text-slate-700 hover:bg-brand-50 hover:text-brand-900`}
              onClick={() => {
                onClose();
                onViewProfile();
              }}
            >
              <UserCircle2 className="w-4 h-4 text-slate-400" />
              <span>View profile</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${item} text-slate-700 hover:bg-brand-50 hover:text-brand-900`}
              onClick={() => {
                onClose();
                onChangePassword();
              }}
            >
              <KeyRound className="w-4 h-4 text-slate-400" />
              <span>Change password</span>
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitem"
              className={`${item} text-rose-700 hover:bg-rose-50`}
              onClick={() => {
                onClose();
                onLogout();
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};
