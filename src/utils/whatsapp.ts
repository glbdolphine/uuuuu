import { LogEntry } from '../types';

export function waLink(phone?: string, message?: string): string | null {
  if (!phone) return null;
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return null;

  const intlPhone = cleanPhone.startsWith('880')
    ? cleanPhone
    : cleanPhone.startsWith('0')
    ? '880' + cleanPhone.slice(1)
    : cleanPhone;

  const encodedMsg = message ? encodeURIComponent(message) : '';
  return `https://wa.me/${intlPhone}${encodedMsg ? `?text=${encodedMsg}` : ''}`;
}

export function chaseMessage(foremanName: string, logs: LogEntry[]): string {
  const prefix = foremanName ? `Dear ${foremanName}, ` : 'Hello, ';
  if (logs.length === 1) {
    const l = logs[0];
    return `${prefix}please submit the signed UPAC/EDC acceptance form for ${l.customerName || 'Institute'} (NMS: ${l.nmsId || 'N/A'}, EDC: ${l.edcNo || 'N/A'}, Connection #${l.logNo}). Thank you, Pace IT.`;
  }
  const count = logs.length;
  const items = logs.slice(0, 5).map((l) => `• ${l.customerName || 'Institute'} (NMS: ${l.nmsId || 'N/A'})`).join('\n');
  return `${prefix}you have ${count} pending acceptance forms awaiting submission:\n${items}${count > 5 ? `\n...and ${count - 5} more` : ''}\nPlease submit them at your earliest convenience. Thank you, Pace IT.`;
}

export function billChaseMessage(foremanName: string, logs: LogEntry[], monthText: string): string {
  const prefix = foremanName ? `Dear ${foremanName}, ` : 'Hello, ';
  if (logs.length === 1) {
    const l = logs[0];
    return `${prefix}please submit the ${monthText} bill for ${l.customerName || 'Institute'} (NMS: ${l.nmsId || 'N/A'}, EDC: ${l.edcNo || 'N/A'}, Connection #${l.logNo}). Thank you, Pace IT.`;
  }
  const count = logs.length;
  const items = logs.slice(0, 5).map((l) => `• ${l.customerName || 'Institute'} (NMS: ${l.nmsId || 'N/A'})`).join('\n');
  return `${prefix}you have ${count} pending ${monthText} bills awaiting submission:\n${items}${count > 5 ? `\n...and ${count - 5} more` : ''}\nPlease submit them at your earliest convenience. Thank you, Pace IT.`;
}
