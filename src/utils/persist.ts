import { useCallback, useEffect, useRef, useState } from 'react';

// Page filters survive leaving the page and coming back (opening a record, saving it, switching tabs...).
// They live in memory for the session and in sessionStorage, so a refresh keeps them too. Nothing is shared between browser tabs.
const mem = new Map<string, unknown>();
const KEY = 'pace_it_ui:';

export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (mem.has(key)) return mem.get(key) as T;
    try {
      const raw = sessionStorage.getItem(KEY + key);
      if (raw !== null) { const v = JSON.parse(raw) as T; mem.set(key, v); return v; }
    } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    mem.set(key, value);
    try { sessionStorage.setItem(KEY + key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

// Remembers a scrollable list's position. Spread the result on the scrolling element: <div {...scroll}>.
const scrolls = new Map<string, number>();
export function useScrollMemory(key: string) {
  const keyRef = useRef(key);
  keyRef.current = key;
  const ref = useCallback((el: HTMLElement | null) => {
    if (el) { const y = scrolls.get(keyRef.current); if (y) requestAnimationFrame(() => { el.scrollTop = y; }); }
  }, []);
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => { scrolls.set(keyRef.current, e.currentTarget.scrollTop); }, []);
  return { ref, onScroll } as { ref: React.RefCallback<HTMLElement>; onScroll: React.UIEventHandler<HTMLElement> };
}
