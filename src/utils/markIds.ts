import { LogEntry } from '../types';

export interface IdMatchResult {
  pasted: number;        // every ID typed/pasted (duplicates included)
  duplicates: string[];  // IDs pasted more than once (extra copies ignored)
  found: LogEntry[];     // distinct logs matched
  missing: string[];     // distinct IDs with no log yet
  already: LogEntry[];   // matched logs that are already in the wanted state
  target: LogEntry[];    // matched logs that still need changing
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const normalizeId = (s: string) =>
  s.trim().toLowerCase().replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const normalize = normalizeId;

export function matchIds(text: string, logs: LogEntry[], isDone: (l: LogEntry) => boolean): IdMatchResult {
  const tokens = text.split(/[\s,;|]+/).map((t) => t.trim()).filter(Boolean);
  const index = new Map<string, LogEntry>();
  for (const pick of [(l: LogEntry) => String(l.logNo), (l: LogEntry) => l.edcNo, (l: LogEntry) => l.nmsId]) {
    for (const l of logs) {
      const k = pick(l);
      if (k && String(k).trim()) index.set(normalize(String(k)), l);
    }
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const found = new Map<string, LogEntry>();
  const missing: string[] = [];
  for (const t of tokens) {
    const key = normalize(t);
    if (seen.has(key)) { if (!duplicates.includes(t)) duplicates.push(t); continue; }
    seen.add(key);
    const l = index.get(key);
    if (l) found.set(l.id, l); else missing.push(t);
  }
  const foundList = [...found.values()];
  return {
    pasted: tokens.length,
    duplicates,
    found: foundList,
    missing,
    already: foundList.filter(isDone),
    target: foundList.filter((l) => !isDone(l)),
  };
}
