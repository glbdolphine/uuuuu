import { ActivityEvent, ApprovalRequest, AppUser, ImportRequest, FieldSuggestionsMap, LogEntry, MarkAction, MarkKind, TeamMember, Foreman } from '../types';
import { signOut } from './auth';

async function authFetch(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) {
      try {
        await signOut();
      } catch {
        /* ignore */
      }
    }
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json();
}

// Logs
export async function loadLogs(): Promise<LogEntry[]> {
  return authFetch('/api/logs');
}

export async function saveLog(entry: LogEntry, user: AppUser, existing?: LogEntry | null): Promise<LogEntry> {
  return authFetch('/api/logs', {
    method: 'POST',
    body: JSON.stringify({ entry, existingId: existing?.id }),
  });
}

export async function saveBatchLogs(entries: LogEntry[]): Promise<{ saved: LogEntry[]; count: number }> {
  return authFetch('/api/logs/batch', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function bulkFillField(
  field: string,
  items: { id: string; value: string }[]
): Promise<{ updated: number; unchanged: number; missing: number }> {
  return authFetch('/api/logs/bulk-fill', {
    method: 'POST',
    body: JSON.stringify({ field, items }),
  });
}

export async function fixUpazilas(ids: string[]): Promise<{ updated: number }> {
  return authFetch('/api/logs/fix-upazila', { method: 'POST', body: JSON.stringify({ ids }) });
}

export async function bulkSetTerm(ids: string[], term: string): Promise<{ updated: number; unchanged: number; missing: number }> {
  return authFetch('/api/logs/bulk-term', { method: 'POST', body: JSON.stringify({ ids, term }) });
}

export async function bulkSetForeman(
  ids: string[],
  foremanId: string
): Promise<{ updated: number; unchanged: number; missing: number; foremanName: string }> {
  return authFetch('/api/logs/bulk-foreman', {
    method: 'POST',
    body: JSON.stringify({ ids, foremanId }),
  });
}

export interface ScannedForm {
  fileName: string;
  customerName: string;
  edcNo: string;
  nmsId: string;
  upazila: string;
  unionName: string;
  lat: string;
  long: string;
  routerSerial: string;
  mac: string;
  fiberLength: string;
  headTeacherPhone: string;
  emisEiinDghs?: string;
  date: string;
  confidence: number;
  warnings: string[];
}

export async function scanPdfForms(
  files: { name: string; data: string }[]
): Promise<{ results: ScannedForm[]; errors: { fileName: string; error: string }[] }> {
  return authFetch('/api/pdf/scan', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export async function deleteLog(id: string, _user?: AppUser): Promise<void> {
  await authFetch(`/api/logs/${id}`, { method: 'DELETE' });
}

export async function clearAllLogs(password: string): Promise<void> {
  await authFetch('/api/logs/clear-all', { method: 'POST', body: JSON.stringify({ password }) });
}

export async function restoreLogs(imported: LogEntry[], merge: boolean, _user: AppUser, password?: string, local = false): Promise<number> {
  const res = await authFetch('/api/logs/restore', {
    method: 'POST',
    body: JSON.stringify({ logs: imported, merge, password, local }),
  });
  return res.total;
}

// CSV import requests (normal users ask, the admin approves)
export async function loadImportRequests(): Promise<ImportRequest[]> {
  return authFetch('/api/import-requests');
}

export async function requestImport(entries: LogEntry[]): Promise<ImportRequest> {
  return authFetch('/api/import-requests', { method: 'POST', body: JSON.stringify({ entries }) });
}

export async function decideImportRequest(id: string, approve: boolean): Promise<{ status: string; saved: number }> {
  return authFetch(`/api/import-requests/${encodeURIComponent(id)}/decide`, { method: 'POST', body: JSON.stringify({ approve }) });
}

export async function withdrawImportRequest(id: string): Promise<void> {
  await authFetch(`/api/import-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function importLocalBrowserData(user: AppUser): Promise<number> {
  const raw = localStorage.getItem('pace_it_logs_v1');
  if (!raw) return 0;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) return 0;
  return restoreLogs(parsed, true, user, undefined, true);
}

// Foremen
export async function loadForemen(): Promise<Foreman[]> {
  return authFetch('/api/foremen');
}

export async function createForeman(input: { name: string; area: string; phone: string; photoUrl?: string }, _user: AppUser): Promise<Foreman> {
  return authFetch('/api/foremen', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateForeman(id: string, input: { name: string; area: string; phone: string; active: boolean; photoUrl?: string; roam?: boolean; roamAreas?: string[] }): Promise<void> {
  await authFetch(`/api/foremen/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteForeman(id: string): Promise<void> {
  await authFetch(`/api/foremen/${id}`, { method: 'DELETE' });
}

// Foreman teams (members working under a foreman)
export async function loadTeamMembers(): Promise<TeamMember[]> {
  return authFetch('/api/team-members');
}

export async function createTeamMember(input: { foremanId: string; name: string; phone: string; role: string }): Promise<TeamMember> {
  return authFetch('/api/team-members', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateTeamMember(id: string, input: { name: string; phone: string; role: string; active: boolean }): Promise<void> {
  await authFetch(`/api/team-members/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteTeamMember(id: string): Promise<void> {
  await authFetch(`/api/team-members/${id}`, { method: 'DELETE' });
}

// UPAC Form Attachments
export async function attachUpacForm(logId: string, form: { name: string; data: string; type?: string; size?: number }): Promise<LogEntry> {
  const res = await authFetch(`/api/logs/${encodeURIComponent(logId)}/upac-form`, {
    method: 'POST',
    body: JSON.stringify(form),
  });
  return res.log;
}

export async function deleteUpacForm(logId: string): Promise<LogEntry> {
  const res = await authFetch(`/api/logs/${encodeURIComponent(logId)}/upac-form`, {
    method: 'DELETE',
  });
  return res.log;
}

export function downloadUpacForm(log: LogEntry): void {
  const filename = log.upacFormName || `UPAC_Log_${log.logNo || log.id}.pdf`;
  if (log.upacFormData) {
    const link = document.createElement('a');
    link.href = log.upacFormData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const link = document.createElement('a');
    link.href = `/api/logs/${encodeURIComponent(log.id)}/upac-form`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Suggestions
export async function loadSuggestions(): Promise<FieldSuggestionsMap> {
  return authFetch('/api/suggestions');
}

export async function saveSuggestions(suggestions: FieldSuggestionsMap): Promise<void> {
  await authFetch('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(suggestions),
  });
}

export async function harvestSuggestions(_entry: Partial<LogEntry>): Promise<FieldSuggestionsMap> {
  return loadSuggestions();
}

// Activity
export async function loadActivity(): Promise<ActivityEvent[]> {
  return authFetch('/api/activity');
}

export async function addCloudActivity(event: Omit<ActivityEvent, 'id' | 'at'>): Promise<void> {
  await authFetch('/api/activity', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

// Admin User Management
export async function loadUserAvatars(): Promise<{ displayName: string; photoUrl: string }[]> {
  return authFetch('/api/users/avatars');
}

export async function listUsers(): Promise<any[]> {
  return authFetch('/api/users');
}

export async function createUserAccount(_accessToken: string, username: string, password: string, displayName: string) {
  return authFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, displayName }),
  });
}

export async function disableUserAccount(_accessToken: string, userId: string, disabled: boolean) {
  return authFetch(`/api/users/${userId}/disable`, {
    method: 'POST',
    body: JSON.stringify({ disabled }),
  });
}

export async function resetUserPassword(userId: string, password: string) {
  return authFetch(`/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function notePasswordChanged(): Promise<void> {
  try {
    await authFetch('/api/auth/note-password-changed', { method: 'POST' });
  } catch {
    /* ignore */
  }
}

// Form / bill received marks and admin approvals
export async function loadApprovals(): Promise<ApprovalRequest[]> {
  return authFetch('/api/approvals');
}

export async function requestMarks(
  items: { logId: string; kind: MarkKind; action: MarkAction; month?: string; receivedOn?: string; move?: boolean }[]
): Promise<{ applied: number; queued: number; skipped: number }> {
  return authFetch('/api/approvals/request', { method: 'POST', body: JSON.stringify({ items }) });
}

export async function decideApprovals(opts: { ids?: string[]; all?: boolean; approve: boolean }): Promise<{ approved: number; rejected: number }> {
  return authFetch('/api/approvals/decide', { method: 'POST', body: JSON.stringify(opts) });
}

export async function withdrawApproval(id: string): Promise<void> {
  await authFetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Admin Bin
export async function loadBin(): Promise<{ logs: LogEntry[]; foremen: Foreman[] }> {
  return authFetch('/api/bin');
}

export async function restoreBinLog(id: string) {
  return authFetch(`/api/bin/logs/${id}/restore`, { method: 'POST' });
}

export async function restoreBinForeman(id: string) {
  return authFetch(`/api/bin/foremen/${id}/restore`, { method: 'POST' });
}

export async function purgeBinLog(id: string) {
  return authFetch(`/api/bin/logs/${id}`, { method: 'DELETE' });
}

export async function purgeBinForeman(id: string) {
  return authFetch(`/api/bin/foremen/${id}`, { method: 'DELETE' });
}

export async function emptyBin(): Promise<number> {
  const res = await authFetch('/api/bin', { method: 'DELETE' });
  return res.purged || 0;
}

// Realtime SSE & Office Sync
export function subscribeToCloud(
  onLogs: () => void,
  onActivity: () => void,
  onSuggestions: () => void,
  onForemen?: () => void,
  onApprovals?: () => void,
  onImports?: () => void
): () => void {
  let eventSource: EventSource | null = null;
  let intervalId: any = null;

  const timers: Record<string, any> = {};
  const fire = (type: string, fn?: () => void) => {
    if (!fn) return;
    clearTimeout(timers[type]);
    timers[type] = setTimeout(fn, 300);
  };

  try {
    // Same-origin SSE sends the HttpOnly cookie automatically.
    eventSource = new EventSource('/api/events', { withCredentials: true });
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'logs') fire('logs', onLogs);
        else if (data.type === 'activity') fire('activity', onActivity);
        else if (data.type === 'suggestions') fire('suggestions', onSuggestions);
        else if (data.type === 'foremen') fire('foremen', onForemen);
        else if (data.type === 'approvals') fire('approvals', onApprovals);
        else if (data.type === 'imports') fire('imports', onImports);
      } catch {
        /* ignore */
      }
    };
    eventSource.onerror = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          onLogs();
          onActivity();
          onApprovals?.();
          onImports?.();
        }, 8000);
      }
    };
  } catch {
    intervalId = setInterval(() => {
      onLogs();
      onActivity();
    }, 5000);
  }

  return () => {
    if (eventSource) eventSource.close();
    if (intervalId) clearInterval(intervalId);
    Object.values(timers).forEach((t) => clearTimeout(t));
  };
}

// Kept so files that still import getAccessToken from here keep compiling.
export { getAccessToken } from './auth';

// Silent autosave
export async function patchLog(id: string, fields: Partial<LogEntry>, opts: { keepalive?: boolean } = {}): Promise<LogEntry> {
  return authFetch(`/api/logs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
    keepalive: opts.keepalive,
  });
}
// Target institutes (stored in data/targets.json on the server, not in the connections database)
export interface TargetImportResult { added: number; updated: number; unchanged: number; skipped: number; removed: number; total: number }

export async function loadTargets(): Promise<import('./targetNorm').TargetInstitute[]> {
  return authFetch('/api/targets');
}

export async function importTargetRows(rows: import('./targetNorm').TargetInstitute[], replace = false): Promise<TargetImportResult> {
  return authFetch('/api/targets/import', { method: 'POST', body: JSON.stringify({ rows, replace }) });
}

export async function clearTargetList(): Promise<{ cleared: number }> {
  return authFetch('/api/targets', { method: 'DELETE' });
}
