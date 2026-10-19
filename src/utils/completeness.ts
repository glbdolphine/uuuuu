import { LogEntry } from '../types';
import { displayCategory } from './category';

export type MissingKey =
  | 'nameBn' | 'foreman' | 'upazila' | 'unionName' | 'category' | 'nmsId' | 'edcNo'
  | 'mac' | 'routerSerial' | 'location' | 'fiberLength' | 'headTeacherName' | 'headTeacherPhone';

const has = (v?: string) => Boolean(v && String(v).trim());

export const INFO_FIELDS: { key: MissingKey; label: string; present: (l: LogEntry) => boolean }[] = [
  { key: 'nameBn', label: 'Bangla institute name', present: (l) => has(l.nameBn) },
  { key: 'foreman', label: 'Foreman', present: (l) => has(l.foremanName) && l.foremanName.trim().toLowerCase() !== 'unassigned' },
  { key: 'upazila', label: 'Upazila', present: (l) => has(l.upazila) },
  { key: 'unionName', label: 'Union / address', present: (l) => has(l.unionName) },
  { key: 'category', label: 'Category / POP', present: (l) => has(displayCategory(l)) },
  { key: 'nmsId', label: 'NMS ID', present: (l) => has(l.nmsId) },
  { key: 'edcNo', label: 'EDC book no.', present: (l) => has(l.edcNo) },
  { key: 'mac', label: 'MAC address', present: (l) => has(l.mac) },
  { key: 'routerSerial', label: 'Router serial', present: (l) => has(l.routerSerial) },
  { key: 'location', label: 'Lat / Long', present: (l) => has(l.lat) && has(l.long) },
  { key: 'fiberLength', label: 'Fiber length', present: (l) => has(l.fiberLength) },
  { key: 'headTeacherName', label: 'Head teacher name', present: (l) => has(l.headTeacherName) },
  { key: 'headTeacherPhone', label: 'Head teacher phone', present: (l) => has(l.headTeacherPhone) },
];

export const missingOf = (l: LogEntry) => INFO_FIELDS.filter((f) => !f.present(l));

export const missingLabel = (key: MissingKey) => INFO_FIELDS.find((f) => f.key === key)?.label || key;

export interface CompletenessStats {
  complete: number;
  incomplete: number;
  perField: { key: MissingKey; label: string; missing: number }[];
  worst: { log: LogEntry; missing: string[] }[];
}

export function completenessStats(logs: LogEntry[]): CompletenessStats {
  const counts = new Map<MissingKey, number>();
  const rows: { log: LogEntry; missing: string[] }[] = [];
  let complete = 0;
  for (const l of logs) {
    const m = missingOf(l);
    if (!m.length) { complete++; continue; }
    for (const f of m) counts.set(f.key, (counts.get(f.key) || 0) + 1);
    rows.push({ log: l, missing: m.map((f) => f.label) });
  }
  const perField = INFO_FIELDS.map((f) => ({ key: f.key, label: f.label, missing: counts.get(f.key) || 0 }))
    .sort((a, b) => b.missing - a.missing);
  rows.sort((a, b) => b.missing.length - a.missing.length);
  return { complete, incomplete: logs.length - complete, perField, worst: rows.slice(0, 8) };
}
