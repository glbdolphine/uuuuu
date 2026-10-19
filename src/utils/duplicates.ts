import { LogEntry } from '../types';

export interface DuplicateMatch {
  field: string;
  label: string;
  value: string;
  others: LogEntry[];
}

export function describeLog(log?: LogEntry): string {
  if (!log) return '';
  return `#${log.logNo} (${log.customerName || 'No Name'} - ${log.foremanName || 'No Foreman'})`;
}

export function findDuplicates(
  target: { id?: string; mac?: string; routerSerial?: string; nmsId?: string },
  logs: LogEntry[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const activeLogs = logs.filter((l) => l.id !== target.id && !l.deletedAt);

  const cleanMac = (target.mac || '').trim().toLowerCase().replace(/[:-]/g, '');
  if (cleanMac && cleanMac.length >= 6) {
    const macOthers = activeLogs.filter((l) => {
      const otherMac = (l.mac || '').trim().toLowerCase().replace(/[:-]/g, '');
      return otherMac && otherMac === cleanMac;
    });
    if (macOthers.length > 0) {
      matches.push({
        field: 'mac',
        label: 'MAC Address',
        value: target.mac || '',
        others: macOthers,
      });
    }
  }

  const cleanSerial = (target.routerSerial || '').trim().toLowerCase();
  if (cleanSerial && cleanSerial.length >= 4) {
    const serialOthers = activeLogs.filter((l) => {
      const otherSerial = (l.routerSerial || '').trim().toLowerCase();
      return otherSerial && otherSerial === cleanSerial;
    });
    if (serialOthers.length > 0) {
      matches.push({
        field: 'routerSerial',
        label: 'Router Serial',
        value: target.routerSerial || '',
        others: serialOthers,
      });
    }
  }

  const cleanNms = (target.nmsId || '').trim();
  if (cleanNms && cleanNms.length >= 3) {
    const nmsOthers = activeLogs.filter((l) => (l.nmsId || '').trim() === cleanNms);
    if (nmsOthers.length > 0) {
      matches.push({
        field: 'nmsId',
        label: 'NMS ID',
        value: cleanNms,
        others: nmsOthers,
      });
    }
  }

  return matches;
}
