import * as XLSX from 'xlsx';
import type { LogEntry } from '../types';
import { upazilaKey, UPAZILAS } from './upazilas';
import { normalizeCategory, normalizeTarget, sameTarget, type TargetInstitute } from './targetNorm';

export type { TargetInstitute };
export { UNCATEGORISED } from './targetNorm';

export interface TargetRow extends TargetInstitute {
  displayName: string;
  upazilaId: string;
  logs: LogEntry[];
  connected: boolean;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export const edcKey = (v?: string | number | null): string => {
  const t = String(v ?? '').trim().replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t.toLowerCase();
};

export function buildTargetRows(targets: TargetInstitute[], logs: LogEntry[]): TargetRow[] {
  const byEdc = new Map<string, LogEntry[]>();
  for (const l of logs) {
    if (l.deletedAt) continue;
    const k = edcKey(l.edcNo);
    if (!k) continue;
    const arr = byEdc.get(k);
    if (arr) arr.push(l); else byEdc.set(k, [l]);
  }
  const num = (l: LogEntry) => { const n = Number(l.logNo); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };
  return targets.map((t) => {
    const found = (byEdc.get(edcKey(t.edc)) || []).slice().sort((a, b) => num(a) - num(b));
    // Several records can share one EDC number (more than one connection for the same institute) - that is fine, the first one names it.
    const recName = found.map((l) => l.nameBn || l.customerName || l.nameEn || '').find(Boolean);
    return { ...t, displayName: recName || t.name, upazilaId: upazilaKey(t.upazila) || t.upazila, logs: found, connected: found.length > 0 };
  });
}

// ───────────── Reconciliation: connection records that do not add a target ─────────────

export type ExtraReason = 'no-edc' | 'not-in-workbook';

export interface ExtraRecord {
  log: LogEntry;
  reason: ExtraReason;
  edc: string;
  upazilaId: string;
  category: string;
  name: string;
}

export interface Reconciliation {
  records: number;
  connectedTargets: number;
  matchedRecords: number;
  multiRecordTargets: number;
  extras: ExtraRecord[];
  byReason: Record<ExtraReason, number>;
}

const logNoNum = (l: LogEntry) => { const n = Number(l.logNo); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };

export function reconcile(targets: TargetInstitute[], logs: LogEntry[]): Reconciliation {
  const known = new Set(targets.map((t) => edcKey(t.edc)));
  const live = logs.filter((l) => !l.deletedAt).sort((a, b) => logNoNum(a) - logNoNum(b));
  const perEdc = new Map<string, number>();
  const extras: ExtraRecord[] = [];
  const byReason: Record<ExtraReason, number> = { 'no-edc': 0, 'not-in-workbook': 0 };
  for (const l of live) {
    const k = edcKey(l.edcNo);
    const name = l.nameBn || l.customerName || l.nameEn || '';
    let reason: ExtraReason | null = null;
    if (!k) reason = 'no-edc';
    else if (!known.has(k)) reason = 'not-in-workbook';
    else perEdc.set(k, (perEdc.get(k) || 0) + 1);
    if (!reason) continue;
    byReason[reason]++;
    extras.push({ log: l, reason, edc: k, upazilaId: upazilaKey(l.upazila) || '', category: normalizeCategory(l.category, name), name });
  }
  return {
    records: live.length,
    connectedTargets: perEdc.size,
    matchedRecords: live.length - extras.length,
    multiRecordTargets: [...perEdc.values()].filter((n) => n > 1).length,
    extras,
    byReason,
  };
}

// ───────────── Shared EDC numbers: one EDC number on two or more records ─────────────

const GENERIC = new Set(['govt', 'government', 'govt.', 'primary', 'school', 'high', 'college', 'collage', 'madrasha', 'madrasa', 'dakhil', 'no', 'no.', 'union', 'health', 'sub', 'center', 'centre', 'community', 'clinic', 'and', 'of',
  'সরকারি', 'প্রাথমিক', 'বিদ্যালয়', 'উচ্চ', 'মাধ্যমিক', 'কলেজ', 'নং', 'নং.', 'ইউনিয়ন', 'ও', 'স্কুল']);

const grams = (name: string): Set<string> => {
  const words = name.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w && !GENERIC.has(w));
  const t = words.join('');
  const g = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  return g;
};

export function nameSimilarity(a: string, b: string): number {
  const x = grams(a), y = grams(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const g of x) if (y.has(g)) common++;
  return (2 * common) / (x.size + y.size);
}

const recordNames = (l: LogEntry) => [l.nameBn, l.nameEn, l.customerName].filter((n): n is string => Boolean(n && n.trim()));
const bestSim = (l: LogEntry, workbookName: string) => Math.max(0, ...recordNames(l).map((n) => nameSimilarity(n, workbookName)));

export interface SharedRecord {
  log: LogEntry;
  name: string;
  looksSame: boolean;
  hint?: { edc: string; name: string; upazila: string; score: number };
}

export interface SharedEdc {
  edc: string;
  target: TargetRow;
  records: SharedRecord[];
  upazilaId: string;
  category: string;
}

export function findSharedEdc(rows: TargetRow[]): SharedEdc[] {
  const free = rows.filter((r) => !r.connected);
  const out: SharedEdc[] = [];
  for (const r of rows) {
    if (r.logs.length < 2) continue;
    const records: SharedRecord[] = r.logs.map((log) => {
      const score = bestSim(log, r.name); // the WORKBOOK's name for this EDC number
      const looksSame = score >= 0.45;
      const rec: SharedRecord = { log, name: log.nameBn || log.customerName || log.nameEn || '', looksSame };
      if (!looksSame) {
        const up = upazilaKey(log.upazila);
        let best: { t: TargetRow; score: number } | null = null;
        for (const t of free) {
          if (up && t.upazilaId !== up) continue;
          const sc = bestSim(log, t.name);
          if (sc >= 0.5 && (!best || sc > best.score)) best = { t, score: sc };
        }
        if (best) rec.hint = { edc: best.t.edc, name: best.t.name, upazila: best.t.upazila, score: best.score };
      }
      return rec;
    });
    out.push({ edc: r.edc, target: r, records, upazilaId: r.upazilaId, category: r.category });
  }
  return out.sort((a, b) => Number(a.edc) - Number(b.edc));
}

// ───────────── Statistics ─────────────

export interface Tally { total: number; connected: number; left: number }
const empty = (): Tally => ({ total: 0, connected: 0, left: 0 });
const add = (t: Tally, connected: boolean) => { t.total++; if (connected) t.connected++; else t.left++; };
export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export interface GroupStat extends Tally {
  id: string;
  label: string;
  sub?: string;
}

export interface TargetStats {
  overall: Tally;
  upazilas: GroupStat[];
  categories: GroupStat[];
  matrix: Map<string, Map<string, Tally>>;
}

export function computeStats(rows: TargetRow[]): TargetStats {
  const overall = empty();
  const up = new Map<string, GroupStat>();
  const cat = new Map<string, GroupStat>();
  const matrix = new Map<string, Map<string, Tally>>();
  for (const r of rows) {
    add(overall, r.connected);
    let u = up.get(r.upazilaId);
    if (!u) {
      const def = UPAZILAS.find((x) => x.key === r.upazilaId);
      u = { id: r.upazilaId, label: def?.bn || r.upazila || 'No upazila', sub: def?.key, ...empty() };
      up.set(r.upazilaId, u);
    }
    add(u, r.connected);
    let c = cat.get(r.category);
    if (!c) { c = { id: r.category, label: r.category, ...empty() }; cat.set(r.category, c); }
    add(c, r.connected);
    let m = matrix.get(r.upazilaId);
    if (!m) { m = new Map(); matrix.set(r.upazilaId, m); }
    let cell = m.get(r.category);
    if (!cell) { cell = empty(); m.set(r.category, cell); }
    add(cell, r.connected);
  }
  const order = (id: string) => { const i = UPAZILAS.findIndex((x) => x.key === id); return i < 0 ? 999 : i; };
  return {
    overall,
    upazilas: [...up.values()].sort((a, b) => order(a.id) - order(b.id) || a.label.localeCompare(b.label)),
    categories: [...cat.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    matrix,
  };
}

// ───────────── Excel import ─────────────

const nfc = (v: unknown) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const low = (v: unknown) => nfc(v).toLowerCase();

export interface ParsedSheet { name: string; rows: number }

export interface ParsedTargets {
  rows: TargetInstitute[];
  sheets: ParsedSheet[];
  ignoredSheets: string[];
  invalid: number;
  duplicates: number;
  unknownUpazila: number;
  unnamed: number;
}

type Cols = { edc: number; upazila: number; union: number; category: number; name: number; contact: number; mobile: number; emis: number };

const DEFAULT_COLS: Cols = { edc: 1, upazila: 5, union: 6, category: 7, name: 8, contact: 9, mobile: 10, emis: 12 };

function mapHeader(head: string[]): Cols | null {
  const col = (...keys: string[]) => head.findIndex((h) => h && keys.some((k) => h.startsWith(k)));
  const c: Cols = {
    edc: col('edc', 'ক্রমিক', 'serial'),
    upazila: col('upazila', 'উপজেলা'),
    union: col('union', 'ইউনিয়ন'),
    category: col('দপ্তর', 'department', 'cat', 'ক্যাটাগরি', 'ক্যাটেগরি'),
    name: col('institute', 'প্রতিষ্ঠান', 'name'),
    contact: col('যোগাযোগ', 'contact'),
    mobile: col('মোবাইল', 'mobile'),
    emis: col('emis'),
  };
  return c.edc >= 0 && c.name >= 0 ? c : null;
}

export async function parseTargetFile(file: File): Promise<ParsedTargets> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const byEdc = new Map<string, TargetInstitute>();
  const sheets: ParsedSheet[] = [];
  const ignoredSheets: string[] = [];
  let invalid = 0, duplicates = 0, unknownUpazila = 0, unnamed = 0;

  for (const sheetName of wb.SheetNames) {
    // "SD-133" style sheets repeat every upazila (a master list) - reading them would only create duplicates.
    if (/^sd-?\d+/i.test(sheetName.trim())) { ignoredSheets.push(sheetName); continue; }
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });

    let cols: Cols | null = null;
    let start = 0;
    const hi = grid.slice(0, 15).findIndex((r) => mapHeader(r.map(low)));
    if (hi >= 0) { cols = mapHeader(grid[hi].map(low)); start = hi + 1; }
    else {
      // No header: accept the standard layout when it clearly fits (a number in column B, a name in column I).
      const fits = grid.slice(0, 30).filter((r) => /^\d+$/.test(nfc(r[1]).replace(/\.0+$/, '')) && nfc(r[8]).length > 2).length;
      if (fits >= 3) cols = DEFAULT_COLS;
    }
    if (!cols) { ignoredSheets.push(sheetName); continue; }

    const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : '');
    let read = 0;
    for (const r of grid.slice(start)) {
      if (r.every((x) => !nfc(x))) continue; // blank line
      const t = normalizeTarget({
        edc: nfc(get(r, cols.edc)),
        upazila: nfc(get(r, cols.upazila)),
        union: get(r, cols.union),
        department: get(r, cols.category),
        name: get(r, cols.name),
        contact: get(r, cols.contact),
        mobile: get(r, cols.mobile),
        emis: get(r, cols.emis),
      }, sheetName);
      // No EDC number: a title / note row (nothing else on it), or an institute we cannot match (counted as skipped).
      if (!t) { if (nfc(get(r, cols.name))) invalid++; continue; }
      // An EDC number without a name is still a target - keep it, so the count stays right.
      if (!t.name) { t.name = `(no name in the Excel - EDC ${t.edc})`; unnamed++; }
      if (byEdc.has(t.edc)) duplicates++;
      if (!upazilaKey(t.upazila)) unknownUpazila++;
      byEdc.set(t.edc, t);
      read++;
    }
    sheets.push({ name: sheetName, rows: read });
  }
  return { rows: [...byEdc.values()], sheets, ignoredSheets, invalid, duplicates, unknownUpazila, unnamed };
}

export function planImport(current: TargetInstitute[], incoming: TargetInstitute[]) {
  const have = new Map(current.map((t) => [t.edc, t] as const));
  const seen = new Set<string>();
  let added = 0, updated = 0, unchanged = 0;
  for (const n of incoming) {
    seen.add(n.edc);
    const o = have.get(n.edc);
    if (!o) added++;
    else if (sameTarget(o, n)) unchanged++;
    else updated++;
  }
  const notInFile = current.filter((t) => !seen.has(t.edc)).length;
  return { added, updated, unchanged, notInFile };
}

// ───────────── Export ─────────────

const today = () => new Date().toISOString().slice(0, 10);

const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];

const toLine = (r: TargetRow) => ({
  'EDC No': Number(r.edc),
  'Institute': r.displayName,
  'Name in workbook': r.name === r.displayName ? '' : r.name,
  'Upazila': r.upazila,
  'Category': r.category,
  'Union': r.union || '',
  'Status': r.connected ? 'Connected' : 'Left for connection',
  'Connection No': r.logs.map((l) => l.logNo).join(', '),
  'Connected On': r.logs.map((l) => l.date).filter(Boolean).sort()[0] || '',
  'Foreman': uniq(r.logs.map((l) => l.foremanName)).join(', '),
  'NMS ID': uniq(r.logs.map((l) => l.nmsId)).join(', '),
  'Contact Name': r.contact || '',
  'Mobile': r.mobile || '',
  'EMIS Code': r.emis || '',
});

const COL_WIDTHS = [8, 46, 40, 16, 34, 18, 18, 14, 13, 18, 16, 18, 14, 12].map((wch) => ({ wch }));

function sheetFrom(rows: TargetRow[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows.map(toLine));
  ws['!cols'] = COL_WIDTHS;
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } as any;
  if (rows.length) ws['!autofilter'] = { ref: `A1:N${rows.length + 1}` };
  return ws;
}

export function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
  let name = base, n = 2;
  while (used.has(name.toLowerCase())) { const suffix = ` ${n++}`; name = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}

const SHORT_CATEGORY: Record<string, string> = {
  'Secondary and Higher Secondary Education': 'Secondary & Higher Sec.',
  'Diabetic Association of Bangladesh': 'Diabetic Association',
  'Department of Social Services': 'Social Services',
  'Technical Education': 'Technical',
  'Primary Education': 'Primary',
  'Madrasa Education': 'Madrasa',
  'Health Service': 'Health',
  'Land Reform Board': 'Land Reform',
  'National University': 'National Univ.',
  'Govt. Organization': 'Govt. Org.',
};

export const shortCategory = (label: string) => SHORT_CATEGORY[label] || label;

const REASON_TEXT: Record<ExtraReason, string> = {
  'no-edc': 'No EDC number on the record',
  'not-in-workbook': 'EDC number is not in the workbook',
};
export const reasonText = (r: ExtraReason) => REASON_TEXT[r];

export const extraLine = (e: ExtraRecord) => ({
  'Connection No': e.log.logNo,
  'Institute': e.name,
  'EDC No on record': e.edc ? Number(e.edc) : '',
  'Why it is not a connected target': REASON_TEXT[e.reason],
  'Upazila': e.log.upazila || '',
  'Union': e.log.unionName || '',
  'Foreman': e.log.foremanName || '',
  'NMS ID': e.log.nmsId || '',
  'Date': e.log.date || '',
});

function extraSheet(extras: ExtraRecord[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(extras.map(extraLine));
  ws['!cols'] = [12, 44, 14, 40, 16, 18, 18, 16, 12].map((wch) => ({ wch }));
  return ws;
}

export const sharedLine = (g: SharedEdc) => g.records.map((r) => ({
  'EDC No': Number(g.edc),
  'Name in workbook': g.target.name,
  'Connection No': r.log.logNo,
  'Record name': r.name,
  'Name fits this EDC?': r.looksSame ? 'Yes' : 'No',
  'Looks like workbook EDC': r.hint ? Number(r.hint.edc) : '',
  'Workbook name of that EDC': r.hint ? r.hint.name : '',
  'Upazila': r.log.upazila || '',
  'Foreman': r.log.foremanName || '',
  'NMS ID': r.log.nmsId || '',
}));

function sharedSheet(g: SharedEdc[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(g.flatMap(sharedLine));
  ws['!cols'] = [8, 40, 12, 44, 12, 14, 40, 16, 18, 14].map((wch) => ({ wch }));
  return ws;
}

export type ExportMode = 'view' | 'by-upazila' | 'by-category' | 'left-by-upazila' | 'csv';

const saveCsv = (ws: XLSX.WorkSheet, filename: string) => {
  const blob = new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

export async function exportTargets(mode: ExportMode, all: TargetRow[], view: TargetRow[], label = 'view', extras: ExtraRecord[] = [], viewExtras: ExtraRecord[] | null = null, shared: SharedEdc[] = [], viewShared: SharedEdc[] | null = null): Promise<void> {
  const byUp = (a: TargetRow, b: TargetRow) => a.upazila.localeCompare(b.upazila) || a.category.localeCompare(b.category) || Number(a.edc) - Number(b.edc);

  if (mode === 'csv') {
    if (viewShared) return saveCsv(sharedSheet(viewShared), `Pace_IT_Shared_EDC_${today()}.csv`);
    if (viewExtras) return saveCsv(extraSheet(viewExtras), `Pace_IT_Records_not_matched_${today()}.csv`);
    return saveCsv(sheetFrom([...view].sort(byUp)), `Pace_IT_Targets_${label}_${today()}.csv`);
  }
  const { exportTargetsXlsx } = await import('./targetExport');
  await exportTargetsXlsx(mode, all, view, label, extras, viewExtras, shared, viewShared);
}
