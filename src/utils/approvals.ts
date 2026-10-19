import { ApprovalRequest, LogEntry, MarkAction, MarkKind } from '../types';
import { hasBill } from './bills';

export type PendingIndex = Map<string, ApprovalRequest>;

const key = (logId: string, kind: MarkKind, month?: string) => (month ? `${logId}|${kind}|${month}` : `${logId}|${kind}`);

export function indexPending(approvals: ApprovalRequest[]): PendingIndex {
  const m: PendingIndex = new Map();
  for (const a of approvals) {
    if (a.status !== 'pending') continue;
    m.set(key(a.logId, a.kind), a);
    if (a.month) m.set(key(a.logId, a.kind, a.month), a);
  }
  return m;
}

export const pendingFor = (idx: PendingIndex | undefined, logId: string, kind: MarkKind, month?: string) =>
  idx?.get(key(logId, kind, month));

export const hasMark = (log: LogEntry, kind: MarkKind, month?: string) =>
  kind === 'form' ? Boolean(log.formReceivedAt?.trim()) : hasBill(log, month);

export const kindLabel = (kind: MarkKind) => (kind === 'form' ? 'Form' : 'Bill');
export const actionLabel = (action: MarkAction) => (action === 'received' ? 'received' : 'not received');
