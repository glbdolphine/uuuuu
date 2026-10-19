import { LogEntry } from '../types';
import { monthKey } from './months';

export const billMonthsOf = (log: LogEntry): string[] => {
  if (Array.isArray(log.billMonths) && log.billMonths.length) return log.billMonths;
  if (log.billReceivedAt && log.billReceivedAt.trim()) {
    const d = new Date(log.billReceivedAt);
    if (!isNaN(d.getTime())) return [monthKey(d)];
  }
  return [];
};

export const hasBill = (log: LogEntry, month?: string) => {
  const months = billMonthsOf(log);
  return month ? months.includes(month) : months.length > 0;
};

export const latestBillMonth = (log: LogEntry): string => {
  const m = billMonthsOf(log);
  return m.length ? [...m].sort()[m.length - 1] : '';
};

export function billMonthCounts(logs: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) for (const k of billMonthsOf(l)) m.set(k, (m.get(k) || 0) + 1);
  return m;
}

export interface BillStats {
  total: number;
  received: number;
  notReceived: number;
  pct: number;
}

export function billStats(logs: LogEntry[], month?: string): BillStats {
  const received = logs.filter((l) => hasBill(l, month)).length;
  const total = logs.length;
  return { total, received, notReceived: total - received, pct: total ? Math.round((received / total) * 100) : 0 };
}
