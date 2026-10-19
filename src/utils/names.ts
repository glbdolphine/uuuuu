import { LogEntry } from '../types';

const BANGLA = /[ঀ-৿]/;

export const isBangla = (s?: string) => BANGLA.test(s || '');

export function splitName(name?: string): { nameBn: string; nameEn: string } {
  const n = (name || '').trim();
  if (!n) return { nameBn: '', nameEn: '' };
  return isBangla(n) ? { nameBn: n, nameEn: '' } : { nameBn: '', nameEn: n };
}

export function displayName(l: Pick<LogEntry, 'customerName'> & Partial<LogEntry>): string {
  return (l.nameBn || '').trim() || (l.customerName || '').trim();
}

export function primaryName(nameBn?: string, nameEn?: string, fallback?: string): string {
  return (nameBn || '').trim() || (nameEn || '').trim() || (fallback || '').trim();
}

export type NameLang = 'bn' | 'en';

export function nameFor(l: Partial<LogEntry>, lang: NameLang): { text: string; missing: boolean } {
  const bn = displayName(l as Pick<LogEntry, 'customerName'> & Partial<LogEntry>);
  if (lang === 'en') {
    const en = (l.nameEn || '').trim();
    if (en) return { text: en, missing: false };
    // a name that was only ever typed in English is kept in customerName
    return { text: bn, missing: isBangla(bn) };
  }
  return { text: bn, missing: false };
}
