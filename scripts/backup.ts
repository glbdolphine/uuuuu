import fs from 'fs';
import path from 'path';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';

const DATA = path.resolve(process.cwd(), 'data');
const LIVE_DB = path.join(DATA, 'pace_it.sqlite');
const LIVE_FILES = path.join(DATA, 'files', 'upac');

const args = process.argv.slice(2);
let keep = Number(process.env.PACE_BACKUP_KEEP || 30);
let destArg = process.env.PACE_BACKUP_DIR || '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep') keep = Number(args[++i]);
  else if (!args[i].startsWith('--')) destArg = args[i];
}
if (!Number.isInteger(keep) || keep < 1) {
  console.error('--keep must be a whole number of 1 or more.');
  process.exit(2);
}
const DEST = path.resolve(destArg || path.join(process.cwd(), '..', 'paceit-backups'));

function die(msg: string): never {
  console.error('\nBACKUP FAILED: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(LIVE_DB)) die(`No database at ${LIVE_DB}. Run this from the project folder (the one containing "data").`);
const rel = path.relative(DATA, DEST);
if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
  die('The backup folder must be outside the data folder. Choose another folder, ideally on another drive.');
}

const DB_DIR = path.join(DEST, 'db');
const FILES_DIR = path.join(DEST, 'files', 'upac');
fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

// one backup at a time
const lock = path.join(DEST, '.backup.lock');
try {
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
} catch {
  const age = Date.now() - fs.statSync(lock).mtimeMs;
  if (age < 6 * 3600 * 1000) die(`Another backup seems to be running (${lock}). If not, delete that file and try again.`);
  fs.writeFileSync(lock, String(process.pid));
}
process.on('exit', () => { try { fs.unlinkSync(lock); } catch { /* already gone */ } });

try {
  if (fs.statSync(DEST).dev === fs.statSync(DATA).dev) {
    console.log('NOTE: the backup folder is on the same drive as the live data. A drive failure would lose both.\n      Point the backup at another drive or machine.');
  }
} catch { /* not important */ }

const two = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
const snapshot = path.join(DB_DIR, `pace_it-${stamp}.sqlite`);

async function main() {
  // 1. database snapshot (consistent even while the server is writing)
  console.log('1/4 Database snapshot ...');
  const src = new DatabaseSync(LIVE_DB, { readOnly: true });
  const tmp = snapshot + '.tmp';
  fs.rmSync(tmp, { force: true });
  try {
    await sqliteBackup(src, tmp);
  } finally {
    src.close();
  }
  // make the snapshot one self-contained file (no -wal/-shm companions), then check it
  const check = new DatabaseSync(tmp);
  check.exec('PRAGMA journal_mode = DELETE');
  const integrity = (check.prepare('PRAGMA integrity_check').get() as Record<string, unknown>).integrity_check;
  const wanted = (check.prepare("SELECT id, upac_form_name FROM logs WHERE upac_form_name IS NOT NULL AND upac_form_name <> ''").all() as { id: string; upac_form_name: string }[]).map((r) => r.id);
  const logCount = (check.prepare('SELECT COUNT(*) AS c FROM logs').get() as { c: number }).c;
  check.close();
  for (const ext of ['-wal', '-shm']) fs.rmSync(tmp + ext, { force: true });
  if (integrity !== 'ok') {
    fs.rmSync(tmp, { force: true });
    die(`The snapshot failed SQLite's integrity check (${integrity}). Nothing was kept.`);
  }
  fs.renameSync(tmp, snapshot);

  // 2. mirror the attached forms (copy what is new or changed; never delete anything from the mirror)
  console.log('2/4 Attached forms ...');
  const safe = (id: string) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  let copied = 0, unchanged = 0;
  if (fs.existsSync(LIVE_FILES)) {
    for (const name of fs.readdirSync(LIVE_FILES)) {
      if (name.endsWith('.tmp')) continue; // an upload in progress
      const from = path.join(LIVE_FILES, name);
      const to = path.join(FILES_DIR, name);
      let st: fs.Stats;
      try { st = fs.statSync(from); } catch { continue; } // removed meanwhile
      if (!st.isFile()) continue;
      if (fs.existsSync(to)) {
        const t = fs.statSync(to);
        if (t.size === st.size && Math.abs(t.mtimeMs - st.mtimeMs) < 2500) { unchanged++; continue; }
      }
      const part = to + '.part';
      fs.copyFileSync(from, part);
      fs.utimesSync(part, st.atime, st.mtime);
      fs.renameSync(part, to);
      copied++;
    }
  }

  // 3. check the result
  console.log('3/4 Checking the backup ...');
  const problems: string[] = [];
  let present = 0, goneFromLive = 0;
  for (const id of wanted) {
    const file = safe(id);
    const mirrored = path.join(FILES_DIR, file);
    const live = path.join(LIVE_FILES, file);
    if (fs.existsSync(mirrored)) {
      if (fs.existsSync(live) && fs.statSync(live).size !== fs.statSync(mirrored).size) problems.push(`form of log ${id} differs in size from the live file`);
      else present++;
    } else if (!fs.existsSync(live)) {
      goneFromLive++; // the database lists a form that is not on disk at all: report, it is not a backup fault
    } else {
      problems.push(`form of log ${id} is missing from the backup`);
    }
  }

  // 4. retention (database snapshots only; the forms mirror keeps everything)
  console.log('4/4 Removing old snapshots ...');
  const snaps = fs.readdirSync(DB_DIR).filter((f) => /^pace_it-\d{8}-\d{6}\.sqlite$/.test(f)).sort().reverse();
  for (const f of snaps.slice(keep)) fs.unlinkSync(path.join(DB_DIR, f));
  for (const f of fs.readdirSync(DB_DIR)) if (/\.tmp(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(DB_DIR, f), { force: true }); // leftovers of an interrupted run

  const mb = (fs.statSync(snapshot).size / 1048576).toFixed(1);
  console.log(`\nDatabase snapshot: ${path.basename(snapshot)} (${mb} MB, ${logCount} logs, integrity ok)`);
  console.log(`Forms: ${present} of ${wanted.length} referenced forms verified in the backup (${copied} copied now, ${unchanged} already there)`);
  console.log(`Snapshots kept: ${Math.min(snaps.length, keep)} (newest ${keep})  |  Backup folder: ${DEST}`);
  if (goneFromLive) console.log(`WARNING: ${goneFromLive} form(s) listed in the database are missing from data/files/upac and so from the backup too.`);
  if (problems.length) {
    problems.slice(0, 10).forEach((p) => console.error('  PROBLEM: ' + p));
    die(`${problems.length} problem(s) found. Do not rely on this backup.`);
  }
  console.log('\nBACKUP OK');
}

main().catch((e) => die(String(e?.stack || e)));
