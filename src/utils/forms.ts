import { LogEntry, Foreman } from '../types';
import * as XLSX from 'xlsx';
import { monthKey } from './months';

export type FormFilter = 'all' | 'awaiting' | 'received';

export interface FormForemanRow {
  key: string;
  name: string;
  sent: number;
  received: number;
}

export interface FormStatsResult {
  sent: number;
  received: number;
  awaiting: number;
  overdue: number;
  rows: FormForemanRow[];
}

export interface ImportPlan {
  toMark: { log: LogEntry; at: string }[];
  already: number;
  notFound: string[];
}

let cachedOverdueDays = 3;

export function getOverdueDays(): number {
  try {
    const s = localStorage.getItem('pace_it_form_overdue_days');
    if (s) {
      const n = parseInt(s, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return cachedOverdueDays;
}

export function setOverdueDays(n: number): void {
  cachedOverdueDays = n;
  try {
    localStorage.setItem('pace_it_form_overdue_days', String(n));
  } catch {
    /* ignore */
  }
}

export function expectsForm(log: LogEntry): boolean {
  const req = (log.requestType || '').toLowerCase();
  return req.includes('new user') || req.includes('form') || Boolean(log.edcNo);
}

export function hasForm(log: LogEntry): boolean {
  return Boolean(log.formReceivedAt && log.formReceivedAt.trim());
}

export function formMonthOf(log: LogEntry): string {
  const at = (log.formReceivedAt || '').trim();
  if (!at) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at.slice(0, 7); // a plain date is already in local time
  const d = new Date(at);
  return isNaN(d.getTime()) ? '' : monthKey(d);
}

export function formMonthCounts(logs: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) {
    if (!expectsForm(l)) continue;
    const k = formMonthOf(l);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function monthToReceivedOn(month: string): string {
  const now = new Date();
  if (!month || month === monthKey(now)) return now.toLocaleDateString('sv-SE');
  return `${month}-01`;
}

export function daysAwaiting(log: LogEntry): number {
  if (hasForm(log)) return 0;
  const created = new Date(log.createdAt || log.date);
  if (isNaN(created.getTime())) return 0;
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function isFormOverdue(log: LogEntry, customLimit?: number): boolean {
  const limit = typeof customLimit === 'number' ? customLimit : getOverdueDays();
  return expectsForm(log) && !hasForm(log) && daysAwaiting(log) >= limit;
}

export function formStats(logs: LogEntry[]): FormStatsResult {
  const expecting = logs.filter(expectsForm);
  const received = expecting.filter(hasForm).length;
  const awaiting = expecting.length - received;
  const overdue = expecting.filter((l) => isFormOverdue(l)).length;

  const foremanMap = new Map<string, { sent: number; received: number }>();
  for (const log of expecting) {
    const rName = log.foremanName?.trim() || 'Unassigned';
    const curr = foremanMap.get(rName) || { sent: 0, received: 0 };
    curr.sent += 1;
    if (hasForm(log)) curr.received += 1;
    foremanMap.set(rName, curr);
  }

  const rows: FormForemanRow[] = Array.from(foremanMap.entries()).map(([name, data]) => ({
    key: name,
    name,
    sent: data.sent,
    received: data.received,
  }));

  return { sent: expecting.length, received, awaiting, overdue, rows };
}

export function awaitingByForeman(logs: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const log of logs) {
    if (expectsForm(log) && !hasForm(log)) {
      const key = log.foremanName || 'Unassigned Foreman';
      const arr = map.get(key) || [];
      arr.push(log);
      map.set(key, arr);
    }
  }
  return map;
}

export async function planFormImport(file: File, logs: LogEntry[]): Promise<ImportPlan> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const toMark: { log: LogEntry; at: string }[] = [];
  const notFound: string[] = [];
  let already = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!cell) continue;
      const str = String(cell).trim();
      if (!str || str.length < 3) continue;

      const matched = logs.find((l) => {
        if (l.edcNo && String(l.edcNo).trim() === str) return true;
        if (l.nmsId && String(l.nmsId).trim() === str) return true;
        if (String(l.logNo) === str) return true;
        return false;
      });

      if (matched) {
        if (hasForm(matched)) {
          already++;
        } else if (!toMark.some((x) => x.log.id === matched.id)) {
          toMark.push({ log: matched, at: now });
        }
      }
    }
  }

  return { toMark, already, notFound };
}

export function exportFormTracker(logs: LogEntry[], onlyAwaitingOrForemen?: boolean | Foreman[]): void {
  const onlyAwaiting = typeof onlyAwaitingOrForemen === 'boolean' ? onlyAwaitingOrForemen : false;
  let expecting = logs.filter(expectsForm);
  if (onlyAwaiting) {
    expecting = expecting.filter((l) => !hasForm(l));
  }

  const data = expecting.map((l) => ({
    'Connection No': l.logNo,
    'Date': l.date,
    'Foreman': l.foremanName,
    'Foreman Phone': l.foremanPhone || '',
    'Institute Name': l.customerName,
    'Head Teacher / In-Charge': l.headTeacherName || '',
    'Head Teacher Phone': l.headTeacherPhone || '',
    'Upazila': l.upazila || '',
    'Union': l.unionName || '',
    'Coordinates': [l.lat, l.long].filter(Boolean).join(', '),
    'NMS ID': l.nmsId,
    'EDC Book No': l.edcNo || '',
    'Emis / EIIN / DGHS': l.emisEiinDghs || '',
    'MAC': l.mac || '',
    'Router Serial': l.routerSerial || '',
    'Fiber Length (m)': l.fiberLength || '',
    'Status': hasForm(l) ? 'Received' : 'Awaiting',
    'Days Awaiting': daysAwaiting(l),
    'Received month': formMonthOf(l),
    'Received At': l.formReceivedAt || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Form Tracker');
  XLSX.writeFile(
    workbook,
    `Pace_IT_Form_Tracker_${onlyAwaiting ? 'Awaiting_' : 'All_'}${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
