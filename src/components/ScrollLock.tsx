import { useEffect } from 'react';

// Several modals can be open at once (e.g. a photo over a profile), so the lock is reference-counted:
// the page behind stays frozen until the last one closes.
let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export const ScrollLock: React.FC = () => {
  useEffect(() => {
    if (locks === 0) {
      const b = document.body;
      saved = { overflow: b.style.overflow, paddingRight: b.style.paddingRight };
      // Hiding the scrollbar would make the page jump sideways, so keep its width.
      const bar = window.innerWidth - document.documentElement.clientWidth;
      if (bar > 0) b.style.paddingRight = `${bar}px`;
      b.style.overflow = 'hidden';
    }
    locks++;
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow;
        document.body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, []);
  return null;
};
