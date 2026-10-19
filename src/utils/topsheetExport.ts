// "Top Sheet" export (End user connectivity completion certificate summary), laid out like the
// "New_Top_Sheet_SADAR" sample: one sheet per upazila, at most 20 institutes per sheet. An upazila with more
// than 20 institutes is split into several sheets, and the SL number keeps counting (1-20, 21-40, ...).
import type { Worksheet, Workbook, Alignment, Borders } from 'exceljs';
import type { LogEntry, Foreman } from '../types';
import { logUpazila, upazilaBn, UPAZILAS } from './upazilas';
import { displayCategory, CATEGORY_LABELS } from './category';
import { TOPSHEET_LOGO_BASE64 } from './topsheetLogo';

export const TOPSHEET_PAGE_SIZE = 20;
export const PACKAGE_NO = 'SD-133';
export const DIVISION = 'SYLHET';
const DISTRICT = 'সিলেট';

const DEPARTMENT: Record<string, string> = {
  'Primary Education': 'প্রাথমিক শিক্ষা অধিদপ্তর',
  'Secondary and Higher Secondary Education': 'মাধ্যমিক ও উচ্চশিক্ষা অধিদপ্তর',
  'Health Service': 'স্বাস্থ্য ও পরিবার কল্যাণ মন্ত্রণালয়',
  'Technical Education': 'কারিগরি শিক্ষা',
  'Ministry of Law': 'আইন মন্ত্রণালয়',
  'Department of Social Services': 'সমাজসেবা অধিদপ্তর',
  'Diabetic Association of Bangladesh': 'বাংলাদেশ ডায়াবেটিক সমিতি',
  'National University': 'জাতীয় বিশ্ববিদ্যালয়',
  'Madrasa Education': 'মাদ্রাসা শিক্ষা অধিদপ্তর',
  'Land Reform Board': 'ভূমি সংস্কার বোর্ড',
  'Govt. Organization': 'সরকারি প্রতিষ্ঠান',
};

const BN = '০১২৩৪৫৬৭৮৯';
const bnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN[Number(d)]);
const numOrText = (v?: string | number | null): string | number => {
  const t = String(v ?? '').trim();
  return /^\d{1,15}$/.test(t) ? Number(t) : t;
};

export const HEAD = ['SL No.', 'EDC Book No.', 'Package No.', 'District', 'Upazila', 'Union', 'Name of Department/ Organization',
  'Institute/Organization Name', 'Contact Person Name', 'Contact Person Mobile No.', 'NMS ID', 'Length of Optical Fiber'];
// Column widths, row heights, margins, merges and borders are copied from New_Top_Sheet_balagonj.xlsx.
export const WIDTHS = [10.81, 14.47, 13.89, 10.61, 11.19, 12.51, 25.45, 26.8, 15.25, 13.29, 8.65, 13.89];

// Fonts: every Bangla run is Nikosh, every English letter / number run is Times New Roman.
const NIKOSH = 'Nikosh';
const TNR = 'Times New Roman';
const BN_CHAR = /[ঀ-৿‌‍]/;
const LATIN_CHAR = /[A-Za-z0-9]/;
export function cleanText(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
    .replace(/\u09AF\u09BC/g, '\u09DF').replace(/\u09A1\u09BC/g, '\u09DC').replace(/\u09A2\u09BC/g, '\u09DD');
}
export type Run = { text: string; bn: boolean };
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let pendingNeutral = '';
  for (const ch of text) {
    const bn = BN_CHAR.test(ch);
    const neutral = !bn && !LATIN_CHAR.test(ch); // spaces / punctuation join the run before them
    const last = runs[runs.length - 1];
    if (neutral) { if (last) last.text += ch; else pendingNeutral += ch; continue; }
    if (last && last.bn === bn) last.text += ch;
    else runs.push({ text: pendingNeutral + ch, bn }), pendingNeutral = '';
  }
  if (!runs.length) runs.push({ text: pendingNeutral, bn: false });
  return runs;
}
const edge = { style: 'thin' as const };
const box = { top: edge, bottom: edge, left: edge, right: edge };

// Rows (same as the sample, with room for 20 institutes): header 8, data 9-28, instruction 30, signatures 37-39.
const FIRST = 9;
const LAST = FIRST + TOPSHEET_PAGE_SIZE - 1; // 28
const NOTE_ROW = LAST + 2; // 30
const SIGN_ROW = NOTE_ROW + 7; // 37
const END_ROW = SIGN_ROW + 2; // 39

export interface Item { l: LogEntry; sl: number }

export function topsheetValues(l: LogEntry, sl: number, upazilaBnName: string): (string | number)[] {
  const cat = displayCategory(l);
  return [
    sl, numOrText(l.edcNo), PACKAGE_NO, DISTRICT, upazilaBnName, (l.unionName || '').trim(),
    DEPARTMENT[cat] || cat, l.nameBn || l.customerName || l.nameEn || '', (l.headTeacherName || '').trim(),
    bnDigits(String(l.headTeacherPhone ?? '').trim()), numOrText(l.nmsId), numOrText(l.fiberLength),
  ];
}

// Fixed texts (shared by the Excel and PDF exports).
export const TITLES = ['তথ্য ও যোগাযোগ প্রযুক্তি অধিদপ্তর', 'ডিজিটাল সংযোগ স্থাপন প্রকল্প',
  'End user connectivity সংক্রান্ত কার্জ সম্পাদন সনদপত্র এর সার-সংক্ষেপ (Top Sheet)'];
export const NOTE = 'নির্দেশিকা: ISP প্রতিষ্ঠান কর্তৃক পূরণকৃত প্রতিটি সার-সংক্ষেপ (Top Sheet) উপজেলা ও জেলা আইসিটি কর্মকর্তা যাচাই বাছাই করে প্রকল্প পরিচালক বরাবর প্রেরণ করা হলো।';
export const SIGN_LEFT = ['উপজেলা সহকারী প্রোগ্রামার/', 'সহকারী নেটওয়ার্ক ইঞ্জিনিয়ার /', 'দায়িত্বপ্রাপ্ত কর্মকর্তাঃ'];
export const SIGN_RIGHT = 'জেলা প্রোগ্রামার / দায়িত্বপ্রাপ্ত কর্মকর্তাঃ';
export const INFO_LINE = ['Package No.: ' + PACKAGE_NO, 'Name of ISP: PACE IT', 'Division: ' + DIVISION];
export const ROW_HEIGHTS: Record<number, number> = (() => {
  const h: Record<number, number> = { 1: 9.75, 2: 17.35, 3: 20.25, 4: 24, 5: 15, 6: 24, 7: 20.25, 8: 46.5, 29: 9.75, 30: 38.2,
    31: 18.55, 32: 18.55, 33: 18.55, 34: 18.55, 35: 14.25, 36: 14.25, 37: 19.5, 38: 19.5, 39: 19.5 };
  for (let r = 9; r <= 28; r++) h[r] = 14.25;
  return h;
})();

function buildSheet(wb: Workbook, name: string, upazilaBnName: string, items: Item[], logoId: number) {
  const ws: Worksheet = wb.addWorksheet(name, {
    views: [{ showGridLines: true, zoomScale: 80 }],
    properties: { defaultRowHeight: 14.25 },
    pageSetup: {
      // A4 landscape, forced onto exactly one page (Excel picks the scale, ~81% like the sample), centred, no manual resize.
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, scale: 81,
      horizontalCentered: true, verticalCentered: false, showGridLines: false, blackAndWhite: false,
      margins: { left: 0.31, right: 0.17, top: 0.24, bottom: 0.17, header: 0.51, footer: 0.51 },
      printArea: `A1:L${END_ROW}`,
    },
  });
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const setH = (r: number, h: number) => { ws.getRow(r).height = h; };
  [[1, 9.75], [2, 17.35], [3, 20.25], [4, 24], [5, 15], [6, 24], [7, 20.25], [8, 46.5], [LAST + 1, 9.75], [NOTE_ROW, 38.2],
    [NOTE_ROW + 1, 18.55], [NOTE_ROW + 2, 18.55], [NOTE_ROW + 3, 18.55], [NOTE_ROW + 4, 18.55], [NOTE_ROW + 5, 14.25], [NOTE_ROW + 6, 14.25],
    [SIGN_ROW, 19.5], [SIGN_ROW + 1, 19.5], [SIGN_ROW + 2, 19.5]].forEach(([r, h]) => setH(r, h));

  const setBorder = (r: number, col: number, border: Partial<Borders>) => {
    const c = ws.getCell(r, col);
    c.style = { ...c.style, border: { ...border } };
  };

  const put = (r: number, col: number, text: string | number, size: number, bold: boolean,
    align: Partial<Alignment>) => {
    const c = ws.getCell(r, col);
    if (typeof text === 'string') text = cleanText(text);
    const str = String(text);
    const runs = typeof text === 'number' ? [{ text: str, bn: false }] : splitRuns(str);
    const f = (bn: boolean) => ({ name: bn ? NIKOSH : TNR, size, bold });
    if (runs.length === 1) { c.value = text; c.font = f(runs[0].bn); }
    else { c.value = { richText: runs.map((x) => ({ text: x.text, font: f(x.bn) })) }; c.font = f(runs[0].bn); }
    c.alignment = align;
    return c;
  };

  // Titles
  const title = (r: number, text: string, size: number) => {
    ws.mergeCells(r, 1, r, 12);
    put(r, 1, text, size, true, { horizontal: 'center', vertical: 'middle' });
  };
  title(2, 'তথ্য ও যোগাযোগ প্রযুক্তি অধিদপ্তর', 14);
  title(3, 'ডিজিটাল সংযোগ স্থাপন প্রকল্প', 14);
  title(4, 'End user connectivity সংক্রান্ত কার্জ সম্পাদন সনদপত্র এর সার-সংক্ষেপ (Top Sheet)', 14);
  // Logo: same anchor / size as the sample (1092240 x 704520 EMU, starting at column A / row 2).
  ws.addImage(logoId, {
    tl: { nativeCol: 0, nativeColOff: 190440, nativeRow: 1, nativeRowOff: 57240 } as any,
    ext: { width: 1092240 / 9525, height: 704520 / 9525 }, editAs: 'oneCell',
  } as any);

  // Package / ISP / Division line: three single cells (A:D, E:H, I:L), each centred. E:H sits on the page's centre line
  // and A:D / I:L are about the same width, so the line is symmetric about the table.
  [[1, 4, 'Package No.: ' + PACKAGE_NO], [5, 8, 'Name of ISP: PACE IT'], [9, 12, 'Division: ' + DIVISION]].forEach(([c1, c2, text]) => {
    ws.mergeCells(6, c1 as number, 6, c2 as number);
    put(6, c1 as number, text as string, 12, true, { horizontal: 'center', vertical: 'middle' });
  });

  // Column headings
  HEAD.forEach((h, i) => {
    const c = put(8, i + 1, h, 11, true, { horizontal: 'center', vertical: 'middle', wrapText: i !== 0 });
    c.border = box;
  });

  // Institutes
  items.forEach(({ l, sl }, i) => {
    const r = FIRST + i;
    const vals = topsheetValues(l, sl, upazilaBnName);
    vals.forEach((v, j) => {
      const c = put(r, j + 1, v, 11, false, { horizontal: 'center', vertical: 'middle', shrinkToFit: j >= 5 && j <= 8 });
      c.border = box;
    });
    setH(r, 14.25);
  });
  for (let r = FIRST + items.length; r <= LAST; r++) setH(r, 14.25);

  // Instruction note (box around A30:L30)
  ws.mergeCells(NOTE_ROW, 1, NOTE_ROW, 12);
  put(NOTE_ROW, 1, 'নির্দেশিকা: ISP প্রতিষ্ঠান কর্তৃক পূরণকৃত প্রতিটি সার-সংক্ষেপ (Top Sheet) উপজেলা ও জেলা আইসিটি কর্মকর্তা যাচাই বাছাই করে প্রকল্প পরিচালক বরাবর প্রেরণ করা হলো।',
    15, true, { horizontal: 'center', vertical: 'middle', wrapText: true });
  for (let c = 1; c <= 12; c++) {
    setBorder(NOTE_ROW, c, { top: edge, bottom: edge, left: c === 1 ? edge : undefined, right: c === 12 ? edge : undefined });
  }

  // Signature boxes
  ws.mergeCells(SIGN_ROW, 1, SIGN_ROW, 4); ws.mergeCells(SIGN_ROW + 1, 1, SIGN_ROW + 1, 4); ws.mergeCells(SIGN_ROW + 2, 1, SIGN_ROW + 2, 4);
  ['উপজেলা সহকারী প্রোগ্রামার/', 'সহকারী নেটওয়ার্ক ইঞ্জিনিয়ার /', 'দায়িত্বপ্রাপ্ত কর্মকর্তাঃ'].forEach((t, i) =>
    put(SIGN_ROW + i, 1, t, 14, true, { horizontal: 'center', vertical: 'middle' }));
  ws.mergeCells(SIGN_ROW, 9, SIGN_ROW + 2, 12); // I:L mirrors A:D (about the same width)
  put(SIGN_ROW, 9, 'জেলা প্রোগ্রামার / দায়িত্বপ্রাপ্ত কর্মকর্তাঃ', 14, true, { horizontal: 'center', vertical: 'middle', wrapText: true });
  const outline = (c1: number, c2: number) => {
    for (let r = SIGN_ROW; r <= END_ROW; r++) for (let c = c1; c <= c2; c++) {
      setBorder(r, c, {
        top: r === SIGN_ROW ? edge : undefined, bottom: r === END_ROW ? edge : undefined,
        left: c === c1 ? edge : undefined, right: c === c2 ? edge : undefined,
      });
    }
  };
  outline(1, 4); outline(9, 12);
  return ws;
}

export function planTopsheets(rows: LogEntry[], foremen: Foreman[]): { key: string; label: string; page: number; pages: number; items: Item[] }[] {
  const order = (k: string) => { const i = UPAZILAS.findIndex((u) => u.key === k); return i < 0 ? 999 : i; };
  const catOrder = (l: LogEntry) => { const i = (CATEGORY_LABELS as readonly string[]).indexOf(displayCategory(l)); return i < 0 ? 99 : i; };
  const num = (l: LogEntry) => { const n = Number(l.logNo); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };
  const groups = new Map<string, LogEntry[]>();
  for (const l of rows) {
    const k = logUpazila(l, foremen) || (l.upazila || '').trim() || 'No upazila';
    (groups.get(k) || groups.set(k, []).get(k)!).push(l);
  }
  const out: { key: string; label: string; page: number; pages: number; items: Item[] }[] = [];
  for (const k of [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
    const list = groups.get(k)!.sort((a, b) => catOrder(a) - catOrder(b) || num(a) - num(b));
    const pages = Math.ceil(list.length / TOPSHEET_PAGE_SIZE);
    for (let p = 0; p < pages; p++) {
      out.push({
        key: k, label: upazilaBn(k) || k, page: p + 1, pages,
        items: list.slice(p * TOPSHEET_PAGE_SIZE, (p + 1) * TOPSHEET_PAGE_SIZE).map((l, i) => ({ l, sl: p * TOPSHEET_PAGE_SIZE + i + 1 })),
      });
    }
  }
  return out;
}

export async function buildTopsheetBuffer(rows: LogEntry[], foremen: Foreman[]): Promise<ArrayBuffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb: Workbook = new ExcelJS.Workbook();
  const logoId = wb.addImage({ base64: TOPSHEET_LOGO_BASE64, extension: 'jpeg' });
  const used = new Set<string>();
  const uniqueName = (raw: string) => {
    const base = raw.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let n = base, i = 2;
    while (used.has(n.toLowerCase())) { const s = ` ${i++}`; n = base.slice(0, 31 - s.length) + s; }
    used.add(n.toLowerCase());
    return n;
  };
  for (const p of planTopsheets(rows, foremen)) {
    const eng = p.key.replace(/\s+/g, ' ');
    buildSheet(wb, uniqueName(p.pages > 1 ? `${eng} ${p.page}` : eng), p.label, p.items, logoId);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportTopsheet(rows: LogEntry[], foremen: Foreman[], filename: string): Promise<void> {
  const buf = await buildTopsheetBuffer(rows, foremen);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
