import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export interface IndexEntry {
  sheet: string;
  data: {
    name: string; mobile: string; union: string; upazila: string; source_no: string;
    connection_nms: string; institution_code: string; lat_long: string; router_serial: string; router_mac: string;
  };
}
export type EdcIndex = Record<string, IndexEntry[]>;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JSON_PATH = path.join(DATA_DIR, 'index.json');
// Ready-made copy of the parsed workbook, so a restart does not have to parse the Excel again.
const CACHE_PATH = path.join(DATA_DIR, 'edc-cache.dat');

let cache: { key: string; index: EdcIndex; source: string } | null = null;

const nfc = (s: unknown) => String(s ?? '').normalize('NFC').trim();
const norm = (s: unknown) => nfc(s).toLowerCase().replace(/[\s._\-\/]+/g, '');

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return nfc(v);
}

function findExcel(): string | null {
  try {
    const files = fs.readdirSync(DATA_DIR).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
    if (!files.length) return null;
    files.sort((a, b) => Number(/toscrape/i.test(b)) - Number(/toscrape/i.test(a)) || a.localeCompare(b));
    return path.join(DATA_DIR, files[0]);
  } catch {
    return null;
  }
}

function mapHeader(row: unknown[]): Record<string, number> | null {
  const find = (...keys: string[]) => {
    const wanted = keys.map(norm);
    return row.findIndex((h) => wanted.some((k) => norm(h).startsWith(k)));
  };
  const no = find('ক্রমিক');
  if (no < 0) return null;
  return {
    no,
    upazila: find('উপজেলা', 'upazila'),
    union: find('ইউনিয়ন', 'union'),
    name: find('প্রতিষ্ঠানের', 'institute', 'name'),
    mobile: find('মোবাইল', 'mobile'),
    code: find('emis'),
  };
}

function parseWorkbook(file: string): EdcIndex {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: false, dense: true, sheetRows: 20000 });
  const out: EdcIndex = {};
  for (const sheetName of wb.SheetNames) {
    // "SD-133" style sheets are the master list that repeats every upazila sheet - skip them.
    if (/^sd-?\d+/i.test(sheetName.trim())) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    // Some sheets (e.g. সিলেট সদর) have no header row, so start from the standard column layout.
    let cols: Record<string, number> = { no: 1, upazila: 5, union: 6, name: 8, mobile: 10, code: 12 };
    for (const row of rows) {
      const header = mapHeader(row);
      if (header) {
        cols = header;
        continue;
      }
      let key = cell(row[cols.no]).replace(/\.0+$/, '');
      if (!/^\d+$/.test(key)) continue;
      const get = (i: number) => (i >= 0 ? cell(row[i]) : '');
      let mobile = get(cols.mobile);
      if (/^1\d{9}$/.test(mobile)) mobile = '0' + mobile; // Excel dropped the leading zero
      (out[key] ||= []).push({
        sheet: sheetName,
        data: {
          name: get(cols.name), mobile, union: get(cols.union),
          upazila: get(cols.upazila) || sheetName, source_no: key,
          connection_nms: '', institution_code: get(cols.code), lat_long: '', router_serial: '', router_mac: '',
        },
      });
    }
  }
  return out;
}

export function getEdcIndex(): EdcIndex {
  const xlsx = findExcel();
  try {
    const key = xlsx ? `x:${xlsx}:${fs.statSync(xlsx).mtimeMs}:${fs.statSync(xlsx).size}` : fs.existsSync(JSON_PATH) ? `j:${fs.statSync(JSON_PATH).mtimeMs}` : 'none';
    if (cache && cache.key === key) return cache.index;

    if (xlsx) {
      try {
        // 1. fast path: cache file written from this exact workbook version
        try {
          if (fs.existsSync(CACHE_PATH)) {
            const saved = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
            if (saved && saved.key === key && saved.index && Object.keys(saved.index).length > 0) {
              cache = { key, index: saved.index, source: path.basename(xlsx) };
              return saved.index;
            }
          }
        } catch { /* cache unreadable - parse the workbook */ }

        const t0 = Date.now();
        const index = parseWorkbook(xlsx);
        const n = Object.keys(index).length;
        if (n > 0) {
          cache = { key, index, source: path.basename(xlsx) };
          console.log(`[Pace IT] EDC index loaded from ${path.basename(xlsx)}: ${n} EDC numbers (${Date.now() - t0} ms).`);
          try { fs.writeFileSync(CACHE_PATH, JSON.stringify({ key, index })); } catch { /* non-fatal */ }
          return index;
        }
        console.warn(`[Pace IT] ${path.basename(xlsx)} has no rows with an EDC number (ক্রমিক নং.) - using index.json instead.`);
      } catch (err: any) {
        console.error(`[Pace IT] Could not read ${path.basename(xlsx)}:`, err?.message || err);
      }
    }
    if (fs.existsSync(JSON_PATH)) {
      const index = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
      cache = { key, index, source: 'index.json' };
      console.log(`[Pace IT] EDC index loaded from index.json: ${Object.keys(index).length} EDC numbers.`);
      return index;
    }
  } catch (err: any) {
    console.error('[Pace IT] EDC index error:', err?.message || err);
  }
  console.warn('[Pace IT] No EDC data found. Put toscrape.xlsx (or index.json) in the data folder.');
  cache = { key: 'none', index: {}, source: 'none' };
  return cache.index;
}

export function edcIndexSource(): string {
  getEdcIndex();
  return cache?.source || 'none';
}
