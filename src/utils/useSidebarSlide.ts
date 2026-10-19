import { RefObject, useCallback, useLayoutEffect, useRef } from 'react';

export const SIDEBAR_MS = 520;
export const SIDEBAR_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const SIDEBAR_PANEL_ID = 'app-sidebar-panel';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useSidebarSlide(
  row: RefObject<HTMLElement | null>,
  column: RefObject<HTMLElement | null>,
  open: boolean,
) {
  const before = useRef<{ panelW: number; lefts: Map<Element, number> } | null>(null);
  const running = useRef<Animation[]>([]);

  // Measure where everything is right now (this includes any slide still in flight, so a quick
  // second click continues from the current position instead of jumping).
  const capture = useCallback(() => {
    const col = column.current;
    const panel = document.getElementById(SIDEBAR_PANEL_ID);
    if (!col || !panel) { before.current = null; return; }
    const lefts = new Map<Element, number>();
    Array.from(col.children as HTMLCollection).forEach((c) => lefts.set(c, c.getBoundingClientRect().left));
    before.current = { panelW: panel.getBoundingClientRect().width, lefts };
  }, [column]);

  useLayoutEffect(() => {
    const from = before.current;
    before.current = null;
    const r = row.current;
    const col = column.current;
    const panel = document.getElementById(SIDEBAR_PANEL_ID);

    // Drop any slide still running; its position is already stored in `from`.
    running.current.forEach((a) => a.cancel());
    running.current = [];

    if (!from || !r || !col || !panel || reduced()) { if (r) r.style.overflowX = ''; return; }

    const opts: KeyframeAnimationOptions = { duration: SIDEBAR_MS, easing: SIDEBAR_EASE };
    const anims: Animation[] = [];

    // Sidebar panel: glide its width from the old size to the new one (only the sidebar's own few
    // elements are laid out per frame).
    const panelTo = panel.getBoundingClientRect().width;
    if (Math.abs(from.panelW - panelTo) > 0.5) {
      anims.push(panel.animate([{ width: `${from.panelW}px` }, { width: `${panelTo}px` }], opts));
    }

    // Page content: it is already in its final place, so start it back where it was and slide in.
    Array.from(col.children as HTMLCollection).forEach((c) => {
      const left = from.lefts.get(c);
      if (left === undefined) return;
      const dx = left - c.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) return;
      anims.push((c as HTMLElement).animate(
        [{ transform: `translate3d(${dx}px,0,0)` }, { transform: 'translate3d(0,0,0)' }],
        opts,
      ));
    });

    if (!anims.length) { r.style.overflowX = ''; return; }

    // Content that is wider than the screen for a moment must not create a scrollbar.
    r.style.overflowX = 'clip';
    running.current = anims;
    Promise.allSettled(anims.map((a) => a.finished)).then(() => {
      if (running.current === anims) { running.current = []; r.style.overflowX = ''; }
    });
  }, [open, row, column]);

  return { capture };
}
