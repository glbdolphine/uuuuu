export type Theme = 'light' | 'dark';

const KEY = 'pace_it_theme';
const REVEAL_MS = 700;
const FADE_MS = 400;

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}

// The reveal starts from wherever the user last clicked or tapped (the theme toggle).
let origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { origin = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setClass(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

function save(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };

let fadeTimer = 0;

export function applyTheme(t: Theme): void {
  save(t);
  const root = document.documentElement;
  if (root.classList.contains('dark') === (t === 'dark')) return;

  if (reducedMotion()) { setClass(t); return; }

  const doc = document as ViewTransitionDoc;
  if (doc.startViewTransition) {
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.classList.add('theme-switching');
    const transition = doc.startViewTransition(() => setClass(t));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => { /* transition skipped */ });
    transition.finished.finally(() => root.classList.remove('theme-switching'));
    return;
  }

  // Browsers without View Transitions: cross-fade the colours.
  root.classList.add('theme-fade');
  setClass(t);
  window.clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 50);
}
