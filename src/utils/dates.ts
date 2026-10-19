import { LogEntry } from '../types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseEntryDate(text?: string): Date | null {
  const s = (text || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})[a-z]*[\s\-\/,]+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toInputDate(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromInputDate(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function logDay(log: LogEntry): Date | null {
  const own = parseEntryDate(log.date);
  if (own) return own;
  const s = log.createdAt;
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    const parsed = fromIso(s);
    if (parsed) {
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatLogDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fromIso(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function showDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
