import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { extractUpacPdf, ExtractedForm } from './pdfExtractor';
import { getEdcIndex, edcIndexSource } from './edcIndex';
import { db, AppUser, verifyPassword } from './db';
import { loadTargets, importTargets, clearTargets } from './targets';
import { fillEdcDocx, sanitizeFilename, normalizeMac } from './docxFiller';

const router = Router();

// Session cookie
const SESSION_COOKIE = 'pace_it_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches db.createSession

function readCookie(req: Request, name: string): string {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); }
      catch { return part.slice(i + 1).trim(); }
    }
  }
  return '';
}

function extractToken(req: Request): string {
  return readCookie(req, SESSION_COOKIE);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure-only when the server really runs HTTPS (or a proxy in front does: COOKIE_SECURE=1).
    // Forcing it on plain HTTP would stop the browser from ever sending the cookie back.
    secure: process.env.PACE_HTTPS === '1' || process.env.COOKIE_SECURE === '1',
    path: '/',
  };
}

// Every change (save, edit, delete, approve...) is written to the database file before the
// response goes back, so the moment the user sees "saved" the data is already on disk.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const end = res.end.bind(res) as (...args: any[]) => Response;
    (res as any).end = (...args: any[]) => {
      try { db.flush(); } catch (err) { console.error('[Pace IT] Flush failed:', err); }
      return end(...args);
    };
  }
  next();
});

// Ensure SQLite database is initialized before serving requests
router.use(async (_req, _res, next) => {
  await db.ready();
  next();
});

// EDC lookups read data/toscrape.xlsx (falls back to data/index.json); see server/edcIndex.ts
function getIndex(): Record<string, any[]> {
  return getEdcIndex();
}

function normalizeKey(value: any): string {
  if (value === null || value === undefined) return '';
  let s = String(value).trim();
  if (/^-?\d+\.0$/.test(s)) {
    s = s.slice(0, -2);
  }
  return s;
}

// Authentication Middleware
export interface AuthenticatedRequest extends Request {
  user?: AppUser;
  token?: string;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const user = db.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
  req.user = user;
  req.token = token;
  next();
}

function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

// Realtime SSE
router.get('/events', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const onChange = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  db.on('change', onChange);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    db.off('change', onChange);
  });
});

// Rate Limiter for Authentication
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
  lastAttempt: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(key: string): { locked: boolean; retryAfterSeconds: number; attempts: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { locked: false, retryAfterSeconds: 0, attempts: 0 };
  if (record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, retryAfterSeconds, attempts: record.attempts };
  }
  if (now - record.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { locked: false, retryAfterSeconds: 0, attempts: 0 };
  }
  return { locked: false, retryAfterSeconds: 0, attempts: record.attempts };
}

function recordFailedLogin(key: string): { locked: boolean; retryAfterSeconds: number; attemptsRemaining: number } {
  const now = Date.now();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: 0, lastAttempt: now };
  record.attempts += 1;
  record.lastAttempt = now;

  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttempts.set(key, record);
    const retryAfterSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000);
    return { locked: true, retryAfterSeconds, attemptsRemaining: 0 };
  }
  loginAttempts.set(key, record);
  return { locked: false, retryAfterSeconds: 0, attemptsRemaining: MAX_LOGIN_ATTEMPTS - record.attempts };
}

function recordSuccessfulLogin(key: string): void {
  loginAttempts.delete(key);
}

function confirmAdminPassword(req: AuthenticatedRequest, res: Response): boolean {
  const password = String(req.body?.password ?? '');
  const key = `admin-confirm:${req.user!.id}`;
  const limit = checkRateLimit(key);
  if (limit.locked) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    res.status(429).json({ error: `Too many wrong passwords. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.` });
    return false;
  }
  const stored = db.getUserById(req.user!.id);
  if (!password || !stored || !verifyPassword(password, stored.password)) {
    const fail = recordFailedLogin(key);
    res.status(403).json({ error: password ? `Incorrect admin password. ${fail.attemptsRemaining} attempt${fail.attemptsRemaining === 1 ? '' : 's'} remaining.` : 'Enter your admin password to continue.' });
    return false;
  }
  recordSuccessfulLogin(key);
  return true;
}

// Authentication
router.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const norm = String(username).trim().toLowerCase().replace(/\s+/g, '_');
    const ip = getClientIp(req);
    const rateLimitKey = `login:${ip}:${norm}`;

    const limitStatus = checkRateLimit(rateLimitKey);
    if (limitStatus.locked) {
      res.setHeader('Retry-After', limitStatus.retryAfterSeconds);
      const minutes = Math.ceil(limitStatus.retryAfterSeconds / 60);
      return res.status(429).json({
        error: `Too many failed login attempts. Temporarily locked for security. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        retryAfter: limitStatus.retryAfterSeconds,
      });
    }

    const user = db.getUserByUsername(norm);
    if (!user || !verifyPassword(String(password), user.password)) {
      const failStatus = recordFailedLogin(rateLimitKey);
      if (failStatus.locked) {
        res.setHeader('Retry-After', failStatus.retryAfterSeconds);
        const minutes = Math.ceil(failStatus.retryAfterSeconds / 60);
        return res.status(429).json({
          error: `Too many failed login attempts. Account temporarily locked for ${minutes} minute${minutes > 1 ? 's' : ''}.`,
          retryAfter: failStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({
        error: `Invalid username or password. ${failStatus.attemptsRemaining} attempt${failStatus.attemptsRemaining === 1 ? '' : 's'} remaining.`,
        attemptsRemaining: failStatus.attemptsRemaining,
      });
    }

    if (user.disabled) {
      return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
    }

    recordSuccessfulLogin(rateLimitKey);

    const token = db.createSession(user.id);

    // Return the FULL profile, exactly what /auth/me will return on the next reload.
    // Missing fields (photo, phone, email) here is why the avatar fell back to initials
    // until the page was refreshed.
    const fresh = db.getUserById(user.id) || user;
    const profile: AppUser = {
      id: fresh.id,
      username: fresh.username,
      displayName: fresh.displayName,
      role: fresh.role,
      phoneNumber: fresh.phoneNumber,
      email: fresh.email,
      photoUrl: fresh.photoUrl,
      disabled: fresh.disabled,
      createdAt: fresh.createdAt,
    };

    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MAX_AGE_MS });
    return res.json({ user: profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

router.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

router.put('/auth/profile', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = db.updateUserProfile(req.user!.id, req.body || {});
    return res.json({ ok: true, user: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Could not update profile.' });
  }
});

router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const token = extractToken(req);
  if (token) db.destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return res.json({ ok: true });
});

router.post('/auth/change-password', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    db.setUserPassword(req.user!.id, password);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/auth/note-password-changed', authMiddleware, (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

// User Management (Admin only)
router.get('/users/avatars', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listUserAvatars());
});

router.get('/users', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listUsers());
});

router.post('/users', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body || {};
    const created = db.createUser(username, password, displayName);
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/users/:id/disable', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { disabled } = req.body;
    db.setUserDisabled(id, Boolean(disabled));
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/admin/users/:id/reset-password', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    db.setUserPassword(id, password);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Logs CRUD
const bootId = Math.random().toString(36).slice(2, 8);
let logsCache: { rev: number; json: Buffer; gzip: Buffer } | null = null;

router.get('/logs', authMiddleware, (req: Request, res: Response) => {
  const rev = db.revision;
  if (!logsCache || logsCache.rev !== rev) {
    const json = Buffer.from(JSON.stringify(db.getLogs()));
    logsCache = { rev, json, gzip: zlib.gzipSync(json, { level: 5 }) };
  }
  const etag = `"logs-${bootId}-${rev}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.end(logsCache.gzip);
  }
  return res.end(logsCache.json);
});

router.post('/logs', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entry, existingId } = req.body || {};
    if (!entry) return res.status(400).json({ error: 'Connection data is required.' });
    const saved = db.saveLog(entry, req.user!, existingId);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/logs/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const fields = req.body && typeof req.body === 'object' ? req.body.fields : null;
    if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'Fields to update are required.' });
    const saved = db.patchLog(req.params.id, fields, req.user!);
    if (!saved) return res.status(404).json({ error: 'Connection not found.' });
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logs/bulk-fill', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { field, items } = req.body || {};
    if (typeof field !== 'string' || !field) return res.status(400).json({ error: 'A field is required.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Nothing to fill.' });
    if (items.length > 5000) return res.status(400).json({ error: 'Too many rows at once (limit 5000).' });
    const result = db.bulkFillField(field, items, req.user!);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logs/fix-upazila', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Select at least one connection.' });
    return res.json({ updated: db.syncUpazilasToTargets(req.user!.displayName, ids.map(String)) });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logs/bulk-term', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, term } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Select at least one connection.' });
    if (ids.length > 10000) return res.status(400).json({ error: 'Too many connections at once (limit 10000).' });
    return res.json(db.bulkSetTerm(ids.map(String), String(term ?? ''), req.user!));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logs/bulk-foreman', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, foremanId } = req.body || {};
    if (typeof foremanId !== 'string' || !foremanId) return res.status(400).json({ error: 'Choose a foreman.' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Select at least one connection.' });
    if (ids.length > 5000) return res.status(400).json({ error: 'Too many connections at once (limit 5000).' });
    return res.json(db.bulkSetForeman(ids.map(String), foremanId, req.user!));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logs/batch', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Array of entries is required.' });
    }
    const saved = db.saveBatchLogs(entries, req.user!);
    return res.json({ saved, count: saved.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// UPAC PDF scanner
router.post('/pdf/scan', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files: { name?: string; data?: string }[] = Array.isArray(req.body.files) ? req.body.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PDF files provided.' });
    }

    const results: ExtractedForm[] = [];
    const errors: { fileName: string; error: string }[] = [];

    for (const item of files) {
      const fileName = item.name || 'document.pdf';
      const base64 = String(item.data || '').replace(/^data:[^;]*;base64,/, '');
      if (!base64) {
        errors.push({ fileName, error: 'Empty file.' });
        continue;
      }
      try {
        results.push(await extractUpacPdf(Buffer.from(base64, 'base64'), fileName));
      } catch (err: any) {
        errors.push({ fileName, error: err?.message || 'Could not read this PDF.' });
      }
    }

    return res.json({ results, errors });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'PDF scan failed.' });
  }
});

router.delete('/logs/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = db.softDeleteLog(id, req.user!);
    return res.json({ ok: success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logs/:id/upac-form', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, data, type, size } = req.body || {};
    if (!data) return res.status(400).json({ error: 'Form data is required.' });
    const updated = db.setUpacForm(id, { name: name || 'UPAC_Form.pdf', data, type, size }, req.user!);
    return res.json({ ok: true, log: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to attach UPAC form.' });
  }
});

router.get('/logs/:id/upac-form', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const upac = db.getUpacForm(id);
    if (!upac) {
      return res.status(404).json({ error: 'No UPAC form attached for this connection.' });
    }

    const mime = upac.type || 'application/pdf';
    const buffer = upac.buffer;
    const filename = sanitizeFilename(upac.name || 'UPAC_Form.pdf');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to download UPAC form.' });
  }
});

router.delete('/logs/:id/upac-form', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updated = db.deleteUpacForm(id, req.user!);
    return res.json({ ok: true, log: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to remove UPAC form.' });
  }
});

// Form / bill received marks and admin approvals
router.get('/approvals', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listApprovals());
});

router.post('/approvals/request', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Nothing to mark.' });
    return res.json(db.requestMarks(items, req.user!));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/approvals/decide', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, all, approve } = req.body || {};
    return res.json(db.decideApprovals({ ids: Array.isArray(ids) ? ids.map(String) : [], all: Boolean(all), approve: approve !== false }, req.user!));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/approvals/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: db.withdrawApproval(req.params.id, req.user!) });
});

router.post('/logs/clear-all', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!confirmAdminPassword(req, res)) return;
    const count = db.softDeleteAllLogs(req.user!);
    return res.json({ cleared: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logs/restore', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { logs, merge, local } = req.body || {};
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'Connections array is required.' });
    const skipPassword = Boolean(local) && Boolean(merge);
    if (!skipPassword && !confirmAdminPassword(req, res)) return;
    const count = db.restoreLogs(logs, Boolean(merge), req.user!);
    return res.json({ total: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Target institutes (Targets tab). Stored in data/targets.json, separate from the connections database.
router.get('/targets', authMiddleware, (_req: Request, res: Response) => {
  return res.json(loadTargets());
});

router.post('/targets/import', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows, replace } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'A list of rows is required.' });
    return res.json(importTargets(rows, { replace: replace === true }));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/targets', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  try {
    return res.json({ cleared: clearTargets() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// CSV import requests
router.get('/import-requests', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const all = db.listImportRequests();
  return res.json(req.user!.role === 'admin' ? all : all.filter((r) => (r.requestedById ? r.requestedById === req.user!.id : r.requestedBy === req.user!.displayName)));
});

router.post('/import-requests', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: 'Nothing to import.' });
    return res.json(db.createImportRequest(entries, req.user!));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/import-requests/:id/decide', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(db.decideImportRequest(req.params.id, req.body?.approve !== false, req.user!));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/import-requests/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: db.withdrawImportRequest(req.params.id, req.user!) });
});

// Foremen CRUD
router.get('/foremen', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getForemen());
});

router.post('/foremen', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const created = db.createForeman(req.body, req.user!);
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/foremen/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = { ...(req.body || {}) };
    // Only an administrator may grant or change the "own broadband" exception.
    if (req.user?.role !== 'admin') {
      delete body.roam;
      delete body.roamAreas;
    }
    const updated = db.updateForeman(id, body);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/foremen/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = db.softDeleteForeman(id, req.user!);
    return res.json({ ok: success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Foreman teams (members working under a foreman)
router.get('/team-members', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getTeamMembers());
});

router.post('/team-members', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(db.createTeamMember(req.body || {}, req.user!));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/team-members/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    return res.json(db.updateTeamMember(req.params.id, req.body || {}));
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/team-members/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ ok: db.softDeleteTeamMember(req.params.id, req.user!) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin Bin
router.get('/bin', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getBin());
});

router.post('/bin/logs/:id/restore', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.restoreBinLog(req.params.id);
  return res.json({ ok });
});

router.post('/bin/foremen/:id/restore', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.restoreBinForeman(req.params.id);
  return res.json({ ok });
});

router.delete('/bin/logs/:id', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.purgeBinLog(req.params.id);
  return res.json({ ok });
});

router.delete('/bin/foremen/:id', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.purgeBinForeman(req.params.id);
  return res.json({ ok });
});

router.delete('/bin', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  const count = db.emptyBin();
  return res.json({ purged: count });
});

// Suggestions
router.get('/suggestions', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getSuggestions());
});

router.post('/suggestions', authMiddleware, (req: Request, res: Response) => {
  try {
    db.saveSuggestions(req.body);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Activity
router.get('/activity', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getActivity());
});

router.post('/activity', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, logNo, customer, detail } = req.body || {};
    db.addActivity({
      by: req.user!.displayName,
      action: action || 'edited',
      logNo,
      customer,
      detail,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Form Maker: Meta, Lookup, and Generate
const FORM_FIELDS = [
  { key: 'name', label: 'প্রতিষ্ঠানের নাম (Institute Name)', default: '' },
  { key: 'mobile', label: 'মোবাইল নাম্বার (Mobile)', default: '' },
  { key: 'union', label: 'ইউনিয়নের নাম (Union)', default: '' },
  { key: 'upazila', label: 'উপজেলা/থানা (Upazila)', default: '' },
  { key: 'source_no', label: 'EDC Book No. / সুত্র নং', default: '' },
  { key: 'connection_nms', label: 'সংযোগ/NMS আইডি', default: '' },
  { key: 'institution_code', label: 'প্রতিষ্টানের কোড (EMIS/EIIN/OTHERS)', default: '' },
  { key: 'lat_long', label: 'Lat & Long', default: '' },
  { key: 'router_serial', label: 'রাউটার সিরিয়াল নাম্বার', default: '' },
  { key: 'router_mac', label: 'MAC address', default: '' },
  { key: 'cable_brand', label: 'Optical Fiber Cable Brand', default: 'BRB' },
  { key: 'cable_qty', label: 'Optical Fiber Cable Qty (meters)', default: '1500' },
];

router.get('/meta', (_req: Request, res: Response) => {
  return res.json({ fields: FORM_FIELDS });
});

router.get('/lookup', authMiddleware, (req: Request, res: Response) => {
  const edcRaw = req.query.edc as string | undefined;
  const key = normalizeKey(edcRaw);
  if (!key) return res.json({ matches: [] });

  const index = getIndex();
  const matches = index[key] || [];
  return res.json({ matches, source: edcIndexSource(), total: Object.keys(index).length });
});

router.post('/generate', authMiddleware, (req: Request, res: Response) => {
  try {
    const { data, date } = req.body || {};
    if (!date) return res.status(400).json({ error: 'Valid date is required.' });

    const normalizedData: Record<string, string> = {};
    for (const field of FORM_FIELDS) {
      const val = data && data[field.key] !== undefined ? String(data[field.key]).trim() : '';
      normalizedData[field.key] = val || field.default;
    }

    if (normalizedData.router_mac) {
      normalizedData.router_mac = normalizeMac(normalizedData.router_mac);
    }

    const docBuffer = fillEdcDocx(normalizedData, date);
    const baseName = sanitizeFilename(normalizedData.connection_nms || normalizedData.source_no || normalizedData.name || 'form');
    const filename = `${baseName}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Filename', encodeURIComponent(filename));
    res.setHeader('X-Mac', normalizedData.router_mac || '');
    return res.send(docBuffer);
  } catch (err: any) {
    console.error('Docx generation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate form.' });
  }
});

export default router;