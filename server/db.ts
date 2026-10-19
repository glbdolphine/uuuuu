import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { targetUpazilaMap, edcNorm } from './targets';
import { upazilaKey, splitLegacyName, foremanLogName, foremanServes } from '../src/utils/upazilas';
import { resolveCategory, displayCategory, stripCategoryNumber } from '../src/utils/category';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';

type SqlValue = string | number | null | Uint8Array;

class NativeDb {
  constructor(public readonly raw: DatabaseSync) {}

  private bind(params?: unknown[]): SqlValue[] {
    return (params || []).map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlValue)));
  }

  run(sql: string, params?: unknown[]): void {
    if (!params || params.length === 0) {
      this.raw.exec(sql); // also handles several statements in one string
      return;
    }
    this.raw.prepare(sql).run(...this.bind(params));
  }

  exec(sql: string, params?: unknown[]): { columns: string[]; values: SqlValue[][] }[] {
    const stmt = this.raw.prepare(sql);
    const columns = stmt.columns().map((c) => c.name);
    if (!columns.length) {
      stmt.run(...this.bind(params)); // INSERT / UPDATE / DDL: nothing to read back
      return [];
    }
    stmt.setReturnArrays(true);
    const values = stmt.all(...this.bind(params)) as unknown as SqlValue[][];
    if (!values.length) return [];
    return [{ columns, values }];
  }

  pragma(name: string): unknown {
    const row = this.raw.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] : undefined;
  }
}

function parseRoamAreas(v: unknown): string[] {
  return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  phoneNumber?: string;
  email?: string;
  photoUrl?: string;
  disabled?: boolean;
  createdAt?: string;
}

export interface StoredUser extends AppUser {
  password: string;
}

export interface LogChange {
  at: string;
  by: string;
  action: 'created' | 'edited';
  changes?: { field: string; from: string; to: string }[];
}

export interface LogEntry {
  id: string;
  logNo: number | string;
  date: string;
  foremanName: string;
  requestType: string;
  customerName: string;
  nmsId: string;
  issueFound: string;
  missingWrongDetails: string;
  actionTaken: string;
  reasonForAction: string;
  foremanInformed: string;
  followUpNeeded: string;
  status: string;
  supervisorInformed: string;
  remarks: string;
  mac: string;
  edcNo?: string;
  emisEiinDghs?: string;
  routerSerial?: string;
  formReceivedAt?: string;
  billReceivedAt?: string;
  billMonths?: string[];
  term?: string;
  foremanId?: string;
  followUpDate?: string;
  foremanPhone?: string;
  headTeacherName?: string;
  headTeacherPhone?: string;
  lat?: string;
  long?: string;
  unionName?: string;
  upazila?: string;
  fiberLength?: string;
  category?: string;
  nameBn?: string; // institute name in Bangla (shown in logs)
  nameEn?: string; // institute name in English (kept for reference only)
  upacFormName?: string;
  upacFormData?: string;
  upacFormType?: string;
  upacFormSize?: number;
  upacFormUploadedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  history?: LogChange[];
}

export type MarkKind = 'form' | 'bill';
export type MarkAction = 'received' | 'not_received';

export interface ImportRequest {
  id: string;
  requestedBy: string;
  requestedById?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  count: number;
  sample?: string;
}

export interface ApprovalRequest {
  id: string;
  logId: string;
  logNo?: number | string;
  customer?: string;
  kind: MarkKind;
  action: MarkAction;
  requestedBy: string;
  requestedById?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  month?: string;
  receivedOn?: string;
}

export interface Foreman {
  id: string;
  name: string;
  area: string;
  phone: string;
  photoUrl?: string;
  active: boolean;
  roam?: boolean;
  roamAreas?: string[];
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface TeamMember {
  id: string;
  foremanId: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  by: string;
  action: 'created' | 'edited' | 'deleted' | 'cleared' | 'restored' | 'user_created' | 'user_disabled' | 'user_enabled' | 'purged' | 'password_reset';
  logNo?: number | string;
  customer?: string;
  detail?: string;
}

export type LogFieldKey =
  | 'foremanName'
  | 'foremanPhone'
  | 'requestType'
  | 'customerName'
  | 'nmsId'
  | 'issueFound'
  | 'missingWrongDetails'
  | 'actionTaken'
  | 'reasonForAction'
  | 'foremanInformed'
  | 'followUpNeeded'
  | 'status'
  | 'supervisorInformed'
  | 'remarks'
  | 'mac';

export type FieldSuggestionsMap = Record<LogFieldKey, string[]>;

export const INITIAL_SUGGESTIONS: FieldSuggestionsMap = {
  foremanName: ['Shabul- Balaganj', 'Rahman- Sylhet Sadar', 'Kabir- Beanibazar', 'Alam- Golapganj', 'Faruk- Biswanath'],
  foremanPhone: ['+880 1680-945894', '+880 1711-234567', '+880 1912-345678'],
  requestType: ['New User ID', 'Form Submission', 'Bandwidth Upgrade', 'Router Relocation', 'Profile Modification', 'MAC Binding Reset', 'IP Address Re-assignment'],
  customerName: ['Hasampur Govt. Primary School', 'Radhakona Govt. Primary School', 'Sreemangal Model High School', 'Balaganj Technical Institute'],
  nmsId: [],
  issueFound: ['Same router at two institute', 'MAC address collision in NMS', 'Incorrect package assigned', 'Port link down on OLT', 'VLAN mismatch at foreman switch'],
  missingWrongDetails: ['They previously used the same router in Radhakona Govt. Primary School', 'National ID card copy missing from form', 'Phone number mismatch on application form', 'Previous billing clearance pending'],
  actionTaken: ['Provided the id/form as requested but kept nms entry on hold', 'Created user ID in NMS and notified foreman via WhatsApp', 'Updated MAC binding in authentication server', 'Forwarded ticket to Core NOC team for IP remapping'],
  reasonForAction: ["I did not entry this school in nms because nms doesn't allow two school with same router.", 'Awaiting confirmation of router decommissioning from previous site.', 'Verified payment voucher with accounts before activating profile.'],
  foremanInformed: ['Yes - phone', 'Yes - WhatsApp', 'Yes - email', 'Yes - in-person', 'No - unanswered phone call', 'No - SMS sent'],
  followUpNeeded: ['Yes', 'No', 'Pending foreman callback', 'Pending supervisor review'],
  status: ['Pending - waiting for foreman', 'In Progress', 'Resolved', 'Escalated to Core Team', 'On Hold', 'Closed'],
  supervisorInformed: ['I informed my superiors', 'Approved by Team Lead', 'Informed Operations Manager', 'Escalated to Duty Manager', 'No approval needed (standard request)'],
  remarks: ['Foreman said Radhakona Govt. Primary School is not using the network or the router anymore. So they decided to use it for another school.', 'Foreman promised to submit the formal decommissioning request by tomorrow.', 'Client requested urgent activation before morning classes.'],
  mac: ['20:23:51:78:49:F4', '44:D9:E7:2B:1A:08', 'E4:5F:01:8C:3D:A2'],
};

// Password hashing (scrypt, per-user random salt). Stored as  scrypt$N$salt$hash  (hex).
// Plain-text passwords are never stored; the original cannot be read back, only reset.
const SCRYPT_N = 16384;
const HASH_PREFIX = 'scrypt$';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N });
  return `${HASH_PREFIX}${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function isPasswordHash(stored: string): boolean {
  return stored.startsWith(HASH_PREFIX);
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !isPasswordHash(stored)) return false;
  const [, n, saltHex, hashHex] = stored.split('$');
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join('');
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DB_DIR, 'pace_it.sqlite');
const ATTACH_DIR = path.join(DB_DIR, 'files', 'upac'); // attached UPAC forms live here as plain files, not inside the database
const BACKUP_DIR = path.join(DB_DIR, 'backups');

function attachFile(logId: string): string {
  return path.join(ATTACH_DIR, String(logId).replace(/[^A-Za-z0-9_-]/g, '_'));
}

function decodeAttachment(data: string): Buffer {
  const m = data.match(/^data:[^;,]*;base64,(.*)$/s);
  return Buffer.from(m ? m[1] : data, 'base64');
}
const JSON_LEGACY_FILE = path.join(DB_DIR, 'pace_it_db.json');
const SECRET_FILE = path.join(DB_DIR, 'pace_it_secret.key');

function getOrGenerateSecret(): string {
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const s = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (s) return s;
    } catch {
      /* fallback */
    }
  }
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, newSecret, 'utf-8');
  } catch {
    /* non-fatal */
  }
  return newSecret;
}

const LEGACY_KEY_MAP: Record<string, string> = {
  resellerName: 'foremanName', reseller_name: 'foremanName',
  resellerPhone: 'foremanPhone', reseller_phone: 'foremanPhone',
  resellerInformed: 'foremanInformed', reseller_informed: 'foremanInformed',
  resellerId: 'foremanId', reseller_id: 'foremanId',
};
export function upgradeLegacyLog<T = any>(o: T): T {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
  const src: any = o;
  const out: any = { ...src };
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (oldKey in out) {
      if (out[newKey] === undefined || out[newKey] === null || out[newKey] === '') out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  if (Array.isArray(out.history)) {
    out.history = out.history.map((h: any) => (h && Array.isArray(h.changes)
      ? { ...h, changes: h.changes.map((c: any) => (c && LEGACY_KEY_MAP[c.field] ? { ...c, field: LEGACY_KEY_MAP[c.field] } : c)) }
      : h));
  }
  if (src.data && typeof src.data === 'object') out.data = upgradeLegacyLog(src.data);
  return out as T;
}

class SQLiteDatabase extends EventEmitter {
  private sqlite!: NativeDb;
  private secret: string = getOrGenerateSecret();
  private initialized = false;
  private initPromise: Promise<void>;

  constructor() {
    super();
    this.initPromise = this.init();
  }

  public async ready(): Promise<void> {
    return this.initPromise;
  }

  private async init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.sqlite = new NativeDb(this.openNative());

    this.migrateResellerSchemaToForeman();
    this.createTables();
    this.autoMigrateExistingLogs();
    this.migrateForemanUpazilas();
    this.migrateForemanWording();
    this.removePopFeature();
    this.seedAllForemen();
    this.sqlite.raw.exec('PRAGMA journal_mode = WAL');
    this.initialized = true;
  }

  private openNative(): DatabaseSync {
    const open = (file: string) => {
      const d = new DatabaseSync(file);
      d.exec('PRAGMA busy_timeout = 5000');
      d.exec('PRAGMA synchronous = FULL');
      d.exec('PRAGMA foreign_keys = OFF'); // keep the same behaviour the app always had
      const chk = (d.prepare('PRAGMA quick_check').get() as Record<string, unknown>)?.quick_check;
      if (chk !== 'ok') {
        d.close();
        throw new Error(`SQLite quick_check failed: ${chk}`);
      }
      return d;
    };
    try {
      return open(SQLITE_FILE);
    } catch (err) {
      console.error('[Pace IT] Failed to open the database:', err);
      // Never silently start with an empty database over real data: stop and let the owner decide.
      if (fs.existsSync(SQLITE_FILE) && fs.statSync(SQLITE_FILE).size > 0) {
        throw new Error('The database file exists but could not be opened. It has NOT been modified. Restore from data/backups.');
      }
      return open(SQLITE_FILE);
    }
  }

  private createTables() {
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        phone_number TEXT,
        email TEXT,
        photo_url TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        log_no INTEGER NOT NULL,
        date TEXT NOT NULL,
        foreman_name TEXT NOT NULL,
        caller_phone TEXT,
        request_type TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        nms_id TEXT,
        issue_found TEXT,
        missing_wrong_details TEXT,
        action_taken TEXT,
        reason_for_action TEXT,
        foreman_informed TEXT,
        follow_up_needed TEXT,
        status TEXT NOT NULL,
        supervisor_informed TEXT,
        remarks TEXT,
        mac TEXT,
        edc_no TEXT,
        emis_eiin_dghs TEXT,
        router_serial TEXT,
        form_received_at TEXT,
        foreman_id TEXT,
        follow_up_date TEXT,
        foreman_phone TEXT,
        head_teacher_name TEXT,
        head_teacher_phone TEXT,
        lat TEXT,
        long TEXT,
        union_name TEXT,
        upazila TEXT,
        fiber_length TEXT,
        category TEXT,
        name_bn TEXT,
        name_en TEXT,
        bill_received_at TEXT,
        upac_form_name TEXT,
        upac_form_data TEXT,
        upac_form_type TEXT,
        upac_form_size INTEGER,
        upac_form_uploaded_at TEXT,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        history TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_logs_deleted ON logs(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_logs_no ON logs(log_no);

      CREATE TABLE IF NOT EXISTS foremen (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        area TEXT,
        phone TEXT,
        photo_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        roam INTEGER NOT NULL DEFAULT 0,
        roam_areas TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        deleted_by TEXT
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY,
        foreman_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        deleted_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_team_members_foreman ON team_members(foreman_id);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        log_id TEXT NOT NULL,
        log_no TEXT,
        customer TEXT,
        kind TEXT NOT NULL,
        action TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by TEXT,
        decided_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

      CREATE TABLE IF NOT EXISTS import_requests (
        id TEXT PRIMARY KEY,
        requested_by TEXT NOT NULL,
        requested_by_id TEXT,
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by TEXT,
        decided_at TEXT,
        entry_count INTEGER NOT NULL DEFAULT 0,
        sample TEXT,
        payload TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_import_requests_status ON import_requests(status);

      CREATE TABLE IF NOT EXISTS suggestions (
        field TEXT PRIMARY KEY,
        values_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        by_user TEXT NOT NULL,
        action TEXT NOT NULL,
        log_no TEXT,
        customer TEXT,
        detail TEXT
      );
    `);

    // Migrate any missing columns in logs table
    try {
      const tableInfo = this.sqlite.exec("PRAGMA table_info(logs)");
      if (tableInfo.length > 0 && tableInfo[0].values) {
        const colNames = new Set(tableInfo[0].values.map((v) => String(v[1])));
        const columnsToAdd: [string, string][] = [
          ['foreman_phone', 'TEXT'],
          ['head_teacher_name', 'TEXT'],
          ['head_teacher_phone', 'TEXT'],
          ['lat', 'TEXT'],
          ['long', 'TEXT'],
          ['union_name', 'TEXT'],
          ['upazila', 'TEXT'],
          ['fiber_length', 'TEXT'],
          ['category', 'TEXT'],
          ['name_bn', 'TEXT'],
          ['name_en', 'TEXT'],
          ['emis_eiin_dghs', 'TEXT'],
          ['bill_received_at', 'TEXT'],
          ['bill_months', 'TEXT'],
          ['term', 'TEXT'],
          ['upac_form_name', 'TEXT'],
          ['upac_form_data', 'TEXT'],
          ['upac_form_type', 'TEXT'],
          ['upac_form_size', 'INTEGER'],
          ['upac_form_uploaded_at', 'TEXT'],
        ];
        for (const [cName, cType] of columnsToAdd) {
          if (!colNames.has(cName)) {
            this.sqlite.run(`ALTER TABLE logs ADD COLUMN ${cName} ${cType}`);
          }
        }
      }
    } catch (migErr) {
      console.warn('[Pace IT] Column migration notice:', migErr);
    }

    // Migrate any missing columns in users table
    try {
      const uInfo = this.sqlite.exec("PRAGMA table_info(users)");
      if (uInfo.length > 0 && uInfo[0].values) {
        const uCols = new Set(uInfo[0].values.map((v) => String(v[1])));
        const uColsToAdd: [string, string][] = [
          ['phone_number', 'TEXT'],
          ['email', 'TEXT'],
          ['photo_url', 'TEXT'],
        ];
        for (const [cName, cType] of uColsToAdd) {
          if (!uCols.has(cName)) {
            this.sqlite.run(`ALTER TABLE users ADD COLUMN ${cName} ${cType}`);
          }
        }
      }
    } catch (uErr) {
      console.warn('[Pace IT] Users column migration notice:', uErr);
    }

    // Older databases declared foremen.name UNIQUE, which stops two foremen (e.g. in different
    // upazilas) from sharing a name. Rebuild the table without that constraint (data is copied as-is).
    try {
      const idx = this.sqlite.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='foremen'");
      const ddl = idx.length && idx[0].values.length ? String(idx[0].values[0][0] || '') : '';
      if (/name\s+TEXT\s+UNIQUE/i.test(ddl)) {
        const cols = new Set(this.sqlite.exec('PRAGMA table_info(foremen)')[0].values.map((v) => String(v[1])));
        const want = ['id', 'name', 'area', 'phone', 'photo_url', 'active', 'roam', 'roam_areas', 'created_at', 'deleted_at', 'deleted_by'];
        const shared = want.filter((c) => cols.has(c)).join(', ');
        try {
          if (fs.existsSync(SQLITE_FILE)) fs.copyFileSync(SQLITE_FILE, `${SQLITE_FILE}.before-foreman-unique`);
        } catch {
          /* non-fatal */
        }
        this.sqlite.run('BEGIN');
        try {
          this.sqlite.run(`CREATE TABLE foremen_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            area TEXT,
            phone TEXT,
            photo_url TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            roam INTEGER NOT NULL DEFAULT 0,
            roam_areas TEXT,
            created_at TEXT NOT NULL,
            deleted_at TEXT,
            deleted_by TEXT
          )`);
          this.sqlite.run(`INSERT INTO foremen_new (${shared}) SELECT ${shared} FROM foremen`);
          this.sqlite.run('DROP TABLE foremen');
          this.sqlite.run('ALTER TABLE foremen_new RENAME TO foremen');
          this.sqlite.run('COMMIT');
          console.log('[Pace IT] Foremen table rebuilt: same name is now allowed in different upazilas.');
        } catch (e) {
          this.sqlite.run('ROLLBACK');
          throw e;
        }
      }
    } catch (uqErr) {
      console.warn('[Pace IT] Foremen unique-name migration notice:', uqErr);
    }

    // Migrate any missing columns in foremen table
    try {
      const rInfo = this.sqlite.exec("PRAGMA table_info(foremen)");
      if (rInfo.length > 0 && rInfo[0].values) {
        const rCols = new Set(rInfo[0].values.map((v) => String(v[1])));
        if (!rCols.has('photo_url')) {
          this.sqlite.run('ALTER TABLE foremen ADD COLUMN photo_url TEXT');
        }
        if (!rCols.has('roam')) {
          this.sqlite.run('ALTER TABLE foremen ADD COLUMN roam INTEGER NOT NULL DEFAULT 0');
        }
        if (!rCols.has('roam_areas')) {
          this.sqlite.run('ALTER TABLE foremen ADD COLUMN roam_areas TEXT');
        }
      }
    } catch (rErr) {
      console.warn('[Pace IT] Foremen column migration notice:', rErr);
    }

    // Approvals remember which receiving month a mark belongs to.
    try {
      const ai = this.sqlite.exec('PRAGMA table_info(approvals)');
      const aCols = new Set(ai.length ? ai[0].values.map((v) => String(v[1])) : []);
      if (!aCols.has('month')) this.sqlite.run('ALTER TABLE approvals ADD COLUMN month TEXT');
      if (!aCols.has('received_on')) this.sqlite.run('ALTER TABLE approvals ADD COLUMN received_on TEXT');
      if (!aCols.has('requested_by_id')) this.sqlite.run('ALTER TABLE approvals ADD COLUMN requested_by_id TEXT');
    } catch (monthErr) {
      console.warn('[Pace IT] Approvals month column notice:', monthErr);
    }

    // One-time: the 162 bills received so far were the September 2026 bills (PRAGMA user_version 3).
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 3) {
        this.sqlite.run("UPDATE logs SET bill_months = '[\"2026-09\"]' WHERE bill_received_at IS NOT NULL AND bill_received_at <> '' AND bill_months IS NULL");
        this.sqlite.run('PRAGMA user_version = 3');
        this.scheduleSave();
      }
    } catch (tagErr) {
      console.warn('[Pace IT] Receiving-month backfill notice:', tagErr);
    }

    // One-time (PRAGMA user_version 4): Degree Colleges belong under National University.
    // Only logs still on the old automatic result (Secondary Education / no category) are moved.
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 4) {
        const rows = this.sqlite.exec("SELECT id, customer_name, name_bn, name_en, category FROM logs WHERE category IS NULL OR category = '' OR category LIKE '%Secondary Education%'");
        for (const [id, customerName, nameBn, nameEn, category] of rows.length ? rows[0].values : []) {
          const next = resolveCategory({
            customerName: customerName ? String(customerName) : '',
            nameBn: nameBn ? String(nameBn) : '',
            nameEn: nameEn ? String(nameEn) : '',
            category: category ? String(category) : '',
          });
          if (next === 'National University' && next !== stripCategoryNumber(category ? String(category) : '')) {
            this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [next, String(id)]);
          }
        }
        this.sqlite.run('PRAGMA user_version = 4');
        this.scheduleSave();
      }
    } catch (degErr) {
      console.warn('[Pace IT] Degree college category notice:', degErr);
    }

    // Backfill: store the auto-detected category (no numbering) on every existing log.
    try {
      // Runs once (PRAGMA user_version), so later manual fixes are never overwritten.
      const ver = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      const rows = ver < 2 ? this.sqlite.exec('SELECT id, customer_name, name_bn, name_en, category FROM logs') : [];
      if (ver < 2) this.sqlite.run('PRAGMA user_version = 2');
      if (rows.length) {
        for (const [id, customerName, nameBn, nameEn, category] of rows[0].values) {
          const next = resolveCategory({
            customerName: customerName ? String(customerName) : '',
            nameBn: nameBn ? String(nameBn) : '',
            nameEn: nameEn ? String(nameEn) : '',
            category: category ? String(category) : '',
          });
          if (next && next !== (category ? String(category) : '')) {
            this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [next, String(id)]);
          }
        }
      }
    } catch (catErr) {
      console.warn('[Pace IT] Category backfill notice:', catErr);
    }

    // One-time (PRAGMA user_version 5): "Secondary Education" became "Secondary and Higher Secondary Education",
    // and Technical Education / Ministry of Law were added. Every stored record is updated here.
    // Records still on the old automatic Secondary result (or no category) whose name is clearly Technical / Law move there;
    // categories someone picked by hand (Primary, Health...) are never touched.
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 5) {
        const rows = this.sqlite.exec("SELECT id, customer_name, name_bn, name_en, category FROM logs");
        for (const [id, customerName, nameBn, nameEn, category] of rows.length ? rows[0].values : []) {
          const raw = category ? String(category) : '';
          const current = stripCategoryNumber(raw); // already maps the old Secondary name to the new one
          let next = current;
          if (!current || current === 'Secondary and Higher Secondary Education') {
            const detected = resolveCategory({
              customerName: customerName ? String(customerName) : '',
              nameBn: nameBn ? String(nameBn) : '',
              nameEn: nameEn ? String(nameEn) : '',
              category: '',
            });
            if (detected === 'Technical Education' || detected === 'Ministry of Law') next = detected;
          }
          if (next && next !== raw) this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [next, String(id)]);
        }
        this.sqlite.run('PRAGMA user_version = 5');
        this.scheduleSave();
      }
    } catch (secErr) {
      console.warn('[Pace IT] Category rename notice:', secErr);
    }

    // One-time (PRAGMA user_version 6): Department of Social Services and Diabetic Association of Bangladesh were added.
    // Records still on an automatic result (no category, Secondary, Health Service) whose name clearly matches move there;
    // categories someone picked by hand are never touched.
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 6) {
        const rows = this.sqlite.exec("SELECT id, customer_name, name_bn, name_en, category FROM logs");
        for (const [id, customerName, nameBn, nameEn, category] of rows.length ? rows[0].values : []) {
          const current = stripCategoryNumber(category ? String(category) : '');
          if (current && current !== 'Secondary and Higher Secondary Education' && current !== 'Health Service') continue;
          const detected = resolveCategory({
            customerName: customerName ? String(customerName) : '',
            nameBn: nameBn ? String(nameBn) : '',
            nameEn: nameEn ? String(nameEn) : '',
            category: '',
          });
          if (detected === 'Department of Social Services' || detected === 'Diabetic Association of Bangladesh') {
            this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [detected, String(id)]);
          }
        }
        this.sqlite.run('PRAGMA user_version = 6');
        this.scheduleSave();
      }
    } catch (socErr) {
      console.warn('[Pace IT] Social Services / Diabetic category notice:', socErr);
    }

    // One-time backfill: keep the existing institute name in the right-language field.
    try {
      const rows = this.sqlite.exec("SELECT id, customer_name FROM logs WHERE (name_bn IS NULL OR name_bn = '') AND (name_en IS NULL OR name_en = '') AND customer_name <> ''");
      if (rows.length) {
        for (const [id, nm] of rows[0].values) {
          const name = String(nm);
          const isBangla = /[\u0980-\u09FF]/.test(name);
          this.sqlite.run(`UPDATE logs SET ${isBangla ? 'name_bn' : 'name_en'} = ? WHERE id = ?`, [name, String(id)]);
        }
      }
    } catch (bfErr) {
      console.warn('[Pace IT] Institute name backfill notice:', bfErr);
    }

    // Indexes for fast lookups once there are thousands of records
    for (const [name, col] of [
      ['idx_logs_nms', 'nms_id'],
      ['idx_logs_edc', 'edc_no'],
      ['idx_logs_foreman', 'foreman_id'],
      ['idx_logs_created', 'created_at'],
      ['idx_logs_status', 'status'],
      ['idx_logs_upazila', 'upazila'],
      ['idx_logs_category', 'category'],
    ]) {
      try {
        this.sqlite.run(`CREATE INDEX IF NOT EXISTS ${name} ON logs(${col})`);
      } catch (idxErr) {
        console.warn(`[Pace IT] Could not create index ${name}:`, idxErr);
      }
    }

    // Older databases kept passwords as plain text: hash every one of them, once.
    try {
      const rows = this.sqlite.exec('SELECT id, password FROM users');
      let migrated = 0;
      for (const [id, pw] of rows[0]?.values ?? []) {
        if (!isPasswordHash(String(pw))) {
          this.sqlite.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(String(pw)), String(id)]);
          migrated++;
        }
      }
      if (migrated) console.log(`[Pace IT] Secured ${migrated} account password${migrated === 1 ? '' : 's'} (plain text -> scrypt hash).`);
    } catch (pwErr) {
      console.warn('[Pace IT] Password migration notice:', pwErr);
    }

    // Ensure an admin exists. A brand-new install gets a random password, printed once here.
    const adminCheck = this.sqlite.exec("SELECT id FROM users WHERE username = 'admin'");
    if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
      const first = randomPassword();
      this.sqlite.run(
        'INSERT INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), 'admin', 'Administrator', hashPassword(first), 'admin', 0, new Date().toISOString()]
      );
      console.log('\n[Pace IT] ================================================================');
      console.log('[Pace IT]  First run: administrator account created.');
      console.log(`[Pace IT]  Username: admin    Password: ${first}`);
      console.log('[Pace IT]  Write it down and change it after signing in. It is not shown again.');
      console.log('[Pace IT] ================================================================\n');
    } else {
      const a = this.sqlite.exec("SELECT password FROM users WHERE username = 'admin'");
      const stored = String(a[0]?.values[0]?.[0] ?? '');
      if (['admin', 'admin1234', 'password', '12345678'].some((d) => verifyPassword(d, stored))) {
        console.warn('\n[Pace IT] WARNING: the "admin" account still uses a default password. Change it now (Admin panel > Security).\n');
      }
    }

    // Ensure initial suggestions exist
    const suggCheck = this.sqlite.exec('SELECT field FROM suggestions LIMIT 1');
    if (suggCheck.length === 0 || suggCheck[0].values.length === 0) {
      for (const [field, values] of Object.entries(INITIAL_SUGGESTIONS)) {
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          field,
          JSON.stringify(values),
        ]);
      }
    }
  }

  private migrateResellerSchemaToForeman() {
    try {
      const tableNames = new Set<string>(
        (this.sqlite.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values || []).map((v) => String(v[0]))
      );
      const colsOf = (t: string) => new Set<string>(
        tableNames.has(t) ? (this.sqlite.exec(`PRAGMA table_info(${t})`)[0]?.values || []).map((v) => String(v[1])) : []
      );
      const colRenames: Record<string, [string, string][]> = {
        logs: [['reseller_name', 'foreman_name'], ['reseller_phone', 'foreman_phone'], ['reseller_informed', 'foreman_informed'], ['reseller_id', 'foreman_id']],
        team_members: [['reseller_id', 'foreman_id']],
      };
      const legacyFields = ['resellerName', 'resellerPhone', 'resellerInformed', 'resellerId'];

      const tableWork = tableNames.has('resellers');
      const colWork = Object.entries(colRenames).some(([t, pairs]) => { const c = colsOf(t); return pairs.some(([o]) => c.has(o)); });
      const sugWork = tableNames.has('suggestions') &&
        Number(this.sqlite.exec(`SELECT COUNT(*) FROM suggestions WHERE field IN (${legacyFields.map(() => '?').join(',')})`, legacyFields)[0]?.values[0]?.[0] || 0) > 0;
      const payloadWork = tableNames.has('import_requests') &&
        Number(this.sqlite.exec("SELECT COUNT(*) FROM import_requests WHERE payload LIKE '%reseller%'")[0]?.values[0]?.[0] || 0) > 0;
      const historyWork = colsOf('logs').has('history') &&
        Number(this.sqlite.exec("SELECT COUNT(*) FROM logs WHERE history LIKE '%\"reseller%'")[0]?.values[0]?.[0] || 0) > 0;
      if (!tableWork && !colWork && !sugWork && !payloadWork && !historyWork) return;

      if (fs.existsSync(SQLITE_FILE)) {
        const bak = SQLITE_FILE + '.before-foreman-code-rename';
        if (!fs.existsSync(bak)) fs.copyFileSync(SQLITE_FILE, bak);
      }

      this.sqlite.run('BEGIN');
      try {
        this.sqlite.run('DROP INDEX IF EXISTS idx_logs_reseller');
        this.sqlite.run('DROP INDEX IF EXISTS idx_team_members_reseller');

        // table: resellers -> foremen (merge if a foremen table already exists)
        if (tableWork) {
          if (!tableNames.has('foremen')) {
            this.sqlite.run('ALTER TABLE resellers RENAME TO foremen');
          } else {
            const oldCols = colsOf('resellers');
            const shared = [...colsOf('foremen')].filter((c) => oldCols.has(c));
            const list = shared.join(', ');
            this.sqlite.run(`INSERT OR IGNORE INTO foremen (${list}) SELECT ${list} FROM resellers`);
            this.sqlite.run('DROP TABLE resellers');
          }
        }

        // columns
        for (const [t, pairs] of Object.entries(colRenames)) {
          const c = colsOf(t);
          for (const [o, n] of pairs) {
            if (c.has(o) && !c.has(n)) this.sqlite.run(`ALTER TABLE ${t} RENAME COLUMN ${o} TO ${n}`);
          }
        }

        // per-log history: field names inside the change records
        if (historyWork) {
          const rows = this.sqlite.exec("SELECT id, history FROM logs WHERE history LIKE '%\"reseller%'")[0]?.values || [];
          for (const [id, h] of rows) {
            try {
              const fixed = upgradeLegacyLog({ history: JSON.parse(String(h)) }).history;
              this.sqlite.run('UPDATE logs SET history = ? WHERE id = ?', [JSON.stringify(fixed), String(id)]);
            } catch { /* leave a history we cannot read exactly as it is */ }
          }
        }

        // saved suggestions: field keys
        if (sugWork) {
          for (const oldKey of legacyFields) {
            const newKey = LEGACY_KEY_MAP[oldKey];
            const oldRow = this.sqlite.exec('SELECT values_json FROM suggestions WHERE field = ?', [oldKey])[0]?.values[0];
            if (!oldRow) continue;
            const newRow = this.sqlite.exec('SELECT values_json FROM suggestions WHERE field = ?', [newKey])[0]?.values[0];
            if (newRow) {
              try {
                const a: string[] = JSON.parse(String(newRow[0]));
                const b: string[] = JSON.parse(String(oldRow[0]));
                this.sqlite.run('UPDATE suggestions SET values_json = ? WHERE field = ?', [JSON.stringify([...new Set([...a, ...b])]), newKey]);
                this.sqlite.run('DELETE FROM suggestions WHERE field = ?', [oldKey]);
              } catch { /* keep both rows if either cannot be read */ }
            } else {
              this.sqlite.run('UPDATE suggestions SET field = ? WHERE field = ?', [newKey, oldKey]);
            }
          }
        }

        // pending CSV import requests: keys on the waiting entries
        if (payloadWork) {
          const rows = this.sqlite.exec("SELECT id, payload FROM import_requests WHERE payload LIKE '%reseller%'")[0]?.values || [];
          for (const [id, payload] of rows) {
            try {
              const arr = JSON.parse(String(payload));
              if (!Array.isArray(arr)) continue;
              this.sqlite.run('UPDATE import_requests SET payload = ? WHERE id = ?', [JSON.stringify(arr.map((e: any) => upgradeLegacyLog(e))), String(id)]);
            } catch { /* leave as is */ }
          }
        }
        this.sqlite.run('COMMIT');
        console.log('[Pace IT] Upgraded the database from "reseller" to "foreman" names (no records changed).');
      } catch (inner) {
        try { this.sqlite.run('ROLLBACK'); } catch { /* ignore */ }
        throw inner;
      }
    } catch (err) {
      console.error('[Pace IT] Foreman rename migration failed; data left unchanged:', err);
    }
  }

  private removePopFeature() {
    try {
      const tbl = this.sqlite.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='pops'");
      const hasPops = tbl.length && tbl[0].values.length;
      const cols = this.sqlite.exec('PRAGMA table_info(logs)');
      const colNames = new Set(cols.length ? cols[0].values.map((v) => String(v[1])) : []);
      if (!hasPops && !colNames.has('pop_id') && !colNames.has('pop_name')) return;
      if (fs.existsSync(SQLITE_FILE)) {
        const bak = SQLITE_FILE + '.before-pop-removal';
        if (!fs.existsSync(bak)) fs.copyFileSync(SQLITE_FILE, bak);
      }
      this.sqlite.run('DROP INDEX IF EXISTS idx_pops_reseller');
      this.sqlite.run('DROP TABLE IF EXISTS pops');
      for (const c of ['pop_id', 'pop_name']) {
        if (!colNames.has(c)) continue;
        try { this.sqlite.run(`ALTER TABLE logs DROP COLUMN ${c}`); }
        catch { try { this.sqlite.run(`UPDATE logs SET ${c} = NULL`); } catch { /* ignore */ } }
      }
      console.log('[Pace IT] Removed the PoP feature (table and per-connection PoP fields).');
    } catch (err) {
      console.warn('[Pace IT] PoP removal notice:', err);
    }
  }

  private migrateForemanWording() {
    try {
      const map: Record<string, string> = {
        'Pending - waiting for reseller': 'Pending - waiting for foreman',
        'Pending reseller callback': 'Pending foreman callback',
        'Pending - waiting for supplier': 'Pending - waiting for foreman',
        'Pending supplier callback': 'Pending foreman callback',
      };
      const olds = Object.keys(map);
      const ph = olds.map(() => '?').join(', ');
      const need = Number(
        this.sqlite.exec(`SELECT COUNT(*) FROM logs WHERE status IN (${ph}) OR follow_up_needed IN (${ph})`, [...olds, ...olds])[0]?.values[0]?.[0] || 0
      );
      const sug = this.sqlite.exec("SELECT field, values_json FROM suggestions WHERE field IN ('status', 'followUpNeeded')");
      const sugRows = sug.length ? sug[0].values : [];
      const sugNeed = sugRows.some(([, v]) => olds.some((o) => String(v).includes(o)));
      if (!need && !sugNeed) return;

      if (fs.existsSync(SQLITE_FILE)) {
        const bak = SQLITE_FILE + '.before-foreman-rename';
        if (!fs.existsSync(bak)) fs.copyFileSync(SQLITE_FILE, bak);
      }
      for (const [from, to] of Object.entries(map)) {
        this.sqlite.run('UPDATE logs SET status = ? WHERE status = ?', [to, from]);
        this.sqlite.run('UPDATE logs SET follow_up_needed = ? WHERE follow_up_needed = ?', [to, from]);
      }
      for (const [field, json] of sugRows) {
        try {
          const arr: string[] = JSON.parse(String(json));
          const next = [...new Set(arr.map((v) => (map[v] !== undefined ? map[v] : v)))];
          this.sqlite.run('UPDATE suggestions SET values_json = ? WHERE field = ?', [JSON.stringify(next), String(field)]);
        } catch { /* leave a list we cannot read as it is */ }
      }
      console.log(`[Pace IT] Renamed "reseller/supplier" wording to "foreman" on ${need} connection(s).`);
    } catch (err) {
      console.warn('[Pace IT] Foreman wording migration notice:', err);
    }
  }

  private migrateForemanUpazilas() {
    try {
      const res = this.sqlite.exec('SELECT id, name, area FROM foremen');
      if (!res.length) return;
      const rows = res[0].values.map(([id, name, area]) => ({ id: String(id), name: String(name), area: String(area || '') }));

      const plan: { id: string; oldName: string; name: string; area: string }[] = [];
      for (const r of rows) {
        let name = r.name;
        let area = upazilaKey(r.area);
        if (!area && r.area) {
          // "Balaganj, Sylhet" -> try each part
          area = r.area.split(/[,/]/).map((p) => upazilaKey(p)).find(Boolean) || '';
        }
        const legacy = splitLegacyName(r.name);
        if (legacy) {
          name = legacy.name;
          if (!area) area = legacy.area;
        }
        if (area && (name !== r.name || area !== r.area)) plan.push({ id: r.id, oldName: r.name, name, area });
      }
      if (!plan.length) return;

      // keep a copy of the database as it was before this one-time change
      try {
        if (fs.existsSync(SQLITE_FILE)) fs.copyFileSync(SQLITE_FILE, `${SQLITE_FILE}.before-upazila`);
      } catch {
        /* non-fatal */
      }

      const taken = new Set(rows.map((r) => `${r.name.toLowerCase()}|${upazilaKey(r.area)}`));
      for (const p of plan) {
        let name = p.name;
        const keyNew = `${name.toLowerCase()}|${p.area}`;
        const keyOld = `${p.oldName.toLowerCase()}|${upazilaKey(rows.find((r) => r.id === p.id)?.area || '')}`;
        if (name !== p.oldName && keyNew !== keyOld && taken.has(keyNew)) name = p.oldName; // would clash: keep old name
        this.sqlite.run('UPDATE foremen SET name = ?, area = ? WHERE id = ?', [name, p.area, p.id]);
        if (name !== p.oldName) {
          this.sqlite.run('UPDATE logs SET foreman_name = ? WHERE foreman_id = ? OR foreman_name = ?', [name, p.id, p.oldName]);
        }
        taken.add(`${name.toLowerCase()}|${p.area}`);
      }
      console.log(`[Pace IT] Updated ${plan.length} foreman(s) to name + upazila.`);
    } catch (err) {
      console.warn('[Pace IT] Foreman upazila migration notice:', err);
    }
  }

  private autoMigrateExistingLogs() {
    const logCountRes = this.sqlite.exec('SELECT COUNT(*) FROM logs');
    const existingCount = Number(logCountRes[0]?.values[0]?.[0] || 0);

    // If SQLite already has logs, don't overwrite
    if (existingCount > 0) return;

    let importedLogs: any[] = [];
    let importedUsers: any[] = [];
    let importedForemen: any[] = [];
    let importedActivity: any[] = [];
    let importedSuggestions: any = null;

    // 1. Try pace_it_db.json
    if (fs.existsSync(JSON_LEGACY_FILE)) {
      try {
        const raw = fs.readFileSync(JSON_LEGACY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (Array.isArray(parsed.logs)) importedLogs = parsed.logs;
          if (Array.isArray(parsed.users)) importedUsers = parsed.users;
          if (Array.isArray(parsed.foremen)) importedForemen = parsed.foremen;
          else if (Array.isArray(parsed.resellers)) importedForemen = parsed.resellers;
          if (Array.isArray(parsed.activity)) importedActivity = parsed.activity;
          if (parsed.suggestions) importedSuggestions = parsed.suggestions;
        }
      } catch (err) {
        console.error('Failed reading legacy JSON for auto-migration:', err);
      }
    }

    // 2. Also check for any custom backup files in data/ (e.g. backup.json, supabase_logs.json)
    if (importedLogs.length === 0) {
      try {
        const files = fs.readdirSync(DB_DIR);
        for (const file of files) {
          if (file.endsWith('.json') && file !== 'index.json' && file !== 'pace_it_db.backup.json') {
            const raw = fs.readFileSync(path.join(DB_DIR, file), 'utf-8');
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                importedLogs = parsed;
                break;
              } else if (parsed && Array.isArray(parsed.logs)) {
                importedLogs = parsed.logs;
                if (parsed.suggestions) importedSuggestions = parsed.suggestions;
                break;
              }
            } catch {
              /* ignore invalid json */
            }
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    // Insert imported users if any
    for (const u of importedUsers) {
      if (u.username === 'admin') continue; // admin already created
      let imported = String(u.password || '');
      if (!imported) {
        imported = randomPassword();
        console.log(`[Pace IT] Imported account "${u.username}" had no password. Temporary password: ${imported} (reset it from the Admin panel).`);
      }
      this.sqlite.run(
        'INSERT OR IGNORE INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [u.id || crypto.randomUUID(), u.username, u.displayName || u.username, isPasswordHash(imported) ? imported : hashPassword(imported), u.role || 'user', u.disabled ? 1 : 0, u.createdAt || new Date().toISOString()]
      );
    }

    // Insert imported foremen if any
    for (const r of importedForemen) {
      this.sqlite.run(
        'INSERT OR IGNORE INTO foremen (id, name, area, phone, active, created_at, deleted_at, deleted_by, roam, roam_areas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [r.id || crypto.randomUUID(), r.name, r.area || '', r.phone || '', r.active !== false ? 1 : 0, r.createdAt || new Date().toISOString(), r.deletedAt || null, r.deletedBy || null, r.roam ? 1 : 0, (r.roamAreas || []).join(',') || null]
      );
    }

    // Insert imported logs
    if (importedLogs.length > 0) {
      for (const item of importedLogs) {
        const data = upgradeLegacyLog((item && typeof item.data === 'object' && item.data !== null) ? item.data : item);
        const id = String(data.id || item.id || crypto.randomUUID());
        const logNo = Number(data.logNo ?? data.log_no ?? item.log_no ?? 1);
        const historyJson = Array.isArray(data.history) ? JSON.stringify(data.history) : '[]';

        this.sqlite.run(
          `INSERT OR REPLACE INTO logs (
            id, log_no, date, foreman_name, foreman_phone, request_type, customer_name,
            nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
            foreman_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
            edc_no, router_serial, form_received_at, foreman_id, follow_up_date,
            deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, logNo, String(data.date || item.date || ''), String(data.foremanName || data.foreman_name || item.foreman_name || ''),
            String(data.foremanPhone || data.foreman_phone || data.callerPhone || data.caller_phone || item.foreman_phone || item.caller_phone || ''), String(data.requestType || data.request_type || item.request_type || ''),
            String(data.customerName || data.customer_name || item.customer_name || ''), String(data.nmsId || data.nms_id || item.nms_id || ''),
            String(data.issueFound || data.issue_found || item.issue_found || ''), String(data.missingWrongDetails || data.missing_wrong_details || item.missing_wrong_details || ''),
            String(data.actionTaken || data.action_taken || item.action_taken || ''), String(data.reasonForAction || data.reason_for_action || item.reason_for_action || ''),
            String(data.foremanInformed || data.foreman_informed || item.foreman_informed || ''), String(data.followUpNeeded || data.follow_up_needed || item.follow_up_needed || ''),
            String(data.status || item.status || 'Resolved'), String(data.supervisorInformed || data.supervisor_informed || item.supervisor_informed || ''),
            String(data.remarks || item.remarks || ''), String(data.mac || item.mac || ''), data.edcNo ?? data.edc_no ?? item.edc_no ?? null,
            data.routerSerial ?? data.router_serial ?? item.router_serial ?? null, data.formReceivedAt ?? data.form_received_at ?? item.form_received_at ?? null,
            data.foremanId ?? data.foreman_id ?? item.foreman_id ?? null, data.followUpDate ?? data.follow_up_date ?? item.follow_up_date ?? null,
            data.deletedAt || item.deleted_at || null, data.deletedBy || item.deleted_by || null,
            String(data.createdAt || data.created_at || item.created_at || new Date().toISOString()),
            String(data.updatedAt || data.updated_at || item.updated_at || new Date().toISOString()),
            data.createdBy || data.created_by || item.created_by_name || 'Imported',
            data.updatedBy || data.updated_by || item.updated_by_name || 'Imported',
            historyJson
          ]
        );
      }
      console.log(`[Pace IT] Successfully auto-migrated ${importedLogs.length} logs into SQLite!`);
    }

    // Insert imported activity
    for (const a of importedActivity) {
      this.sqlite.run(
        'INSERT OR IGNORE INTO activity (id, at, by_user, action, log_no, customer, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [a.id || crypto.randomUUID(), a.at || new Date().toISOString(), a.by || 'Imported', a.action || 'created', String(a.logNo || ''), a.customer || '', a.detail || '']
      );
    }

    // Insert suggestions if provided
    if (importedSuggestions && typeof importedSuggestions === 'object') {
      for (const [field, values] of Object.entries(importedSuggestions)) {
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          LEGACY_KEY_MAP[field] || field,
          JSON.stringify(values),
        ]);
      }
    }
  }

  // Durability
  //
  // The native engine writes every change straight into data/pace_it.sqlite (WAL journal), so there is no
  // "export the whole database" step any more and nothing is lost if the process is killed.
  // Once a day an online backup (SQLite's backup API, safe while the app is running) is stored in
  // data/backups and the newest 30 are kept. Attached forms are plain files in data/files/upac:
  // copy that folder together with the database when you back up by hand.
  public revision = 0;
  private lastBackupCheck = 0;
  private backupRunning = false;

  private scheduleSave() {
    const now = Date.now();
    if (now - this.lastBackupCheck < 60_000) return;
    this.lastBackupCheck = now;
    void this.dailyBackup();
  }

  flush() {
    /* no-op: native SQLite commits each statement to disk immediately */
  }

  close() {
    try {
      this.sqlite.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      this.sqlite.raw.close();
    } catch {
      /* already closed */
    }
  }

  private async dailyBackup() {
    if (this.backupRunning) return;
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(BACKUP_DIR, `pace_it-${day}.sqlite`);
      if (fs.existsSync(file)) return;
      this.backupRunning = true;
      const tmp = `${file}.tmp`;
      fs.rmSync(tmp, { force: true }); // leftover from an interrupted backup
      await sqliteBackup(this.sqlite.raw, tmp);
      fs.renameSync(tmp, file);
      const old = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => /^pace_it-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
        .sort()
        .reverse()
        .slice(30);
      for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch (err) {
      console.error('[Pace IT] Daily backup failed:', err);
    } finally {
      this.backupRunning = false;
    }
  }

  private notify(type: string, payload?: any) {
    if (type !== 'activity' && type !== 'suggestions' && type !== 'approvals' && type !== 'imports') this.revision++;
    this.scheduleSave();
    this.emit('change', { type, payload, timestamp: new Date().toISOString() });
  }

  // Auth & Sessions
  createSession(userId: string): string {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const payload = `${userId}.${expiresAt}`;
    const hmac = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
  }

  getUserByToken(token: string): AppUser | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [userId, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || expiresAt < Date.now()) return null;

    const expectedHmac = crypto.createHmac('sha256', this.secret).update(`${userId}.${expiresAtStr}`).digest('hex');
    if (signature !== expectedHmac) return null;

    return this.getUserById(userId);
  }

  destroySession(_token: string) {
    // Stateless token, cleared on client
  }

  // Users
  getUserById(id: string, includeDisabled = false): StoredUser | null {
    const res = this.sqlite.exec('SELECT id, username, display_name, password, role, disabled, created_at, phone_number, email, photo_url FROM users WHERE id = ?', [id]);
    if (!res.length || !res[0].values.length) return null;
    const [uId, username, displayName, password, role, disabled, createdAt, phoneNumber, email, photoUrl] = res[0].values[0];
    if (Number(disabled) === 1 && !includeDisabled) return null;
    return {
      id: String(uId),
      username: String(username),
      displayName: String(displayName),
      password: String(password),
      role: (role as 'admin' | 'user') || 'user',
      phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      email: email ? String(email) : undefined,
      photoUrl: photoUrl ? String(photoUrl) : undefined,
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    };
  }

  getUserByUsername(username: string): StoredUser | null {
    const norm = username.trim().toLowerCase().replace(/\s+/g, '_');
    const res = this.sqlite.exec('SELECT id, username, display_name, password, role, disabled, created_at, phone_number, email, photo_url FROM users WHERE lower(username) = ?', [norm]);
    if (!res.length || !res[0].values.length) return null;
    const [id, uName, displayName, password, role, disabled, createdAt, phoneNumber, email, photoUrl] = res[0].values[0];
    return {
      id: String(id),
      username: String(uName),
      displayName: String(displayName),
      password: String(password),
      role: (role as 'admin' | 'user') || 'user',
      phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      email: email ? String(email) : undefined,
      photoUrl: photoUrl ? String(photoUrl) : undefined,
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    };
  }

  listUserAvatars(): { displayName: string; photoUrl: string }[] {
    const res = this.sqlite.exec("SELECT display_name, photo_url FROM users WHERE photo_url IS NOT NULL AND photo_url <> ''");
    if (!res.length) return [];
    return res[0].values.map(([n, p]) => ({ displayName: String(n), photoUrl: String(p) }));
  }

  listUsers(): (AppUser & { createdAt?: string; disabled?: boolean })[] {
    const res = this.sqlite.exec('SELECT id, username, display_name, role, disabled, created_at, phone_number, email, photo_url FROM users ORDER BY created_at ASC');
    if (!res.length) return [];
    return res[0].values.map(([id, username, displayName, role, disabled, createdAt, phoneNumber, email, photoUrl]) => ({
      id: String(id),
      username: String(username),
      displayName: String(displayName),
      role: (role as 'admin' | 'user') || 'user',
      phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      email: email ? String(email) : undefined,
      photoUrl: photoUrl ? String(photoUrl) : undefined,
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    }));
  }

  updateUserProfile(userId: string, input: { displayName?: string; phoneNumber?: string; email?: string; photoUrl?: string }): AppUser {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const newDisplayName = input.displayName !== undefined ? (input.displayName.trim() || user.displayName) : user.displayName;
    const newPhone = input.phoneNumber !== undefined ? input.phoneNumber.trim() : (user.phoneNumber || '');
    const newEmail = input.email !== undefined ? input.email.trim() : (user.email || '');
    const newPhotoUrl = input.photoUrl !== undefined ? input.photoUrl.trim() : (user.photoUrl || '');

    this.sqlite.run(
      'UPDATE users SET display_name = ?, phone_number = ?, email = ?, photo_url = ? WHERE id = ?',
      [newDisplayName, newPhone || null, newEmail || null, newPhotoUrl || null, userId]
    );

    this.notify('users');
    this.flush();

    return {
      id: user.id,
      username: user.username,
      displayName: newDisplayName,
      role: user.role,
      phoneNumber: newPhone || undefined,
      email: newEmail || undefined,
      photoUrl: newPhotoUrl || undefined,
      disabled: user.disabled,
      createdAt: user.createdAt,
    };
  }

  createUser(username: string, password: string, displayName: string): AppUser {
    const norm = username.trim().toLowerCase().replace(/\s+/g, '_');
    if (!norm) throw new Error('Username is required.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (this.getUserByUsername(norm)) throw new Error('That username already exists.');

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const cleanDisplay = displayName.trim() || norm;

    this.sqlite.run(
      'INSERT INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, norm, cleanDisplay, hashPassword(password), 'user', 0, createdAt]
    );

    this.notify('users');
    return { id, username: norm, displayName: cleanDisplay, role: 'user', disabled: false, createdAt };
  }

  setUserDisabled(userId: string, disabled: boolean): boolean {
    const user = this.getUserById(userId, true); // must also find disabled users, otherwise they can never be re-enabled
    if (!user) throw new Error('User not found.');
    if (user.role === 'admin' && disabled) throw new Error('Cannot disable the administrator account.');

    this.sqlite.run('UPDATE users SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, userId]);
    this.notify('users');
    return true;
  }

  setUserPassword(userId: string, newPassword: string): boolean {
    if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
    this.sqlite.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), userId]);
    this.notify('users');
    return true;
  }

  // Logs
  private rowToLog(row: SqlValue[], colNames?: string[]): LogEntry {
    let r: Record<string, any> = {};
    if (colNames && colNames.length) {
      for (let i = 0; i < colNames.length; i++) {
        r[colNames[i]] = row[i];
      }
    } else {
      const [
        id, logNo, date, foremanName, callerPhone, requestType, customerName,
        nmsId, issueFound, missingWrongDetails, actionTaken, reasonForAction,
        foremanInformed, followUpNeeded, status, supervisorInformed, remarks, mac,
        edcNo, routerSerial, formReceivedAt, foremanId, followUpDate,
        deletedAt, deletedBy, createdAt, updatedAt, createdBy, updatedBy, history,
        foremanPhone, headTeacherName, headTeacherPhone, lat, long, unionName, upazila, fiberLength, category
      ] = row;
      r = {
        id, log_no: logNo, date, foreman_name: foremanName, caller_phone: callerPhone,
        request_type: requestType, customer_name: customerName, nms_id: nmsId,
        issue_found: issueFound, missing_wrong_details: missingWrongDetails,
        action_taken: actionTaken, reason_for_action: reasonForAction,
        foreman_informed: foremanInformed, follow_up_needed: followUpNeeded,
        status, supervisor_informed: supervisorInformed, remarks, mac,
        edc_no: edcNo, router_serial: routerSerial, form_received_at: formReceivedAt,
        foreman_id: foremanId, follow_up_date: followUpDate, deleted_at: deletedAt,
        deleted_by: deletedBy, created_at: createdAt, updated_at: updatedAt,
        created_by: createdBy, updated_by: updatedBy, history,
        foreman_phone: foremanPhone, head_teacher_name: headTeacherName,
        head_teacher_phone: headTeacherPhone, lat, long, union_name: unionName,
        upazila, fiber_length: fiberLength, category
      };
    }

    let parsedHistory: LogChange[] = [];
    try {
      if (r.history) parsedHistory = JSON.parse(String(r.history));
    } catch {
      /* ignore */
    }

    return {
      id: String(r.id || ''),
      logNo: Number(r.log_no ?? 1),
      date: String(r.date || ''),
      foremanName: String(r.foreman_name || ''),
      requestType: String(r.request_type || ''),
      customerName: String(r.customer_name || ''),
      nmsId: String(r.nms_id || ''),
      issueFound: String(r.issue_found || ''),
      missingWrongDetails: String(r.missing_wrong_details || ''),
      actionTaken: String(r.action_taken || ''),
      reasonForAction: String(r.reason_for_action || ''),
      foremanInformed: String(r.foreman_informed || ''),
      followUpNeeded: String(r.follow_up_needed || ''),
      status: String(r.status || ''),
      supervisorInformed: String(r.supervisor_informed || ''),
      remarks: String(r.remarks || ''),
      mac: String(r.mac || ''),
      edcNo: r.edc_no ? String(r.edc_no) : undefined,
      emisEiinDghs: r.emis_eiin_dghs ? String(r.emis_eiin_dghs) : undefined,
      routerSerial: r.router_serial ? String(r.router_serial) : undefined,
      formReceivedAt: r.form_received_at ? String(r.form_received_at) : undefined,
      foremanId: r.foreman_id ? String(r.foreman_id) : undefined,
      followUpDate: r.follow_up_date ? String(r.follow_up_date) : undefined,
      foremanPhone: (r.foreman_phone || r.caller_phone) ? String(r.foreman_phone || r.caller_phone) : undefined,
      headTeacherName: r.head_teacher_name ? String(r.head_teacher_name) : undefined,
      headTeacherPhone: r.head_teacher_phone ? String(r.head_teacher_phone) : undefined,
      lat: r.lat ? String(r.lat) : undefined,
      long: r.long ? String(r.long) : undefined,
      unionName: r.union_name ? String(r.union_name) : undefined,
      upazila: r.upazila ? String(r.upazila) : undefined,
      fiberLength: r.fiber_length ? String(r.fiber_length) : undefined,
      category: displayCategory({
        nameBn: r.name_bn ? String(r.name_bn) : undefined,
        nameEn: r.name_en ? String(r.name_en) : undefined,
        customerName: String(r.customer_name || ''),
        category: r.category ? String(r.category) : undefined,
      }) || undefined,
      nameBn: r.name_bn ? String(r.name_bn) : undefined,
      nameEn: r.name_en ? String(r.name_en) : undefined,
      billReceivedAt: r.bill_received_at ? String(r.bill_received_at) : undefined,
      billMonths: (() => {
        try {
          const a = r.bill_months ? JSON.parse(String(r.bill_months)) : [];
          return Array.isArray(a) ? a.map(String).sort() : [];
        } catch { return []; }
      })(),
      term: r.term ? String(r.term) : undefined,
      upacFormName: r.upac_form_name ? String(r.upac_form_name) : undefined,
      upacFormType: r.upac_form_type ? String(r.upac_form_type) : undefined,
      upacFormSize: r.upac_form_size !== undefined && r.upac_form_size !== null ? Number(r.upac_form_size) : undefined,
      upacFormUploadedAt: r.upac_form_uploaded_at ? String(r.upac_form_uploaded_at) : undefined,
      deletedAt: r.deleted_at ? String(r.deleted_at) : undefined,
      deletedBy: r.deleted_by ? String(r.deleted_by) : undefined,
      createdAt: String(r.created_at || ''),
      updatedAt: String(r.updated_at || ''),
      createdBy: r.created_by ? String(r.created_by) : undefined,
      updatedBy: r.updated_by ? String(r.updated_by) : undefined,
      history: parsedHistory,
    };
  }

  getLogs(): LogEntry[] {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE deleted_at IS NULL ORDER BY log_no ASC');
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map((row) => this.rowToLog(row, cols));
  }

  getNextLogNo(): number {
    const res = this.sqlite.exec('SELECT MAX(log_no) FROM logs');
    const maxVal = res[0]?.values[0]?.[0];
    return (Number(maxVal) || 0) + 1;
  }

  saveLog(entry: LogEntry, user: AppUser, existingId?: string, opts: { quiet?: boolean } = {}): LogEntry {
    const now = new Date().toISOString();
    const id = existingId || entry.id || crypto.randomUUID();
    // Keep a hand-picked category; auto-detect from the institute name when it is empty.
    entry = { ...entry, category: stripCategoryNumber(entry.category) || resolveCategory(entry) };
    // `undefined` can't be bound; a missing optional value is stored as NULL.
    const clean = (a: any[]) => a.map((v) => (v === undefined ? null : v));

    // Check if exists
    const checkRes = this.sqlite.exec('SELECT * FROM logs WHERE id = ?', [id]);
    const existingRow = checkRes.length && checkRes[0].values.length ? this.rowToLog(checkRes[0].values[0], checkRes[0].columns) : null;

    let saved: LogEntry;

    if (existingRow) {
      const history = [...(existingRow.history || [])];
      const changes: { field: string; from: string; to: string }[] = [];
      const fieldsToCheck: (keyof LogEntry)[] = [
        'foremanName', 'requestType', 'customerName', 'nmsId',
        'issueFound', 'missingWrongDetails', 'actionTaken', 'reasonForAction',
        'foremanInformed', 'followUpNeeded', 'status', 'supervisorInformed',
        'remarks', 'mac', 'edcNo', 'emisEiinDghs', 'routerSerial', 'formReceivedAt', 'billReceivedAt', 'followUpDate',
        'foremanPhone', 'headTeacherName', 'headTeacherPhone', 'lat', 'long',
        'unionName', 'upazila', 'fiberLength', 'category', 'nameBn', 'nameEn',
      ];

      for (const f of fieldsToCheck) {
        if (f === 'formReceivedAt' || f === 'billReceivedAt') continue;
        const fromVal = String(existingRow[f] ?? '');
        const toVal = String(entry[f] ?? '');
        if (fromVal !== toVal) {
          changes.push({ field: f, from: fromVal, to: toVal });
        }
      }

      if (changes.length > 0) {
        history.push({ at: now, by: user.displayName, action: 'edited', changes });
      }

      saved = {
        ...existingRow,
        ...entry,
        id: existingRow.id,
        createdAt: existingRow.createdAt,
        createdBy: existingRow.createdBy,
        updatedAt: changes.length > 0 ? now : existingRow.updatedAt,
        updatedBy: changes.length > 0 ? user.displayName : existingRow.updatedBy,
        history,
        // Form / bill received marks only change through the approval flow (markLog), never through a normal save.
        formReceivedAt: existingRow.formReceivedAt,
        billReceivedAt: existingRow.billReceivedAt,
        billMonths: existingRow.billMonths,
      };

      this.sqlite.run(
        `UPDATE logs SET
          log_no = ?, date = ?, foreman_name = ?, caller_phone = ?, request_type = ?,
          customer_name = ?, nms_id = ?, issue_found = ?, missing_wrong_details = ?,
          action_taken = ?, reason_for_action = ?, foreman_informed = ?, follow_up_needed = ?,
          status = ?, supervisor_informed = ?, remarks = ?, mac = ?, edc_no = ?,
          router_serial = ?, form_received_at = ?, foreman_id = ?, follow_up_date = ?,
          foreman_phone = ?, head_teacher_name = ?, head_teacher_phone = ?,
          lat = ?, long = ?, union_name = ?, upazila = ?, fiber_length = ?, category = ?,
          updated_at = ?, updated_by = ?, history = ?
        WHERE id = ?`,
        clean([
          Number(saved.logNo), saved.date, saved.foremanName, null, saved.requestType,
          saved.customerName, saved.nmsId, saved.issueFound, saved.missingWrongDetails,
          saved.actionTaken, saved.reasonForAction, saved.foremanInformed, saved.followUpNeeded,
          saved.status, saved.supervisorInformed, saved.remarks, saved.mac, saved.edcNo || null,
          saved.routerSerial || null, saved.formReceivedAt || null, saved.foremanId || null, saved.followUpDate || null,
          saved.foremanPhone || null, saved.headTeacherName || null, saved.headTeacherPhone || null,
          saved.lat || null, saved.long || null, saved.unionName || null, saved.upazila || null, saved.fiberLength || null,
          saved.category || null,
          saved.updatedAt, saved.updatedBy || null, JSON.stringify(saved.history || []), saved.id
        ])
      );

      if (changes.length > 0 && !opts.quiet) {
        this.addActivity({
          by: user.displayName,
          action: 'edited',
          logNo: saved.logNo,
          customer: saved.customerName,
          detail: changes.map(c => c.field).join(', '),
        });
      }
    } else {
      const logNo = entry.logNo || this.getNextLogNo();
      saved = {
        ...entry,
        date: entry.date || '',
        foremanName: entry.foremanName || '',
        requestType: entry.requestType || '',
        customerName: entry.customerName || '',
        status: entry.status || '',
        formReceivedAt: user.role === 'admin' ? entry.formReceivedAt : undefined,
        billReceivedAt: user.role === 'admin' ? entry.billReceivedAt : undefined,
        billMonths: user.role === 'admin' ? entry.billMonths : undefined,
        id,
        logNo,
        createdAt: now,
        updatedAt: now,
        createdBy: user.displayName,
        updatedBy: user.displayName,
        history: [{ at: now, by: user.displayName, action: 'created' }],
      };

      this.sqlite.run(
        `INSERT INTO logs (
          id, log_no, date, foreman_name, caller_phone, request_type, customer_name,
          nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
          foreman_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
          edc_no, router_serial, form_received_at, foreman_id, follow_up_date,
          foreman_phone, head_teacher_name, head_teacher_phone, lat, long, union_name, upazila, fiber_length, category,
          deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        clean([
          saved.id, Number(saved.logNo), saved.date, saved.foremanName, null,
          saved.requestType, saved.customerName, saved.nmsId, saved.issueFound,
          saved.missingWrongDetails, saved.actionTaken, saved.reasonForAction,
          saved.foremanInformed, saved.followUpNeeded, saved.status, saved.supervisorInformed,
          saved.remarks, saved.mac, saved.edcNo || null, saved.routerSerial || null,
          saved.formReceivedAt || null, saved.foremanId || null, saved.followUpDate || null,
          saved.foremanPhone || null, saved.headTeacherName || null, saved.headTeacherPhone || null,
          saved.lat || null, saved.long || null, saved.unionName || null, saved.upazila || null, saved.fiberLength || null,
          saved.category || null,
          null, null, saved.createdAt, saved.updatedAt, saved.createdBy || null, saved.updatedBy || null,
          JSON.stringify(saved.history || [])
        ])
      );

      this.addActivity({
        by: user.displayName,
        action: 'created',
        logNo: saved.logNo,
        customer: saved.customerName,
      });
    }

    this.writeExtras(saved);
    this.harvestSuggestions(saved);
    this.notify('logs', { id: saved.id, action: existingRow ? 'updated' : 'created' });
    return saved;
  }

  private writeExtras(l: Partial<LogEntry> & { id: string }) {
    // Attached form: a name means "keep/attach", an empty name means "remove". New bytes (data) are
    // stored as a file; when no bytes are sent the existing file is left exactly as it is.
    const upacName = (l.upacFormName || '').trim();
    let upacSize: number | null = l.upacFormSize !== undefined && l.upacFormSize !== null ? l.upacFormSize : null;
    if (!upacName) {
      this.removeAttachment(l.id);
      upacSize = null;
    } else if (l.upacFormData) {
      upacSize = this.storeAttachment(l.id, l.upacFormData);
    }
    this.sqlite.run(
      `UPDATE logs SET head_teacher_name = ?, head_teacher_phone = ?, lat = ?, long = ?, union_name = ?, upazila = ?,
         fiber_length = ?, category = ?, name_bn = ?, name_en = ?, foreman_phone = ?, bill_received_at = ?, bill_months = ?,
         upac_form_name = ?, upac_form_type = ?, upac_form_size = ?, upac_form_uploaded_at = ?,
         emis_eiin_dghs = ? WHERE id = ?`,
      [
        l.headTeacherName || null, l.headTeacherPhone || null, l.lat || null, l.long || null, l.unionName || null,
        l.upazila || null, l.fiberLength || null, l.category || null, l.nameBn || null, l.nameEn || null,
        l.foremanPhone || null, l.billReceivedAt || null,
        l.billMonths && l.billMonths.length ? JSON.stringify([...new Set(l.billMonths)].sort()) : null,
        upacName || null, upacName ? (l.upacFormType || null) : null,
        upacSize,
        upacName ? (l.upacFormUploadedAt || null) : null,
        l.emisEiinDghs || null,
        l.id,
      ]
    );
  }

  private storeAttachment(logId: string, data: string): number {
    const bytes = decodeAttachment(data);
    fs.mkdirSync(ATTACH_DIR, { recursive: true });
    const file = attachFile(logId);
    const tmp = `${file}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, bytes);
    if (fs.statSync(tmp).size !== bytes.length) {
      fs.unlinkSync(tmp);
      throw new Error('Could not save the attached form to disk.');
    }
    fs.renameSync(tmp, file);
    return bytes.length;
  }

  private removeAttachment(logId: string) {
    try { fs.unlinkSync(attachFile(logId)); } catch { /* none stored */ }
  }

  setUpacForm(logId: string, form: { name: string; data: string; type?: string; size?: number }, user: AppUser): LogEntry {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [logId]);
    if (!res.length || !res[0].values.length) throw new Error('Connection not found.');
    const log = this.rowToLog(res[0].values[0], res[0].columns);

    const now = new Date().toISOString();
    const upacFormName = form.name.trim();
    const upacFormType = form.type || 'application/pdf';
    const upacFormSize = this.storeAttachment(logId, form.data);
    const upacFormUploadedAt = now;

    this.sqlite.run(
      'UPDATE logs SET upac_form_name = ?, upac_form_type = ?, upac_form_size = ?, upac_form_uploaded_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [upacFormName, upacFormType, upacFormSize, upacFormUploadedAt, now, user.displayName, logId]
    );

    this.addActivity({
      by: user.displayName,
      action: 'edited',
      logNo: log.logNo,
      customer: log.customerName,
      detail: `Attached UPAC form: ${upacFormName}`,
    });

    this.notify('logs', { id: logId, action: 'updated' });
    this.flush();

    return {
      ...log,
      upacFormName,
      upacFormType,
      upacFormSize,
      upacFormUploadedAt,
      updatedAt: now,
      updatedBy: user.displayName,
    };
  }

  deleteUpacForm(logId: string, user: AppUser): LogEntry {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [logId]);
    if (!res.length || !res[0].values.length) throw new Error('Connection not found.');
    const log = this.rowToLog(res[0].values[0], res[0].columns);
    const oldName = log.upacFormName || 'form';

    const now = new Date().toISOString();
    this.sqlite.run(
      'UPDATE logs SET upac_form_name = NULL, upac_form_type = NULL, upac_form_size = NULL, upac_form_uploaded_at = NULL, updated_at = ?, updated_by = ? WHERE id = ?',
      [now, user.displayName, logId]
    );
    this.removeAttachment(logId);

    this.addActivity({
      by: user.displayName,
      action: 'edited',
      logNo: log.logNo,
      customer: log.customerName,
      detail: `Removed UPAC form: ${oldName}`,
    });

    this.notify('logs', { id: logId, action: 'updated' });
    this.flush();

    const updated = { ...log };
    delete updated.upacFormName;
    delete updated.upacFormType;
    delete updated.upacFormSize;
    delete updated.upacFormUploadedAt;
    updated.updatedAt = now;
    updated.updatedBy = user.displayName;
    return updated;
  }

  getUpacForm(logId: string): { name: string; buffer: Buffer; type?: string; size?: number } | null {
    const res = this.sqlite.exec('SELECT upac_form_name, upac_form_type, upac_form_size FROM logs WHERE id = ?', [logId]);
    if (!res.length || !res[0].values.length) return null;
    const [name, type, size] = res[0].values[0];
    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(attachFile(logId));
    } catch {
      return null;
    }
    return {
      name: String(name || 'upac_form.pdf'),
      buffer,
      type: type ? String(type) : 'application/pdf',
      size: size !== null && size !== undefined ? Number(size) : buffer.length,
    };
  }

  patchLog(id: string, fields: Partial<LogEntry>, user: AppUser): LogEntry | null {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!res.length || !res[0].values.length) return null;
    const current = this.rowToLog(res[0].values[0], res[0].columns);
    // never let a patch rewrite identity / audit fields
    const { id: _i, createdAt: _c, createdBy: _cb, updatedAt: _u, updatedBy: _ub, history: _h, deletedAt: _d, deletedBy: _db, ...safe } = fields as any;
    const saved = this.saveLog({ ...current, ...safe }, user, id, { quiet: true });
    this.flush();
    return saved;
  }

  bulkFillField(field: string, items: { id: string; value: string }[], user: AppUser): { updated: number; unchanged: number; missing: number } {
    const labels: Record<string, string> = {
      mac: 'MAC address', routerSerial: 'Router serial', edcNo: 'EDC book no.', emisEiinDghs: 'EMIS / EIIN / DGHS', lat: 'Latitude', long: 'Longitude',
      fiberLength: 'Fiber length', unionName: 'Union / address', upazila: 'Upazila', headTeacherName: 'Head teacher name',
      headTeacherPhone: 'Head teacher phone', nameBn: 'Institute name (Bangla)', nameEn: 'Institute name (English)', remarks: 'Remarks',
    };
    if (!Object.prototype.hasOwnProperty.call(labels, field)) throw new Error('This field cannot be filled in bulk.');

    let updated = 0, unchanged = 0, missing = 0;
    for (const item of items) {
      const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [String(item?.id ?? '')]);
      if (!res.length || !res[0].values.length) { missing++; continue; }
      const current = this.rowToLog(res[0].values[0], res[0].columns);
      const value = String(item.value ?? '').trim().slice(0, 500);
      if (String((current as any)[field] ?? '') === value) { unchanged++; continue; }

      const patch: Partial<LogEntry> = { [field]: value };
      if (field === 'nameBn' || field === 'nameEn') {
        // customerName is the name shown everywhere: Bangla first, then English
        const bn = field === 'nameBn' ? value : (current.nameBn || '');
        const en = field === 'nameEn' ? value : (current.nameEn || '');
        patch.customerName = bn.trim() || en.trim() || current.customerName;
      }
      this.saveLog({ ...current, ...patch }, user, current.id, { quiet: true });
      updated++;
    }
    if (updated) {
      this.addActivity({ by: user.displayName, action: 'edited', detail: `Bulk fill - ${labels[field]}: ${updated} connection${updated === 1 ? '' : 's'}` });
      this.flush();
    }
    return { updated, unchanged, missing };
  }

  /** Set every connection's upazila to the one the target workbook gives its EDC number. Returns how many changed. */
  syncUpazilasToTargets(by = 'System', onlyIds?: string[]): number {
    const only = onlyIds ? new Set(onlyIds.map(String)) : null;
    const map = targetUpazilaMap();
    if (!map.size) return 0;
    const res = this.sqlite.exec('SELECT id, edc_no, upazila, history FROM logs WHERE deleted_at IS NULL AND edc_no IS NOT NULL');
    if (!res.length) return 0;
    const now = new Date().toISOString();
    let n = 0;
    this.sqlite.run('BEGIN');
    try {
      for (const [id, edc, upa, hist] of res[0].values) {
        if (only && !only.has(String(id))) continue;
        const want = map.get(edcNorm(edc));
        if (!want || String(upa ?? '') === want) continue;
        let history: any[] = [];
        try { history = hist ? JSON.parse(String(hist)) : []; } catch { history = []; }
        history.push({ at: now, by, action: 'edited', changes: [{ field: 'upazila', from: String(upa ?? ''), to: want }] });
        this.sqlite.run('UPDATE logs SET upazila = ?, history = ? WHERE id = ?', [want, JSON.stringify(history), String(id)]);
        n++;
      }
      this.sqlite.run('COMMIT');
    } catch (e) { this.sqlite.run('ROLLBACK'); throw e; }
    if (n) {
      console.log(`[Pace IT] Upazila synced to the target workbook for ${n} connection(s).`);
      this.notify('logs', { action: 'updated' });
    }
    return n;
  }

  bulkSetTerm(ids: string[], term: string, user: AppUser): { updated: number; unchanged: number; missing: number } {
    const t = String(term || '').trim().slice(0, 40);
    let updated = 0, unchanged = 0, missing = 0;
    const now = new Date().toISOString();
    this.sqlite.run('BEGIN');
    try {
      for (const rawId of ids) {
        const res = this.sqlite.exec('SELECT term FROM logs WHERE id = ? AND deleted_at IS NULL', [String(rawId ?? '')]);
        if (!res.length || !res[0].values.length) { missing++; continue; }
        const had = String(res[0].values[0][0] ?? '');
        if (had === t) { unchanged++; continue; }
        this.sqlite.run('UPDATE logs SET term = ?, updated_at = ?, updated_by = ? WHERE id = ?', [t || null, now, user.displayName, String(rawId)]);
        updated++;
      }
      this.sqlite.run('COMMIT');
    } catch (e) { this.sqlite.run('ROLLBACK'); throw e; }
    if (updated) {
      this.notify('logs', { action: 'updated' });
      this.addActivity({ by: user.displayName, action: 'edited', detail: `Marked ${updated} connection${updated === 1 ? '' : 's'} as ${t || 'no term'}` });
      this.flush();
    }
    return { updated, unchanged, missing };
  }

  bulkSetForeman(ids: string[], foremanId: string, user: AppUser): { updated: number; unchanged: number; missing: number; foremanName: string } {
    const foremen = this.getForemen();
    const f = foremen.find((x) => x.id === foremanId);
    if (!f) throw new Error('Foreman not found.');
    if (!f.active) throw new Error(`${f.name} is marked inactive.`);
    const logName = foremanLogName(f, foremen);

    let updated = 0, unchanged = 0, missing = 0;
    this.sqlite.run('BEGIN');
    try {
      for (const rawId of ids) {
        const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [String(rawId ?? '')]);
        if (!res.length || !res[0].values.length) { missing++; continue; }
        const cur = this.rowToLog(res[0].values[0], res[0].columns);

        // the foreman's upazila becomes the log's upazila; an "own broadband" foreman keeps the
        // customer's upazila when he is allowed to supply it
        const curUpa = upazilaKey(cur.upazila);
        const upazila = f.roam && curUpa && foremanServes(f, curUpa) ? curUpa : upazilaKey(f.area) || cur.upazila || '';
        // keep a phone typed by hand on the log; otherwise use the new foreman's
        const prev = cur.foremanId ? foremen.find((x) => x.id === cur.foremanId) : undefined;
        const foremanPhone = cur.foremanPhone?.trim() && cur.foremanPhone !== prev?.phone ? cur.foremanPhone : f.phone || '';

        if (cur.foremanId === f.id && cur.foremanName === logName && (cur.upazila || '') === upazila && (cur.foremanPhone || '') === foremanPhone) {
          unchanged++;
          continue;
        }
        this.saveLog({ ...cur, foremanId: f.id, foremanName: logName, upazila, foremanPhone }, user, cur.id, { quiet: true });
        updated++;
      }
      this.sqlite.run('COMMIT');
    } catch (e) {
      this.sqlite.run('ROLLBACK');
      throw e;
    }
    if (updated) {
      this.addActivity({ by: user.displayName, action: 'edited', detail: `Changed foreman to ${logName}: ${updated} connection${updated === 1 ? '' : 's'}` });
      this.flush();
    }
    return { updated, unchanged, missing, foremanName: logName };
  }

  // Form / bill received marks and the admin approval queue
  private rowToApproval(r: SqlValue[]): ApprovalRequest {
    const [id, logId, logNo, customer, kind, action, requestedBy, requestedAt, status, decidedBy, decidedAt, month, receivedOn, requestedById] = r;
    return {
      id: String(id), logId: String(logId), logNo: logNo ? String(logNo) : undefined,
      customer: customer ? String(customer) : undefined, kind: kind as MarkKind, action: action as MarkAction,
      requestedBy: String(requestedBy), requestedById: requestedById ? String(requestedById) : undefined,
      requestedAt: String(requestedAt), status: status as ApprovalRequest['status'],
      decidedBy: decidedBy ? String(decidedBy) : undefined, decidedAt: decidedAt ? String(decidedAt) : undefined,
      month: month ? String(month) : undefined,
      receivedOn: receivedOn ? String(receivedOn) : undefined,
    };
  }

  listApprovals(): ApprovalRequest[] {
    const cols = 'id, log_id, log_no, customer, kind, action, requested_by, requested_at, status, decided_by, decided_at, month, received_on, requested_by_id';
    const pending = this.sqlite.exec(`SELECT ${cols} FROM approvals WHERE status = 'pending' ORDER BY requested_at ASC`);
    const done = this.sqlite.exec(`SELECT ${cols} FROM approvals WHERE status <> 'pending' ORDER BY decided_at DESC LIMIT 100`);
    return [
      ...(pending.length ? pending[0].values.map((r) => this.rowToApproval(r)) : []),
      ...(done.length ? done[0].values.map((r) => this.rowToApproval(r)) : []),
    ];
  }

  private monthOf(at?: string | null): string {
    const d = at ? new Date(at) : new Date();
    const x = isNaN(d.getTime()) ? new Date() : d;
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  }

  private cleanMonth(m: unknown, fallbackAt?: string): string {
    return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : this.monthOf(fallbackAt);
  }

  private stampOf(dateStr: unknown, fallback: string): string {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const d = new Date(`${dateStr}T12:00:00.000Z`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return fallback;
  }

  private applyMark(logId: string, kind: MarkKind, action: MarkAction, at: string, by: string, month?: string, receivedOn?: string): boolean {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [logId]);
    if (!res.length || !res[0].values.length) return false;
    const current = this.rowToLog(res[0].values[0], res[0].columns);
    const m = this.cleanMonth(month, at);
    const now = new Date().toISOString();
    let change: { field: string; from: string; to: string };

    if (kind === 'bill') {
      const had = current.billMonths || [];
      const next = action === 'received' ? [...new Set([...had, m])].sort() : had.filter((x) => x !== m);
      if (next.join(',') === had.join(',')) return true;
      // billReceivedAt = when the latest bill came in (empty once no month is left)
      const stamp = next.length ? (action === 'received' ? at : current.billReceivedAt || at) : '';
      this.sqlite.run('UPDATE logs SET bill_months = ?, bill_received_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
        next.length ? JSON.stringify(next) : null, stamp || null, now, by, logId,
      ]);
      change = { field: 'billMonths', from: had.join(', '), to: next.join(', ') };
    } else {
      const from = String(current.formReceivedAt ?? '');
      const to = action === 'received' ? this.stampOf(receivedOn, at) : '';
      // Already in that state. Two received dates differ only when a form is moved to another month.
      if (from && to ? from === to : !!from === !!to) return true;
      this.sqlite.run('UPDATE logs SET form_received_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [to || null, now, by, logId]);
      change = { field: 'formReceivedAt', from, to };
    }
    const history = [...(current.history || []), { at: now, by, action: 'edited' as const, changes: [change] }];
    this.sqlite.run('UPDATE logs SET history = ? WHERE id = ?', [JSON.stringify(history), logId]);
    return true;
  }

  requestMarks(items: { logId: string; kind: MarkKind; action: MarkAction; month?: string; receivedOn?: string; move?: boolean }[], user: AppUser): { applied: number; queued: number; skipped: number } {
    let applied = 0, queued = 0, skipped = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      if ((it.kind !== 'form' && it.kind !== 'bill') || (it.action !== 'received' && it.action !== 'not_received')) { skipped++; continue; }
      const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [it.logId]);
      if (!res.length || !res[0].values.length) { skipped++; continue; }
      const log = this.rowToLog(res[0].values[0], res[0].columns);
      const month = it.kind === 'bill' ? this.cleanMonth(it.month) : null;
      const receivedOn = it.kind === 'form' && typeof it.receivedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.receivedOn) ? it.receivedOn : null;
      const currentlyReceived = it.kind === 'bill' ? (log.billMonths || []).includes(month as string) : Boolean(log.formReceivedAt);
      if (it.kind === 'bill') this.sqlite.run("DELETE FROM approvals WHERE log_id = ? AND kind = 'bill' AND status = 'pending' AND COALESCE(month, '') = ?", [it.logId, month]);
      else this.sqlite.run("DELETE FROM approvals WHERE log_id = ? AND kind = 'form' AND status = 'pending'", [it.logId]);
      // A form that is already received can be moved to another month (it.move): that is a new received date.
      const movesForm = it.kind === 'form' && it.action === 'received' && currentlyReceived && Boolean(it.move) && Boolean(receivedOn);
      if (currentlyReceived === (it.action === 'received') && !movesForm) { skipped++; continue; } // nothing to change
      if (user.role === 'admin') {
        this.applyMark(it.logId, it.kind, it.action, now, user.displayName, month ?? undefined, receivedOn ?? undefined);
        applied++;
      } else {
        this.sqlite.run(
          "INSERT INTO approvals (id, log_id, log_no, customer, kind, action, requested_by, requested_at, status, month, received_on, requested_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
          [crypto.randomUUID(), it.logId, String(log.logNo ?? ''), String(log.customerName ?? ''), it.kind, it.action, user.displayName, now, month, receivedOn, user.id]
        );
        queued++;
      }
    }
    if (applied) this.notify('logs');
    this.notify('approvals');
    this.flush();
    return { applied, queued, skipped };
  }

  decideApprovals(opts: { ids?: string[]; all?: boolean; approve: boolean }, user: AppUser): { approved: number; rejected: number } {
    const res = this.sqlite.exec("SELECT id, log_id, kind, action, requested_at, month, received_on FROM approvals WHERE status = 'pending'");
    const rows = res.length ? res[0].values : [];
    const want = opts.all ? null : new Set(opts.ids || []);
    const now = new Date().toISOString();
    let approved = 0, rejected = 0;
    for (const [id, logId, kind, action, requestedAt, month, receivedOn] of rows) {
      if (want && !want.has(String(id))) continue;
      if (opts.approve) {
        const done = this.applyMark(String(logId), kind as MarkKind, action as MarkAction, String(requestedAt), user.displayName, month ? String(month) : undefined, receivedOn ? String(receivedOn) : undefined);
        if (done) {
          this.sqlite.run("UPDATE approvals SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?", [user.displayName, now, String(id)]);
          approved++;
        } else {
          // The log was deleted after the request was sent: nothing to apply, so close it as rejected
          this.sqlite.run("UPDATE approvals SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?", [user.displayName, now, String(id)]);
          rejected++;
        }
      } else {
        this.sqlite.run("UPDATE approvals SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?", [user.displayName, now, String(id)]);
        rejected++;
      }
    }
    if (approved) {
      this.addActivity({ by: user.displayName, action: 'edited', detail: `${approved} form/bill request(s) approved` });
      this.notify('logs');
    }
    this.notify('approvals');
    this.flush();
    return { approved, rejected };
  }

  withdrawApproval(id: string, user: AppUser): boolean {
    const res = this.sqlite.exec("SELECT requested_by, requested_by_id FROM approvals WHERE id = ? AND status = 'pending'", [id]);
    if (!res.length || !res[0].values.length) return false;
    const [by, byId] = res[0].values[0];
    const mine = byId ? String(byId) === user.id : String(by) === user.displayName;
    if (user.role !== 'admin' && !mine) return false;
    this.sqlite.run('DELETE FROM approvals WHERE id = ?', [id]);
    this.notify('approvals');
    this.flush();
    return true;
  }

  // CSV import requests: a normal user's import waits here until an admin approves it
  createImportRequest(entries: LogEntry[], user: AppUser): ImportRequest {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sample = entries.slice(0, 3).map((e) => String(e.customerName || e.nmsId || '').trim()).filter(Boolean).join(' · ');
    this.sqlite.run(
      "INSERT INTO import_requests (id, requested_by, requested_by_id, requested_at, status, entry_count, sample, payload) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
      [id, user.displayName, user.id, now, entries.length, sample, JSON.stringify(entries.map((e) => upgradeLegacyLog(e)))]
    );
    this.addActivity({ by: user.displayName, action: 'edited', detail: `Requested CSV import of ${entries.length} connection${entries.length === 1 ? '' : 's'} (waiting for admin)` });
    this.notify('imports');
    this.flush();
    return { id, requestedBy: user.displayName, requestedAt: now, status: 'pending', count: entries.length, sample };
  }

  listImportRequests(): ImportRequest[] {
    const cols = 'id, requested_by, requested_at, status, decided_by, decided_at, entry_count, sample, requested_by_id';
    const map = (r: SqlValue[]): ImportRequest => ({
      id: String(r[0]), requestedBy: String(r[1]), requestedAt: String(r[2]), status: r[3] as ImportRequest['status'],
      decidedBy: r[4] ? String(r[4]) : undefined, decidedAt: r[5] ? String(r[5]) : undefined,
      count: Number(r[6] || 0), sample: r[7] ? String(r[7]) : undefined,
      requestedById: r[8] ? String(r[8]) : undefined,
    });
    const pending = this.sqlite.exec(`SELECT ${cols} FROM import_requests WHERE status = 'pending' ORDER BY requested_at ASC`);
    const done = this.sqlite.exec(`SELECT ${cols} FROM import_requests WHERE status <> 'pending' ORDER BY decided_at DESC LIMIT 20`);
    return [
      ...(pending.length ? pending[0].values.map(map) : []),
      ...(done.length ? done[0].values.map(map) : []),
    ];
  }

  decideImportRequest(id: string, approve: boolean, admin: AppUser): { status: 'approved' | 'rejected'; saved: number } {
    const res = this.sqlite.exec("SELECT requested_by, payload FROM import_requests WHERE id = ? AND status = 'pending'", [id]);
    if (!res.length || !res[0].values.length) throw new Error('This import request is no longer pending.');
    const [requestedBy, payload] = res[0].values[0];
    const now = new Date().toISOString();
    // Importing and closing the request happen together: a bad row leaves the request pending and
    // the logs untouched, so approving again never creates duplicates.
    const saved = this.transaction(() => {
      let n = 0;
      if (approve) {
        const entries: LogEntry[] = (JSON.parse(String(payload || '[]')) as LogEntry[]).map((e) => upgradeLegacyLog(e));
        // The log keeps the name of the person who asked for the import.
        const asRequester: AppUser = { ...admin, displayName: String(requestedBy) };
        n = this.saveBatchLogs(entries, asRequester).length;
      }
      this.sqlite.run("UPDATE import_requests SET status = ?, decided_by = ?, decided_at = ?, payload = NULL WHERE id = ?", [approve ? 'approved' : 'rejected', admin.displayName, now, id]);
      return n;
    });
    this.addActivity({
      by: admin.displayName, action: approve ? 'created' : 'edited',
      detail: approve ? `Approved CSV import by ${requestedBy}: ${saved} connection${saved === 1 ? '' : 's'}` : `Rejected CSV import by ${requestedBy}`,
    });
    this.notify('imports');
    this.flush();
    return { status: approve ? 'approved' : 'rejected', saved };
  }

  withdrawImportRequest(id: string, user: AppUser): boolean {
    const res = this.sqlite.exec("SELECT requested_by_id FROM import_requests WHERE id = ? AND status = 'pending'", [id]);
    if (!res.length || !res[0].values.length) return false;
    if (user.role !== 'admin' && String(res[0].values[0][0]) !== user.id) return false;
    this.sqlite.run('DELETE FROM import_requests WHERE id = ?', [id]);
    this.notify('imports');
    this.flush();
    return true;
  }

  private transactionDepth = 0;
  private transaction<T>(fn: () => T): T {
    if (this.transactionDepth > 0) return fn();
    this.sqlite.run('BEGIN');
    this.transactionDepth++;
    try {
      const out = fn();
      this.sqlite.run('COMMIT');
      return out;
    } catch (err) {
      try { this.sqlite.run('ROLLBACK'); } catch { /* nothing to undo */ }
      throw err;
    } finally {
      this.transactionDepth--;
    }
  }

  saveBatchLogs(entries: LogEntry[], user: AppUser): LogEntry[] {
    return this.transaction(() => this.saveBatchLogsUnsafe(entries, user));
  }

  private saveBatchLogsUnsafe(entries: LogEntry[], user: AppUser): LogEntry[] {
    let nextNo = this.getNextLogNo();
    const savedList: LogEntry[] = [];
    for (const entry of entries) {
      const logNo = entry.logNo || nextNo++;
      const saved = this.saveLog({ ...entry, logNo }, user);
      savedList.push(saved);
    }
    return savedList;
  }

  softDeleteLog(id: string, user: AppUser): boolean {
    const res = this.sqlite.exec('SELECT log_no, customer_name FROM logs WHERE id = ?', [id]);
    if (!res.length || !res[0].values.length) return false;
    const [logNo, customerName] = res[0].values[0];

    const now = new Date().toISOString();
    this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now, user.displayName, id]);

    this.addActivity({
      by: user.displayName,
      action: 'deleted',
      logNo: Number(logNo),
      customer: String(customerName || ''),
    });

    this.notify('logs');
    return true;
  }

  softDeleteAllLogs(user: AppUser): number {
    const now = new Date().toISOString();
    const countRes = this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NULL');
    const count = Number(countRes[0]?.values[0]?.[0] || 0);

    if (count > 0) {
      this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE deleted_at IS NULL', [now, user.displayName]);
      this.addActivity({
        by: user.displayName,
        action: 'cleared',
        detail: `All ${count} connections moved to admin bin`,
      });
      this.notify('logs');
    }
    return count;
  }

  restoreLogs(imported: LogEntry[], merge: boolean, user: AppUser): number {
    const now = new Date().toISOString();
    if (!merge) {
      this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE deleted_at IS NULL', [now, user.displayName]);
    }

    for (const rawItem of imported) {
      const item = upgradeLegacyLog(rawItem);
      const id = item.id || crypto.randomUUID();
      const logNo = Number(item.logNo || 1);
      const historyJson = Array.isArray(item.history) ? JSON.stringify(item.history) : '[]';

      this.sqlite.run(
        `INSERT OR REPLACE INTO logs (
          id, log_no, date, foreman_name, foreman_phone, request_type, customer_name,
          nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
          foreman_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
          edc_no, router_serial, form_received_at, foreman_id, follow_up_date,
          deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, logNo, String(item.date || ''), String(item.foremanName || ''),
          String(item.foremanPhone || (item as any).callerPhone || ''), String(item.requestType || ''),
          String(item.customerName || ''), String(item.nmsId || ''),
          String(item.issueFound || ''), String(item.missingWrongDetails || ''),
          String(item.actionTaken || ''), String(item.reasonForAction || ''),
          String(item.foremanInformed || ''), String(item.followUpNeeded || ''),
          String(item.status || 'Resolved'), String(item.supervisorInformed || ''),
          String(item.remarks || ''), String(item.mac || ''), item.edcNo || null,
          item.routerSerial || null, item.formReceivedAt || null, item.foremanId || null,
          item.followUpDate || null, null, null,
          String(item.createdAt || now), String(item.updatedAt || now),
          item.createdBy || user.displayName, item.updatedBy || user.displayName,
          historyJson
        ]
      );
      this.writeExtras({ ...item, id });
      this.harvestSuggestions(item);
    }

    this.addActivity({
      by: user.displayName,
      action: 'restored',
      detail: `${imported.length} connections imported (${merge ? 'merged' : 'replaced'})`,
    });

    this.notify('logs');
    const cnt = this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NULL');
    return Number(cnt[0]?.values[0]?.[0] || 0);
  }

  // Foremen
  getForemen(): Foreman[] {
    const res = this.sqlite.exec('SELECT id, name, area, phone, active, created_at, deleted_at, deleted_by, photo_url, roam, roam_areas FROM foremen WHERE deleted_at IS NULL ORDER BY name ASC');
    if (!res.length) return [];
    return res[0].values.map(([id, name, area, phone, active, createdAt, deletedAt, deletedBy, photoUrl, roam, roamAreas]) => ({
      id: String(id),
      name: String(name),
      area: String(area || ''),
      phone: String(phone || ''),
      photoUrl: photoUrl ? String(photoUrl) : undefined,
      active: Number(active) === 1,
      roam: Number(roam) === 1,
      roamAreas: parseRoamAreas(roamAreas),
      createdAt: String(createdAt),
      deletedAt: deletedAt ? String(deletedAt) : undefined,
      deletedBy: deletedBy ? String(deletedBy) : undefined,
    }));
  }

  createForeman(input: { name: string; area?: string; phone?: string; photoUrl?: string }, _user: AppUser): Foreman {
    const name = input.name.trim();
    if (!name) throw new Error('Foreman name is required.');
    const area = upazilaKey(input.area);
    if (!area) throw new Error('Please choose the foreman\'s upazila.');

    const check = this.sqlite.exec(
      'SELECT id, area FROM foremen WHERE lower(name) = ? AND deleted_at IS NULL',
      [name.toLowerCase()]
    );
    if (check.length && check[0].values.some((v) => upazilaKey(String(v[1] || '')) === area)) {
      throw new Error(`${name} already exists in ${area}.`);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const phone = (input.phone || '').trim();
    const photoUrl = (input.photoUrl || '').trim();

    this.sqlite.run(
      'INSERT INTO foremen (id, name, area, phone, active, created_at, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, area, phone, 1, createdAt, photoUrl || null]
    );

    this.notify('foremen');
    return { id, name, area, phone, photoUrl: photoUrl || undefined, active: true, createdAt };
  }

  updateForeman(id: string, input: { name?: string; area?: string; phone?: string; active?: boolean; photoUrl?: string; roam?: boolean; roamAreas?: string[] }): Foreman {
    const cur = this.sqlite.exec('SELECT id, name, area, phone, active, created_at, photo_url, roam, roam_areas FROM foremen WHERE id = ?', [id]);
    if (!cur.length || !cur[0].values.length) throw new Error('Foreman not found.');

    const [, curName, curArea, curPhone, curActive, createdAt, curPhotoUrl, curRoam, curRoamAreas] = cur[0].values[0];
    const newName = input.name !== undefined ? input.name.trim() : String(curName);
    let newArea = String(curArea || '');
    if (input.area !== undefined) {
      const key = upazilaKey(input.area);
      if (!key) throw new Error('Please choose the foreman\'s upazila.');
      newArea = key;
    }
    const newPhone = input.phone !== undefined ? input.phone.trim() : String(curPhone || '');
    const newActive = input.active !== undefined ? (input.active ? 1 : 0) : Number(curActive);
    const newPhotoUrl = input.photoUrl !== undefined ? input.photoUrl.trim() : (curPhotoUrl ? String(curPhotoUrl) : '');

    if (!newName) throw new Error('Foreman name is required.');
    const dup = this.sqlite.exec(
      'SELECT id, area FROM foremen WHERE lower(name) = ? AND id <> ? AND deleted_at IS NULL',
      [newName.toLowerCase(), id]
    );
    if (dup.length && dup[0].values.some((v) => upazilaKey(String(v[1] || '')) === newArea)) {
      throw new Error(`${newName} already exists in ${newArea}.`);
    }

    const newRoam = input.roam !== undefined ? (input.roam ? 1 : 0) : Number(curRoam) === 1 ? 1 : 0;
    const newRoamAreas = input.roamAreas !== undefined
      ? Array.from(new Set(input.roamAreas.map((a) => upazilaKey(a)).filter(Boolean)))
      : parseRoamAreas(curRoamAreas);

    this.sqlite.run(
      'UPDATE foremen SET name = ?, area = ?, phone = ?, active = ?, photo_url = ?, roam = ?, roam_areas = ? WHERE id = ?',
      [newName, newArea, newPhone, newActive, newPhotoUrl || null, newRoam, newRoamAreas.join(',') || null, id]
    );
    if (newName !== String(curName)) {
      // Keep every connection of the old name: logs keep a copy of the name, so carry them over.
      // 1) logs already linked to this foreman
      this.sqlite.run('UPDATE logs SET foreman_name = ? WHERE foreman_id = ?', [newName, id]);
      // 2) older logs that only stored the name (no link yet): claim them and link them to this foreman
      const oldLc = String(curName).trim().toLowerCase();
      const sameNameOthers = this.sqlite.exec(
        'SELECT COUNT(*) FROM foremen WHERE lower(trim(name)) = ? AND id <> ? AND deleted_at IS NULL',
        [oldLc, id]
      );
      const hasTwin = Number(sameNameOthers[0]?.values[0]?.[0] || 0) > 0;
      if (!hasTwin) {
        this.sqlite.run(
          "UPDATE logs SET foreman_name = ?, foreman_id = ? WHERE (foreman_id IS NULL OR foreman_id = '') AND lower(trim(foreman_name)) = ?",
          [newName, id, oldLc]
        );
      } else {
        // another foreman shares the old name: only claim name-only logs from this foreman's own upazila
        this.sqlite.run(
          "UPDATE logs SET foreman_name = ?, foreman_id = ? WHERE (foreman_id IS NULL OR foreman_id = '') AND lower(trim(foreman_name)) = ? AND upazila = ?",
          [newName, id, oldLc, newArea]
        );
      }
    }

    this.notify('foremen');
    return { id, name: newName, area: newArea, phone: newPhone, photoUrl: newPhotoUrl || undefined, active: newActive === 1, roam: newRoam === 1, roamAreas: newRoamAreas, createdAt: String(createdAt) };
  }

  softDeleteForeman(id: string, user: AppUser): boolean {
    const now = new Date().toISOString();
    this.sqlite.run('UPDATE foremen SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now, user.displayName, id]);
    this.notify('foremen');
    return true;
  }

  // Foreman teams (members working under a foreman)
  private rowToTeamMember(row: SqlValue[]): TeamMember {
    const [id, foremanId, name, phone, role, active, createdAt, deletedAt, deletedBy] = row;
    return {
      id: String(id),
      foremanId: String(foremanId),
      name: String(name),
      phone: String(phone || ''),
      role: String(role || ''),
      active: Number(active) === 1,
      createdAt: String(createdAt),
      deletedAt: deletedAt ? String(deletedAt) : undefined,
      deletedBy: deletedBy ? String(deletedBy) : undefined,
    };
  }

  private static readonly TEAM_COLS = 'id, foreman_id, name, phone, role, active, created_at, deleted_at, deleted_by';

  getTeamMembers(): TeamMember[] {
    const res = this.sqlite.exec(`SELECT ${SQLiteDatabase.TEAM_COLS} FROM team_members WHERE deleted_at IS NULL ORDER BY name ASC`);
    if (!res.length) return [];
    return res[0].values.map((row) => this.rowToTeamMember(row));
  }

  createTeamMember(input: { foremanId: string; name: string; phone?: string; role?: string }, _user: AppUser): TeamMember {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Team member name is required.');
    const foremanId = String(input.foremanId || '');
    const rs = this.sqlite.exec('SELECT id FROM foremen WHERE id = ? AND deleted_at IS NULL', [foremanId]);
    if (!rs.length || !rs[0].values.length) throw new Error('Please choose the foreman this team member works under.');

    const dup = this.sqlite.exec(
      'SELECT id FROM team_members WHERE foreman_id = ? AND lower(name) = ? AND deleted_at IS NULL',
      [foremanId, name.toLowerCase()]
    );
    if (dup.length && dup[0].values.length) throw new Error(`${name} is already in this foreman's team.`);

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const phone = String(input.phone || '').trim();
    const role = String(input.role || '').trim();
    this.sqlite.run(
      'INSERT INTO team_members (id, foreman_id, name, phone, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [id, foremanId, name, phone, role, createdAt]
    );
    this.notify('foremen');
    return { id, foremanId, name, phone, role, active: true, createdAt };
  }

  updateTeamMember(id: string, input: { name?: string; phone?: string; role?: string; active?: boolean }): TeamMember {
    const cur = this.sqlite.exec(`SELECT ${SQLiteDatabase.TEAM_COLS} FROM team_members WHERE id = ?`, [id]);
    if (!cur.length || !cur[0].values.length) throw new Error('Team member not found.');
    const m = this.rowToTeamMember(cur[0].values[0]);

    const name = input.name !== undefined ? input.name.trim() : m.name;
    if (!name) throw new Error('Team member name is required.');
    const phone = input.phone !== undefined ? input.phone.trim() : m.phone;
    const role = input.role !== undefined ? input.role.trim() : m.role;
    const active = input.active !== undefined ? input.active : m.active;

    const dup = this.sqlite.exec(
      'SELECT id FROM team_members WHERE foreman_id = ? AND lower(name) = ? AND id <> ? AND deleted_at IS NULL',
      [m.foremanId, name.toLowerCase(), id]
    );
    if (dup.length && dup[0].values.length) throw new Error(`${name} is already in this foreman's team.`);

    this.sqlite.run('UPDATE team_members SET name = ?, phone = ?, role = ?, active = ? WHERE id = ?', [name, phone, role, active ? 1 : 0, id]);
    this.notify('foremen');
    return { ...m, name, phone, role, active };
  }

  softDeleteTeamMember(id: string, user: AppUser): boolean {
    this.sqlite.run('UPDATE team_members SET deleted_at = ?, deleted_by = ? WHERE id = ?', [new Date().toISOString(), user.displayName, id]);
    this.notify('foremen');
    return true;
  }

  // Admin Bin
  getBin(): { logs: LogEntry[]; foremen: Foreman[] } {
    const logRes = this.sqlite.exec('SELECT * FROM logs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    const logs = logRes.length ? logRes[0].values.map(r => this.rowToLog(r)) : [];

    const resRes = this.sqlite.exec('SELECT id, name, area, phone, active, created_at, deleted_at, deleted_by FROM foremen WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    const foremen = resRes.length ? resRes[0].values.map(([id, name, area, phone, active, createdAt, deletedAt, deletedBy]) => ({
      id: String(id),
      name: String(name),
      area: String(area || ''),
      phone: String(phone || ''),
      active: Number(active) === 1,
      createdAt: String(createdAt),
      deletedAt: deletedAt ? String(deletedAt) : undefined,
      deletedBy: deletedBy ? String(deletedBy) : undefined,
    })) : [];

    return { logs, foremen };
  }

  restoreBinLog(id: string): boolean {
    this.sqlite.run('UPDATE logs SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    this.notify('logs');
    return true;
  }

  restoreBinForeman(id: string): boolean {
    this.sqlite.run('UPDATE foremen SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    this.notify('foremen');
    return true;
  }

  purgeBinLog(id: string): boolean {
    this.sqlite.run('DELETE FROM logs WHERE id = ?', [id]);
    try { fs.unlinkSync(attachFile(id)); } catch { /* no attachment */ }
    this.notify('logs');
    return true;
  }

  purgeBinForeman(id: string): boolean {
    this.sqlite.run('DELETE FROM foremen WHERE id = ?', [id]);
    this.notify('foremen');
    return true;
  }

  emptyBin(): number {
    const countLogs = Number(this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NOT NULL')[0]?.values[0]?.[0] || 0);
    const countForemen = Number(this.sqlite.exec('SELECT COUNT(*) FROM foremen WHERE deleted_at IS NOT NULL')[0]?.values[0]?.[0] || 0);

    const binIds = (this.sqlite.exec('SELECT id FROM logs WHERE deleted_at IS NOT NULL')[0]?.values || []).map((v) => String(v[0]));
    this.sqlite.run('DELETE FROM logs WHERE deleted_at IS NOT NULL');
    for (const id of binIds) { try { fs.unlinkSync(attachFile(id)); } catch { /* no attachment */ } }
    this.sqlite.run('DELETE FROM foremen WHERE deleted_at IS NOT NULL');

    this.notify('logs');
    this.notify('foremen');
    return countLogs + countForemen;
  }

  // Suggestions
  getSuggestions(): FieldSuggestionsMap {
    const res = this.sqlite.exec('SELECT field, values_json FROM suggestions');
    const map: FieldSuggestionsMap = { ...INITIAL_SUGGESTIONS };
    if (res.length) {
      for (const [field, valuesJson] of res[0].values) {
        try {
          const parsed = JSON.parse(String(valuesJson));
          if (Array.isArray(parsed)) {
            map[field as LogFieldKey] = parsed;
          }
        } catch {
          /* ignore */
        }
      }
    }
    // Legacy: the old "callerPhone" suggestions now belong to foreman phone
    const legacy = (map as Record<string, string[]>)['callerPhone'];
    if (legacy) {
      const merged = [...(map.foremanPhone || [])];
      for (const v of legacy) if (!merged.includes(v)) merged.push(v);
      map.foremanPhone = merged;
      delete (map as Record<string, string[]>)['callerPhone'];
    }
    return map;
  }

  saveSuggestions(suggestions: FieldSuggestionsMap) {
    for (const [field, values] of Object.entries(suggestions)) {
      this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
        field,
        JSON.stringify(values),
      ]);
    }
    this.notify('suggestions');
  }

  harvestSuggestions(entry: Partial<LogEntry>): FieldSuggestionsMap {
    const current = this.getSuggestions();
    const keys: LogFieldKey[] = [
      'foremanName', 'foremanPhone', 'requestType', 'customerName', 'nmsId',
      'issueFound', 'missingWrongDetails', 'actionTaken', 'reasonForAction',
      'foremanInformed', 'followUpNeeded', 'status', 'supervisorInformed',
      'remarks', 'mac'
    ];

    let changed = false;
    for (const key of keys) {
      const val = String(entry[key] || '').trim();
      if (!val) continue;
      const existing = current[key] || [];
      if (!existing.some(x => x.toLowerCase() === val.toLowerCase())) {
        current[key] = [val, ...existing];
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          key,
          JSON.stringify(current[key]),
        ]);
        changed = true;
      }
    }

    if (changed) {
      this.notify('suggestions');
    }
    return current;
  }

  // Activity
  getActivity(): ActivityEvent[] {
    const res = this.sqlite.exec('SELECT id, at, by_user, action, log_no, customer, detail FROM activity ORDER BY at DESC LIMIT 200');
    if (!res.length) return [];
    return res[0].values.map(([id, at, by, action, logNo, customer, detail]) => ({
      id: String(id),
      at: String(at),
      by: String(by),
      action: action as any,
      logNo: logNo ? String(logNo) : undefined,
      customer: customer ? String(customer) : undefined,
      detail: detail ? String(detail) : undefined,
    }));
  }

  addActivity(event: Omit<ActivityEvent, 'id' | 'at'>) {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    this.sqlite.run(
      'INSERT INTO activity (id, at, by_user, action, log_no, customer, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, at, event.by, event.action, event.logNo ? String(event.logNo) : null, event.customer || null, event.detail || null]
    );
    this.notify('activity', { id, at, ...event });
  }

  seedAllForemen() {
    const list: { name: string; area: string; phone: string }[] = [
      { name: 'Salam', area: 'Bishwanath', phone: '+880 1712-238545' },
      { name: 'Shuhag', area: 'Beanibazar', phone: '+880 1805-983971' },
      { name: 'Shabul', area: 'Balaganj', phone: '+880 1680-945894' },
      { name: 'Jubayer', area: 'Dakshin Surma', phone: '+880 1748-075240' },
      { name: 'Joshim', area: 'Sylhet Sadar', phone: '+880 1713-476562' },
      { name: 'Jamal', area: 'Zakiganj', phone: '+880 1745-963663' },
      { name: 'Munna', area: 'Sylhet Sadar', phone: '+880 1713-476556' },
      { name: 'Liton', area: 'Sylhet Sadar', phone: '' },
      { name: 'Sultan', area: 'Zakiganj', phone: '' },
      { name: 'Jakir', area: 'Beanibazar', phone: '' },
      { name: 'Javed', area: 'Beanibazar', phone: '' },
      { name: 'Al-amin', area: 'Golapganj', phone: '' },
      { name: 'Mrinal', area: 'Sylhet Sadar', phone: '' },
      { name: 'Kawsar', area: 'Zakiganj', phone: '' },
      { name: 'Monir', area: 'Zakiganj', phone: '' },
      { name: 'Masud', area: 'Beanibazar', phone: '' },
      { name: 'Kuddus', area: 'Beanibazar', phone: '' },
      { name: 'Iqbal', area: 'Beanibazar', phone: '' },
      { name: 'Kalam', area: 'Sylhet Sadar', phone: '' },
      { name: 'Shahel', area: 'Dakshin Surma', phone: '' },
      { name: 'Evan', area: 'Sylhet Sadar', phone: '' },
      { name: 'Khairul', area: 'Jaintiapur', phone: '' },
      { name: 'Nahim', area: 'Kanaighat', phone: '' },
      { name: 'Rubel', area: 'Osmani Nagar', phone: '' },
      { name: 'Rupok', area: 'Zakiganj', phone: '' },
      { name: 'Washim', area: 'Dakshin Surma', phone: '' },
      { name: 'Kashem', area: 'Beanibazar', phone: '' },
      { name: 'Razon', area: 'Sylhet Sadar', phone: '' },
      { name: 'Raton', area: 'Fenchuganj', phone: '' },
      { name: 'Raihan', area: 'Companiganj', phone: '' },
      { name: 'Faisal', area: 'Zakiganj', phone: '' },
      { name: 'Mustaiem', area: 'Golapganj', phone: '' },
      { name: 'Joinal', area: 'Golapganj', phone: '' },
      { name: 'Syed', area: 'Beanibazar', phone: '' },
      { name: 'Faruk', area: 'Fenchuganj', phone: '' },
      { name: 'Anowar', area: 'Zakiganj', phone: '' },
      { name: 'Mursalin', area: 'Fenchuganj', phone: '' },
      { name: 'Sohag-Ahmed', area: 'Beanibazar', phone: '' },
      { name: 'Hassan', area: 'Gowainghat', phone: '' },
      { name: 'Uzzal', area: 'Beanibazar', phone: '' },
      { name: 'Shahab', area: 'Beanibazar', phone: '' },
      { name: 'Nojmul', area: 'Beanibazar', phone: '' },
      { name: 'Zia', area: 'Beanibazar', phone: '' },
      { name: 'Monjur', area: 'Kanaighat', phone: '' },
      { name: 'Ruhel', area: 'Dakshin Surma', phone: '' },
    ];

    // Only seed a brand-new database. Seeding on every start would bring back old names
    // (e.g. a foreman renamed from Jamal to Kalam would reappear as Jamal).
    const existing = Number(this.sqlite.exec('SELECT COUNT(*) FROM foremen')[0]?.values[0]?.[0] || 0);
    if (existing > 0) return;

    const now = new Date().toISOString();
    let addedCount = 0;
    for (const item of list) {
      const area = upazilaKey(item.area) || item.area;
      const check = this.sqlite.exec('SELECT id, area, phone FROM foremen WHERE lower(name) = ?', [item.name.toLowerCase()]);
      if (check.length && check[0].values.length) {
        const [id, exArea, exPhone] = check[0].values[0];
        const newArea = exArea ? String(exArea) : area;
        const newPhone = exPhone ? String(exPhone) : item.phone;
        this.sqlite.run('UPDATE foremen SET area = ?, phone = ? WHERE id = ?', [newArea, newPhone, id]);
      } else {
        const id = crypto.randomUUID();
        this.sqlite.run(
          'INSERT INTO foremen (id, name, area, phone, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
          [id, item.name, area, item.phone || '', now]
        );
        addedCount++;
      }
    }
    if (addedCount > 0) {
      console.log(`[Pace IT] Seeded ${addedCount} new foremen into database.`);
    }
  }
}

export const db = new SQLiteDatabase();

// Never lose the last few changes when the server is stopped (Ctrl+C, service stop, window closed).
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    db.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('SIGHUP', shutdown); // console window closed
process.on('exit', () => {
  try {
    db.close();
  } catch {
    /* nothing more to do */
  }
});
