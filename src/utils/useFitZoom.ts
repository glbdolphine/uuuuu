import { RefObject, useLayoutEffect } from 'react';

interface FitOptions {
  min?: number;
  max?: number;
}

export function useFitZoom(
  fitRef: RefObject<HTMLElement | null>,
  boxRef: RefObject<HTMLElement | null> | (() => HTMLElement | null),
  dep: unknown,
  { min = 0.55, max = 1.5 }: FitOptions = {},
): void {
  useLayoutEffect(() => {
    const el = fitRef.current;
    const getBox = () => (typeof boxRef === 'function' ? boxRef() : boxRef.current);
    if (!el || !getBox()) return;

    const fit = () => {
      const box = getBox();
      if (!box) return;
      const cs = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 1;
      const fits = (z: number) => {
        el.style.zoom = String(z);
        return el.getBoundingClientRect().height <= avail;
      };
      if (fits(max)) return;
      let lo = min;
      let hi = max;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      el.style.zoom = String(lo);
    };

    fit();
    const box = getBox();
    const ro = typeof ResizeObserver !== 'undefined' && box ? new ResizeObserver(fit) : null;
    if (ro && box) ro.observe(box);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [fitRef, boxRef, dep, min, max]);
}
