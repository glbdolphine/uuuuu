import { LogEntry } from '../types';

export type FollowFilter = 'all' | 'today' | 'overdue';

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function followDiff(log: LogEntry, customToday?: Date): number | null {
  if (!log.followUpDate) return null;
  const target = new Date(log.followUpDate);
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const today = customToday || startOfToday();
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function followState(log: LogEntry, customToday?: Date): 'today' | 'overdue' | 'future' | null {
  const diff = followDiff(log, customToday);
  if (diff === null) return null;
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'future';
}

export function followLabel(log: LogEntry): string {
  const diff = followDiff(log);
  if (diff === null) return '';
  if (diff < 0) return `Follow-up overdue (${Math.abs(diff)}d ago)`;
  if (diff === 0) return 'Follow-up today';
  if (diff === 1) return 'Follow-up tomorrow';
  return `Follow-up in ${diff}d`;
}
