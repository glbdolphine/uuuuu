import { LogEntry, Foreman } from '../types';

export function matchForeman(
  query: { foremanId?: string; foremanName?: string },
  foremen: Foreman[]
): Foreman | null {
  if (query.foremanId) {
    const found = foremen.find((r) => r.id === query.foremanId);
    if (found) return found;
  }
  if (query.foremanName) {
    const norm = query.foremanName.trim().toLowerCase();
    const found = foremen.find((r) => r.name.trim().toLowerCase() === norm);
    if (found) return found;
  }
  return null;
}

export function phoneForLog(log: LogEntry, foremen: Foreman[]): string {
  if (log.foremanPhone && log.foremanPhone.trim()) return log.foremanPhone.trim();
  const matched = matchForeman({ foremanId: log.foremanId, foremanName: log.foremanName }, foremen);
  return matched?.phone || '';
}
