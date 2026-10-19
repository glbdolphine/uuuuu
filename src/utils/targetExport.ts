// Excel export of the Targets tab. Builds a colour-coded, easy-to-read workbook with ExcelJS
// (SheetJS community cannot style cells). Loaded on demand from exportTargets() so it stays out of the main bundle.
import type { Workbook, Worksheet, Cell } from 'exceljs';
import {
  computeStats, pct, shortCategory, sheetName, extraLine, sharedLine,
  type TargetRow, type ExtraRecord, type SharedEdc, type Tally, type TargetStats, type GroupStat,
} from './targets';

export type XlsxMode = 'view' | 'by-upazila' | 'by-category' | 'left-by-upazila';

// ───────────── look ─────────────
const C = {
  navy: '1B2A4E', navySoft: 'E8ECF5', white: 'FFFFFF', ink: '1F2937', muted: '64748B',
  line: 'D5DBE6', zebra: 'F6F8FB', band: 'EEF2F8',
  green: '047857', greenSoft: 'D9F5E8', red: 'BE123C', redSoft: 'FFE3E9', amber: 'B45309',
};
const argb = (h: string) => 'FF' + h;
const solid = (h: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(h) } });
const edge = { style: 'thin' as const, color: { argb: argb(C.line) } };
const box = { top: edge, bottom: edge, left: edge, right: edge };

type Kind = 'text' | 'num' | 'conn' | 'left' | 'pct';
interface Col { header: string; width: number; kind?: Kind }

function style(cell: Cell, o: { bg?: string; color?: string; bold?: boolean; size?: number; h?: 'left' | 'center' | 'right'; wrap?: boolean; border?: boolean; fmt?: string; italic?: boolean }) {
  cell.font = { name: 'Calibri', size: o.size ?? 11, bold: !!o.bold, italic: !!o.italic, color: { argb: argb(o.color ?? C.ink) } };
  if (o.bg) cell.fill = solid(o.bg);
  cell.alignment = { vertical: 'middle', horizontal: o.h ?? 'left', wrapText: !!o.wrap, indent: o.h === 'left' || !o.h ? 1 : 0 };
  if (o.border !== false) cell.border = box;
  if (o.fmt) cell.numFmt = o.fmt;
}

function setWidths(ws: Worksheet, widths: number[]) { widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); }
function newSheet(wb: Workbook, name: string, tab: string): Worksheet {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: argb(tab) } }, views: [{ showGridLines: false }] });
  return ws;
}

function banner(ws: Worksheet, row: number, cols: number, title: string, sub: string, bg = C.navy): number {
  ws.mergeCells(row, 1, row, cols); ws.mergeCells(row + 1, 1, row + 1, cols);
  const t = ws.getCell(row, 1); t.value = title; style(t, { bg, color: C.white, bold: true, size: 18, border: false });
  const s = ws.getCell(row + 1, 1); s.value = sub; style(s, { bg, color: 'DCE3F2', size: 10.5, border: false });
  ws.getRow(row).height = 32; ws.getRow(row + 1).height = 20;
  return row + 3;
}

function heading(ws: Worksheet, row: number, cols: number, text: string, bg: string, color = C.white): number {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1); c.value = text; style(c, { bg, color, bold: true, size: 13, border: false });
  ws.getRow(row).height = 24;
  return row + 1;
}

function headerRow(ws: Worksheet, row: number, cols: Col[], bg = C.navy, startCol = 1) {
  cols.forEach((c, i) => {
    const cell = ws.getCell(row, startCol + i);
    cell.value = c.header;
    const isNum = c.kind && c.kind !== 'text';
    style(cell, { bg: c.kind === 'conn' ? C.green : c.kind === 'left' ? C.red : bg, color: C.white, bold: true, h: isNum ? 'center' : 'left', wrap: true });
  });
  ws.getRow(row).height = 24;
}

function cellFor(kind: Kind | undefined, zebra: boolean, strong = false): Parameters<typeof style>[1] {
  const bg = strong ? C.band : zebra ? C.zebra : undefined;
  if (kind === 'conn') return { bg: strong ? C.greenSoft : bg, color: C.green, bold: true, h: 'center', fmt: '#,##0' };
  if (kind === 'left') return { bg: strong ? C.redSoft : bg, color: C.red, bold: true, h: 'center', fmt: '#,##0' };
  if (kind === 'num') return { bg, bold: strong, h: 'center', fmt: '#,##0' };
  if (kind === 'pct') return { bg, bold: strong, h: 'center', fmt: '0%' };
  return { bg, bold: strong };
}

const STAT_COLS: Col[] = [
  { header: 'Total', width: 12, kind: 'num' }, { header: 'Connected', width: 12, kind: 'conn' },
  { header: 'Left', width: 12, kind: 'left' }, { header: 'Connected %', width: 13, kind: 'pct' },
];
const statValues = (t: Tally) => [t.total, t.connected, t.left, t.total ? t.connected / t.total : 0];

function statTable(ws: Worksheet, row: number, labelHeader: string, labelSpan: number, lines: { label: string; sub?: string; t: Tally }[], total: Tally | null, firstStatCol = labelSpan + 1): number {
  const cols: Col[] = STAT_COLS;
  // header
  if (labelSpan > 1) ws.mergeCells(row, 1, row, labelSpan);
  const h = ws.getCell(row, 1); h.value = labelHeader; style(h, { bg: C.navy, color: C.white, bold: true, wrap: true });
  for (let i = 2; i <= labelSpan; i++) style(ws.getCell(row, i), { bg: C.navy });
  headerRow(ws, row, cols, C.navy, firstStatCol);
  let r = row + 1;
  const put = (label: string, t: Tally, zebra: boolean, strong: boolean) => {
    if (labelSpan > 1) ws.mergeCells(r, 1, r, labelSpan);
    const lc = ws.getCell(r, 1); lc.value = label; style(lc, { ...cellFor('text', zebra, strong), wrap: true });
    for (let i = 2; i <= labelSpan; i++) style(ws.getCell(r, i), cellFor('text', zebra, strong));
    statValues(t).forEach((v, i) => { const c = ws.getCell(r, firstStatCol + i); c.value = v; style(c, cellFor(cols[i].kind, zebra, strong)); });
    r++;
  };
  lines.forEach((l, i) => put(l.sub ? `${l.label}  (${l.sub})` : l.label, l.t, i % 2 === 1, false));
  if (total) put('TOTAL', total, false, true);
  return r + 1;
}

// ───────────── institute lists ─────────────
const BASE: Col[] = [
  { header: 'EDC No', width: 10, kind: 'num' }, { header: 'Institute', width: 48 }, { header: 'Category', width: 30 }, { header: 'Upazila', width: 18 },
  { header: 'Union', width: 18 }, { header: 'Contact Name', width: 18 }, { header: 'Mobile', width: 15 }, { header: 'EMIS Code', width: 12 },
];
const CONN_EXTRA: Col[] = [
  { header: 'Connection No', width: 14 }, { header: 'Connected On', width: 14 }, { header: 'Foreman', width: 18 }, { header: 'NMS ID', width: 15 }, { header: 'Name in workbook', width: 36 },
];
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
const cellsOf = (r: TargetRow, connected: boolean, hide: string | null): (string | number)[] => {
  const base = [Number(r.edc), r.displayName, r.category, r.upazila, r.union || '', r.contact || '', r.mobile || '', r.emis || ''];
  const out = BASE.map((c, i) => c.header === hide ? null : base[i]).filter((v) => v !== null) as (string | number)[];
  if (!connected) return out;
  return [...out, r.logs.map((l) => l.logNo).join(', '), r.logs.map((l) => l.date).filter(Boolean).sort()[0] || '',
    uniq(r.logs.map((l) => l.foremanName)).join(', '), uniq(r.logs.map((l) => l.nmsId)).join(', '), r.name === r.displayName ? '' : r.name];
};
const colsFor = (connected: boolean, hide: string | null): Col[] => [...BASE.filter((c) => c.header !== hide), ...(connected ? CONN_EXTRA : [])];

const byUp = (a: TargetRow, b: TargetRow) => a.upazila.localeCompare(b.upazila) || a.category.localeCompare(b.category) || Number(a.edc) - Number(b.edc);

function listTable(ws: Worksheet, row: number, rows: TargetRow[], connected: boolean, hide: string | null, filter = false): number {
  const cols = colsFor(connected, hide);
  headerRow(ws, row, cols, connected ? C.green : C.red);
  rows.forEach((r, i) => {
    cellsOf(r, connected, hide).forEach((v, j) => {
      const c = ws.getCell(row + 1 + i, j + 1); c.value = v;
      style(c, { bg: i % 2 === 1 ? C.zebra : undefined, h: cols[j].kind === 'num' ? 'center' : 'left' });
    });
  });
  if (filter && rows.length) ws.autoFilter = { from: { row, column: 1 }, to: { row: row + rows.length, column: cols.length } };
  return row + rows.length + 2;
}

function listSheet(wb: Workbook, name: string, rows: TargetRow[], connected: boolean, subtitle: string): Worksheet {
  const ws = newSheet(wb, name, connected ? C.green : C.red);
  const cols = colsFor(connected, null);
  setWidths(ws, cols.map((c) => c.width));
  const title = connected ? `Connected institutes — ${rows.length.toLocaleString()}` : `Left for connection — ${rows.length.toLocaleString()}`;
  const next = banner(ws, 1, Math.min(cols.length, 8), title, subtitle, connected ? C.green : C.red);
  listTable(ws, next, [...rows].sort(byUp), connected, null, true);
  ws.views = [{ state: 'frozen', ySplit: next, showGridLines: false }];
  return ws;
}

// ───────────── full detail table: every institute with its status ─────────────
const ALL_COLS: Col[] = [
  { header: 'EDC No', width: 10, kind: 'num' }, { header: 'Institute', width: 48 }, { header: 'Status', width: 16 },
  { header: 'Upazila', width: 18 }, { header: 'Category', width: 30 }, { header: 'Union', width: 18 },
  { header: 'Contact Name', width: 18 }, { header: 'Mobile', width: 15 }, { header: 'EMIS Code', width: 12 },
  { header: 'Connection No', width: 14 }, { header: 'Connected On', width: 14 }, { header: 'Foreman', width: 18 },
  { header: 'NMS ID', width: 15 }, { header: 'Name in workbook', width: 36 },
];
const allCols = (hide: string[]) => ALL_COLS.filter((c) => !hide.includes(c.header));
const allValues = (r: TargetRow): Record<string, string | number> => ({
  'EDC No': Number(r.edc), 'Institute': r.displayName, 'Status': r.connected ? 'CONNECTED' : 'LEFT',
  'Upazila': r.upazila, 'Category': r.category, 'Union': r.union || '', 'Contact Name': r.contact || '',
  'Mobile': r.mobile || '', 'EMIS Code': r.emis || '',
  'Connection No': r.logs.map((l) => l.logNo).join(', '),
  'Connected On': r.logs.map((l) => l.date).filter(Boolean).sort()[0] || '',
  'Foreman': uniq(r.logs.map((l) => l.foremanName)).join(', '),
  'NMS ID': uniq(r.logs.map((l) => l.nmsId)).join(', '),
  'Name in workbook': r.name === r.displayName ? '' : r.name,
});
const statusFirst = (a: TargetRow, b: TargetRow) => Number(a.connected) - Number(b.connected) || Number(a.edc) - Number(b.edc);

function detailTable(ws: Worksheet, row: number, rows: TargetRow[], hide: string[], filter = false): number {
  const cols = allCols(hide);
  headerRow(ws, row, cols);
  rows.forEach((r, i) => {
    const v = allValues(r);
    cols.forEach((col, j) => {
      const c = ws.getCell(row + 1 + i, j + 1); c.value = v[col.header];
      const zebra = i % 2 === 1 ? C.zebra : undefined;
      if (col.header === 'Status') style(c, { bg: r.connected ? C.greenSoft : C.redSoft, color: r.connected ? C.green : C.red, bold: true, h: 'center' });
      else style(c, { bg: zebra, h: col.kind === 'num' ? 'center' : 'left' });
    });
  });
  if (filter && rows.length) ws.autoFilter = { from: { row, column: 1 }, to: { row: row + rows.length, column: cols.length } };
  return row + rows.length + 2;
}

function allSheet(wb: Workbook, name: string, rows: TargetRow[], subtitle: string): Worksheet {
  const ws = newSheet(wb, name, C.navy);
  const cols = allCols([]);
  setWidths(ws, cols.map((c) => c.width));
  const conn = rows.filter((r) => r.connected).length;
  const next = banner(ws, 1, 8, `All ${rows.length.toLocaleString()} institutes — connection details`,
    `${conn.toLocaleString()} connected  ·  ${(rows.length - conn).toLocaleString()} left  ·  ${subtitle}`);
  detailTable(ws, next, [...rows].sort(byUp), [], true);
  ws.views = [{ state: 'frozen', ySplit: next, xSplit: 2, showGridLines: false }];
  return ws;
}

// ───────────── overview ─────────────
const catLabel = (id: string) => shortCategory(id);

function overviewSheet(wb: Workbook, st: TargetStats, plan: { name: string; desc: string }[], subtitle: string): Worksheet {
  const ws = newSheet(wb, 'Overview', C.navy);
  setWidths(ws, [30, 22, 14, 14, 14, 14]);
  let r = banner(ws, 1, 6, 'Pace IT — Target Institutes Report', subtitle);

  // headline numbers
  r = heading(ws, r, 6, 'At a glance', C.navySoft, C.navy);
  const o = st.overall;
  const kpis: [string, number | string, string, string, string?][] = [
    ['Total institutes', o.total, C.ink, C.band, '#,##0'],
    ['Connected', o.connected, C.green, C.greenSoft, '#,##0'],
    ['Left for connection', o.left, C.red, C.redSoft, '#,##0'],
    ['Connected %', o.total ? o.connected / o.total : 0, C.navy, C.band, '0%'],
  ];
  for (const [label, v, color, bg, fmt] of kpis) {
    ws.mergeCells(r, 1, r, 2);
    const a = ws.getCell(r, 1); a.value = label; style(a, { bg, bold: true, size: 12 }); style(ws.getCell(r, 2), { bg });
    const b = ws.getCell(r, 3); b.value = v; style(b, { bg, color, bold: true, size: 14, h: 'center', fmt });
    ws.getRow(r).height = 24; r++;
  }
  r++;

  // what is in the file
  r = heading(ws, r, 6, 'What is in this file (click a name to jump)', C.navySoft, C.navy);
  for (const p of plan) {
    const a = ws.getCell(r, 1);
    a.value = { text: p.name, hyperlink: `#'${p.name.replace(/'/g, "''")}'!A1` };
    style(a, { color: '0B5CAD', bold: true });
    a.font = { name: 'Calibri', size: 11, bold: true, underline: true, color: { argb: argb('0B5CAD') } };
    ws.mergeCells(r, 2, r, 6);
    const b = ws.getCell(r, 2); b.value = p.desc; style(b, { color: C.muted, wrap: true });
    for (let i = 3; i <= 6; i++) style(ws.getCell(r, i), { color: C.muted });
    r++;
  }
  r++;

  // per upazila
  r = heading(ws, r, 6, '1.  Institutes in each upazila', C.navy);
  ws.getRow(r).height = 22;
  // columns: Upazila | English | Total | Connected | Left | %
  const cols: Col[] = [{ header: 'Upazila', width: 0 }, { header: 'English name', width: 0 }, ...STAT_COLS];
  headerRow(ws, r, cols); r++;
  const rowOut = (vals: (string | number)[], i: number, strong: boolean) => {
    vals.forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; style(c, cellFor(cols[j].kind, i % 2 === 1, strong)); });
    r++;
  };
  st.upazilas.forEach((u, i) => rowOut([u.label, u.sub || '', ...statValues(u)], i, false));
  rowOut(['TOTAL', '', ...statValues(o)], 0, true);
  r++;

  // per category
  r = heading(ws, r, 6, '2.  Institutes in each category (Primary, Secondary, …)', C.navy);
  headerRow(ws, r, [{ header: 'Category', width: 0 }, { header: '', width: 0 }, ...STAT_COLS]); ws.mergeCells(r, 1, r, 2); r++;
  const rowCat = (vals: (string | number)[], i: number, strong: boolean) => {
    ws.mergeCells(r, 1, r, 2);
    const lc = ws.getCell(r, 1); lc.value = vals[0]; style(lc, { ...cellFor('text', i % 2 === 1, strong), wrap: true });
    style(ws.getCell(r, 2), cellFor('text', i % 2 === 1, strong));
    vals.slice(1).forEach((v, j) => { const c = ws.getCell(r, j + 3); c.value = v; style(c, cellFor(STAT_COLS[j].kind, i % 2 === 1, strong)); });
    r++;
  };
  st.categories.forEach((c, i) => rowCat([c.label, ...statValues(c)], i, false));
  rowCat(['TOTAL', ...statValues(o)], 0, true);
  return ws;
}

// ───────────── breakdowns ─────────────
function breakdownSheet(wb: Workbook, name: string, title: string, subtitle: string, groups: GroupStat[], subs: GroupStat[], cell: (g: string, s: string) => Tally | undefined, subLabel: string): Worksheet {
  const ws = newSheet(wb, name, '64748B');
  setWidths(ws, [44, 12, 12, 12, 13]);
  let r = banner(ws, 1, 5, title, subtitle);
  for (const g of groups) {
    // block title with the group's own totals
    const t = ws.getCell(r, 1); t.value = g.sub ? `${g.label}  (${g.sub})` : g.label; style(t, { bg: C.navy, color: C.white, bold: true, size: 12 });
    statValues(g).forEach((v, i) => { const c = ws.getCell(r, i + 2); c.value = v; style(c, { bg: C.navy, color: C.white, bold: true, h: 'center', fmt: i === 3 ? '0%' : '#,##0' }); });
    ws.getRow(r).height = 22; r++;
    // small header
    const sh = ws.getCell(r, 1); sh.value = subLabel; style(sh, { bg: C.navySoft, color: C.navy, bold: true });
    STAT_COLS.forEach((c, i) => { const x = ws.getCell(r, i + 2); x.value = c.header; style(x, { bg: c.kind === 'conn' ? C.greenSoft : c.kind === 'left' ? C.redSoft : C.navySoft, color: c.kind === 'conn' ? C.green : c.kind === 'left' ? C.red : C.navy, bold: true, h: 'center' }); });
    r++;
    let i = 0;
    for (const s of subs) {
      const t2 = cell(g.id, s.id); if (!t2) continue;
      const lc = ws.getCell(r, 1); lc.value = s.sub ? `${s.label}  (${s.sub})` : s.label; style(lc, cellFor('text', i % 2 === 1));
      statValues(t2).forEach((v, j) => { const c = ws.getCell(r, j + 2); c.value = v; style(c, cellFor(STAT_COLS[j].kind, i % 2 === 1)); });
      r++; i++;
    }
    r++;
  }
  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  return ws;
}

function matrixSheet(wb: Workbook, st: TargetStats, name: string): Worksheet {
  const ws = newSheet(wb, name, '64748B');
  const cats = st.categories;
  setWidths(ws, [26, ...cats.map(() => 15), 12]);
  const span = cats.length + 2;
  let r = banner(ws, 1, span, 'Upazila × Category grid', 'Rows are upazilas, columns are categories. Three grids: all institutes, connected, and left.');
  const grids: { title: string; pick: (t: Tally) => number; bg: string; soft: string; color: string }[] = [
    { title: 'Total institutes', pick: (t) => t.total, bg: C.navy, soft: C.band, color: C.ink },
    { title: 'Connected', pick: (t) => t.connected, bg: C.green, soft: C.greenSoft, color: C.green },
    { title: 'Left for connection', pick: (t) => t.left, bg: C.red, soft: C.redSoft, color: C.red },
  ];
  for (const g of grids) {
    r = heading(ws, r, span, g.title, g.bg);
    const hdr = ['Upazila', ...cats.map((c) => catLabel(c.label)), 'Total'];
    hdr.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; style(c, { bg: C.navySoft, color: C.navy, bold: true, wrap: true, h: i === 0 ? 'left' : 'center' }); });
    ws.getRow(r).height = 34; r++;
    st.upazilas.forEach((u, idx) => {
      const zebra = idx % 2 === 1;
      const lc = ws.getCell(r, 1); lc.value = `${u.label}  (${u.sub || ''})`; style(lc, { bg: zebra ? C.zebra : undefined });
      cats.forEach((c, j) => {
        const v = g.pick(st.matrix.get(u.id)?.get(c.id) || { total: 0, connected: 0, left: 0 });
        const x = ws.getCell(r, j + 2); x.value = v || ''; style(x, { bg: zebra ? C.zebra : undefined, h: 'center', color: v ? g.color : C.muted, bold: !!v, fmt: '#,##0' });
      });
      const tc = ws.getCell(r, cats.length + 2); tc.value = g.pick(u); style(tc, { bg: g.soft, color: g.color, bold: true, h: 'center', fmt: '#,##0' });
      r++;
    });
    const tl = ws.getCell(r, 1); tl.value = 'TOTAL'; style(tl, { bg: g.soft, bold: true });
    cats.forEach((c, j) => { const x = ws.getCell(r, j + 2); x.value = g.pick(c); style(x, { bg: g.soft, color: g.color, bold: true, h: 'center', fmt: '#,##0' }); });
    const gt = ws.getCell(r, cats.length + 2); gt.value = g.pick(st.overall); style(gt, { bg: g.soft, color: g.color, bold: true, h: 'center', fmt: '#,##0' });
    r += 2;
  }
  return ws;
}

// ───────────── one sheet per upazila / category ─────────────
function groupSheet(wb: Workbook, name: string, g: GroupStat, subs: { id: string; label: string; sub?: string; t: Tally }[], subHeader: string, rows: TargetRow[], keyOf: (r: TargetRow) => string): Worksheet {
  const ws = newSheet(wb, name, '94A3B8');
  const hide = ['Upazila', 'Category'];
  const cols = allCols(hide);
  setWidths(ws, cols.map((c) => c.width));
  const span = Math.min(cols.length, 8);
  let r = banner(ws, 1, span, g.sub ? `${g.label}  (${g.sub})` : g.label,
    `${g.total.toLocaleString()} institutes  ·  ${g.connected.toLocaleString()} connected  ·  ${g.left.toLocaleString()} left  ·  ${pct(g.connected, g.total)}% done`);

  r = heading(ws, r, span, 'Overview', C.navySoft, C.navy);
  r = statTable(ws, r, subHeader, 2, subs.map((x) => ({ label: x.label, sub: x.sub, t: x.t })), g, 3);

  for (const s of subs) {
    const list = rows.filter((x) => keyOf(x) === s.id).sort(statusFirst);
    if (!list.length) continue;
    r = heading(ws, r, span, `${s.label}${s.sub ? `  (${s.sub})` : ''}  —  ${s.t.total.toLocaleString()} institutes  ·  ${s.t.connected.toLocaleString()} connected  ·  ${s.t.left.toLocaleString()} left`, C.navy);
    r = detailTable(ws, r, list, hide);
  }
  return ws;
}

// ───────────── review sheets (Shared EDC / Not matched) ─────────────
function linesSheet(wb: Workbook, name: string, title: string, subtitle: string, lines: Record<string, string | number>[], widths: number[], tab: string): Worksheet {
  const ws = newSheet(wb, name, tab);
  setWidths(ws, widths);
  const headers = lines.length ? Object.keys(lines[0]) : [];
  const next = banner(ws, 1, Math.max(Math.min(headers.length, 8), 3), title, subtitle, C.amber);
  headerRow(ws, next, headers.map((h, i) => ({ header: h, width: widths[i] || 14 })), C.amber);
  lines.forEach((ln, i) => headers.forEach((h, j) => {
    const c = ws.getCell(next + 1 + i, j + 1); c.value = ln[h] as string | number; style(c, { bg: i % 2 === 1 ? C.zebra : undefined, h: typeof ln[h] === 'number' ? 'center' : 'left' });
  }));
  if (lines.length) ws.autoFilter = { from: { row: next, column: 1 }, to: { row: next + lines.length, column: headers.length } };
  ws.views = [{ state: 'frozen', ySplit: next, showGridLines: false }];
  return ws;
}
const EXTRA_W = [12, 44, 14, 40, 16, 18, 18, 16, 12];
const SHARED_W = [8, 40, 12, 44, 12, 14, 40, 16, 18, 14];
const EXTRA_SUB = 'Connection records that do not count toward any target institute.';
const SHARED_SUB = 'EDC numbers used by more than one connection record — please check which record belongs to the institute.';

// ───────────── Left-for-connection only: one sheet per upazila ─────────────
const PRIMARY = 'Primary Education';
const LEFT_HIDE = ['Upazila', 'Category', 'Status', 'Connection No', 'Connected On', 'Foreman', 'NMS ID'];

function leftUpazilaSheet(wb: Workbook, name: string, u: GroupStat, rows: TargetRow[], cats: GroupStat[], subtitle: string): Worksheet {
  const ws = newSheet(wb, name, C.red);
  const cols = allCols(LEFT_HIDE);
  setWidths(ws, cols.map((c) => c.width));
  const span = Math.min(cols.length, 6);
  const ordered = [...cats.filter((c) => c.id === PRIMARY), ...cats.filter((c) => c.id !== PRIMARY)]
    .map((c) => ({ c, list: rows.filter((r) => r.category === c.id).sort((a, b) => Number(a.edc) - Number(b.edc)) }))
    .filter((x) => x.list.length);
  let r = banner(ws, 1, span, u.sub ? `${u.label}  (${u.sub})` : u.label, `${rows.length.toLocaleString()} institutes left for connection  ·  ${subtitle}`, C.red);

  r = heading(ws, r, span, 'Overview — left for connection', C.redSoft, C.red);
  const hc = ws.getCell(r, 1); ws.mergeCells(r, 1, r, 2); hc.value = 'Category'; style(hc, { bg: C.navy, color: C.white, bold: true }); style(ws.getCell(r, 2), { bg: C.navy });
  [['Left', 3], ['% of left', 4]].forEach(([h, col]) => { const c = ws.getCell(r, col as number); c.value = h as string; style(c, { bg: C.red, color: C.white, bold: true, h: 'center' }); });
  r++;
  ordered.forEach(({ c, list }, i) => {
    ws.mergeCells(r, 1, r, 2);
    const lc = ws.getCell(r, 1); lc.value = c.label; style(lc, { bg: i % 2 ? C.zebra : undefined });
    style(ws.getCell(r, 2), { bg: i % 2 ? C.zebra : undefined });
    const n = ws.getCell(r, 3); n.value = list.length; style(n, { bg: i % 2 ? C.zebra : undefined, color: C.red, bold: true, h: 'center', fmt: '#,##0' });
    const p = ws.getCell(r, 4); p.value = rows.length ? list.length / rows.length : 0; style(p, { bg: i % 2 ? C.zebra : undefined, h: 'center', fmt: '0%' });
    r++;
  });
  ws.mergeCells(r, 1, r, 2);
  const tl = ws.getCell(r, 1); tl.value = 'TOTAL'; style(tl, { bg: C.band, bold: true }); style(ws.getCell(r, 2), { bg: C.band });
  const tn = ws.getCell(r, 3); tn.value = rows.length; style(tn, { bg: C.redSoft, color: C.red, bold: true, h: 'center', fmt: '#,##0' });
  style(ws.getCell(r, 4), { bg: C.band, bold: true, h: 'center', fmt: '0%' }); ws.getCell(r, 4).value = rows.length ? 1 : 0;
  r += 2;

  for (const { c, list } of ordered) {
    r = heading(ws, r, span, `${c.label}  —  ${list.length.toLocaleString()} left`, c.id === PRIMARY ? C.red : C.navy);
    r = detailTable(ws, r, list, LEFT_HIDE);
  }
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  return ws;
}

export async function buildLeftByUpazilaWorkbook(all: TargetRow[]): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb: Workbook = new (ExcelJS as any).Workbook();
  wb.creator = 'Pace IT'; wb.created = new Date();
  const left = all.filter((r) => !r.connected);
  const st = computeStats(left);
  const stamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const used = new Set<string>();
  for (const u of st.upazilas) {
    const rows = left.filter((r) => r.upazilaId === u.id);
    if (!rows.length) continue;
    leftUpazilaSheet(wb, sheetName(u.sub || u.label, used), u, rows, st.categories, `generated ${stamp}`);
  }
  return wb;
}

// ───────────── entry point ─────────────
const today = () => new Date().toISOString().slice(0, 10);

function download(buf: ArrayBuffer | Uint8Array, filename: string) {
  const blob = new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function buildWorkbook(mode: XlsxMode, all: TargetRow[], view: TargetRow[], label: string, extras: ExtraRecord[], shared: SharedEdc[]): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb: Workbook = new (ExcelJS as any).Workbook();
  wb.creator = 'Pace IT'; wb.created = new Date();
  const rows = mode === 'view' ? view : all;
  const st = computeStats(rows);
  const stamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const scope = mode === 'view' && label !== 'all' ? `Filtered list: ${label.replace(/_/g, ' ')}` : 'Complete target list';
  const subtitle = `${scope}  ·  generated ${stamp}`;
  const conn = rows.filter((r) => r.connected), left = rows.filter((r) => !r.connected);

  // Decide the sheet names first so the Overview can link to them.
  const used = new Set<string>(['overview']);
  const nm = (n: string) => sheetName(n, used);
  const plan: { name: string; desc: string }[] = [];
  const names = {
    all: nm('All Institutes'), byUp: nm('By Upazila'), byCat: nm('By Category'), grid: nm('Upazila x Category'),
    conn: conn.length ? nm('Connected') : '', left: left.length ? nm('Left') : '',
  };
  plan.push({ name: names.all, desc: `All ${rows.length.toLocaleString()} institutes in one filterable list: status (LEFT / CONNECTED) and connection details for each.` });
  plan.push({ name: names.byUp, desc: 'Each upazila: its institutes split by category, with connected / left counts.' });
  plan.push({ name: names.byCat, desc: 'Each category: its institutes split by upazila, with connected / left counts.' });
  plan.push({ name: names.grid, desc: 'Grids of upazila × category: total, connected and left side by side.' });
  if (names.conn) plan.push({ name: names.conn, desc: `All ${conn.length.toLocaleString()} connected institutes in one list (with connection no., date, foreman).` });
  if (names.left) plan.push({ name: names.left, desc: `All ${left.length.toLocaleString()} institutes still left for connection in one list.` });
  const groupNames = new Map<string, string>();
  if (mode === 'by-upazila') for (const u of st.upazilas) { const n = nm(u.sub || u.label); groupNames.set(u.id, n); plan.push({ name: n, desc: `${u.label}: its own overview, then every category with its Left and Connected institutes.` }); }
  if (mode === 'by-category') for (const c of st.categories) { const n = nm(shortCategory(c.label)); groupNames.set(c.id, n); plan.push({ name: n, desc: `${c.label}: its own overview, then every upazila with its Left and Connected institutes.` }); }
  const sharedName = shared.length ? nm('Shared EDC') : '';
  const extraName = extras.length ? nm('Not matched') : '';
  if (sharedName) plan.push({ name: sharedName, desc: 'Review: EDC numbers used by several connection records.' });
  if (extraName) plan.push({ name: extraName, desc: 'Review: connection records that are not counted as a target.' });

  overviewSheet(wb, st, plan, subtitle);
  allSheet(wb, names.all, rows, subtitle);
  breakdownSheet(wb, names.byUp, 'Each upazila, split by category', subtitle, st.upazilas, st.categories, (u, c) => st.matrix.get(u)?.get(c), 'Category');
  breakdownSheet(wb, names.byCat, 'Each category, split by upazila', subtitle, st.categories, st.upazilas, (c, u) => st.matrix.get(u)?.get(c), 'Upazila');
  matrixSheet(wb, st, names.grid);
  if (names.conn) listSheet(wb, names.conn, conn, true, subtitle);
  if (names.left) listSheet(wb, names.left, left, false, subtitle);

  if (mode === 'by-upazila') {
    for (const u of st.upazilas) {
      const subs = st.categories.map((c) => ({ id: c.id, label: c.label, t: st.matrix.get(u.id)?.get(c.id) })).filter((x): x is { id: string; label: string; t: Tally } => !!x.t);
      groupSheet(wb, groupNames.get(u.id)!, u, subs, 'Category', rows.filter((r) => r.upazilaId === u.id), (r) => r.category);
    }
  } else if (mode === 'by-category') {
    for (const c of st.categories) {
      const subs = st.upazilas.map((u) => ({ id: u.id, label: u.label, sub: u.sub, t: st.matrix.get(u.id)?.get(c.id) })).filter((x): x is { id: string; label: string; sub: string | undefined; t: Tally } => !!x.t);
      groupSheet(wb, groupNames.get(c.id)!, c, subs, 'Upazila', rows.filter((r) => r.category === c.id), (r) => r.upazilaId);
    }
  }
  if (sharedName) linesSheet(wb, sharedName, 'Shared EDC numbers', SHARED_SUB, shared.flatMap(sharedLine), SHARED_W, C.amber);
  if (extraName) linesSheet(wb, extraName, 'Records not matched to a target', EXTRA_SUB, extras.map(extraLine), EXTRA_W, C.amber);
  return wb;
}

export async function exportTargetsXlsx(mode: XlsxMode, all: TargetRow[], view: TargetRow[], label: string, extras: ExtraRecord[], viewExtras: ExtraRecord[] | null, shared: SharedEdc[], viewShared: SharedEdc[] | null): Promise<void> {
  if (mode === 'view' && (viewShared || viewExtras)) {
    const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb: Workbook = new ExcelJS.Workbook();
    if (viewShared) linesSheet(wb, 'Shared EDC', 'Shared EDC numbers', SHARED_SUB, viewShared.flatMap(sharedLine), SHARED_W, C.amber);
    else linesSheet(wb, 'Not matched', 'Records not matched to a target', EXTRA_SUB, (viewExtras || []).map(extraLine), EXTRA_W, C.amber);
    download(await wb.xlsx.writeBuffer(), `Pace_IT_${viewShared ? 'Shared_EDC' : 'Records_not_matched'}_${today()}.xlsx`);
    return;
  }
  if (mode === 'left-by-upazila') {
    const lw = await buildLeftByUpazilaWorkbook(all);
    if (!lw.worksheets.length) { alert('Nothing is left for connection.'); return; }
    download(await lw.xlsx.writeBuffer(), `Pace_IT_Left_by_upazila_${today()}.xlsx`);
    return;
  }
  const wb = await buildWorkbook(mode, all, view, label, extras, shared);
  const file = mode === 'view' ? `Pace_IT_Targets_${label}_${today()}.xlsx` : `Pace_IT_Targets_${mode === 'by-upazila' ? 'by_upazila' : 'by_category'}_${today()}.xlsx`;
  download(await wb.xlsx.writeBuffer(), file);
}

// ───────────── Terms export: connection records, one sheet per upazila, grouped by category (same look as the "left" export) ─────────────
const TERM_COLS: Col[] = [
  { header: 'SL', width: 6, kind: 'num' }, { header: 'EDC No', width: 9, kind: 'num' }, { header: 'Institute', width: 50 },
  { header: 'Union', width: 32 }, { header: 'Contact Name', width: 32 }, { header: 'Mobile', width: 14 },
];

export async function buildTermWorkbook(logs: import('../types').LogEntry[], what: string): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  const { upazilaKey, UPAZILAS } = await import('./upazilas');
  const { displayCategory } = await import('./category');
  const wb: Workbook = new (ExcelJS as any).Workbook();
  wb.creator = 'Pace IT'; wb.created = new Date();
  const stamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const used = new Set<string>();
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };

  const byUpazila = new Map<string, import('../types').LogEntry[]>();
  for (const l of logs) {
    const k = upazilaKey(l.upazila) || (l.upazila || '').trim() || 'No upazila';
    (byUpazila.get(k) || byUpazila.set(k, []).get(k)!).push(l);
  }
  const order = [...UPAZILAS.map((u) => u.key), ...[...byUpazila.keys()].filter((k) => !UPAZILAS.some((u) => u.key === k)).sort()];

  for (const key of order) {
    const rows = byUpazila.get(key);
    if (!rows?.length) continue;
    const def = UPAZILAS.find((u) => u.key === key);
    const title = def ? `${def.bn}  (${def.key})` : key;
    const ws = newSheet(wb, sheetName(def?.key || key, used), C.red);
    setWidths(ws, TERM_COLS.map((c) => c.width));
    const span = TERM_COLS.length;

    const cats = new Map<string, import('../types').LogEntry[]>();
    for (const l of rows) { const c = displayCategory(l) || 'Other'; (cats.get(c) || cats.set(c, []).get(c)!).push(l); }
    const ordered = [...cats.entries()].sort((a, b) => (a[0] === PRIMARY ? -1 : b[0] === PRIMARY ? 1 : b[1].length - a[1].length));

    let r = banner(ws, 1, span, title, `${rows.length.toLocaleString()} institutes  ·  ${what}  ·  generated ${stamp}`, C.red);
    r = heading(ws, r, span, `Overview — ${what}`, C.redSoft, C.red);
    ws.mergeCells(r, 1, r, 3);
    const hc = ws.getCell(r, 1); hc.value = 'Category'; style(hc, { bg: C.navy, color: C.white, bold: true });
    style(ws.getCell(r, 2), { bg: C.navy }); style(ws.getCell(r, 3), { bg: C.navy });
    [['Count', 4], ['% of total', 5]].forEach(([h, col]) => { const c = ws.getCell(r, col as number); c.value = h as string; style(c, { bg: C.red, color: C.white, bold: true, h: 'center' }); });
    r++;
    ordered.forEach(([cat, list], i) => {
      const bg = i % 2 ? C.zebra : undefined;
      ws.mergeCells(r, 1, r, 3);
      const lc = ws.getCell(r, 1); lc.value = cat; style(lc, { bg }); style(ws.getCell(r, 2), { bg }); style(ws.getCell(r, 3), { bg });
      const n = ws.getCell(r, 4); n.value = list.length; style(n, { bg, color: C.red, bold: true, h: 'center', fmt: '#,##0' });
      const p = ws.getCell(r, 5); p.value = list.length / rows.length; style(p, { bg, h: 'center', fmt: '0%' });
      r++;
    });
    ws.mergeCells(r, 1, r, 3);
    const tl = ws.getCell(r, 1); tl.value = 'TOTAL'; style(tl, { bg: C.band, bold: true }); style(ws.getCell(r, 2), { bg: C.band }); style(ws.getCell(r, 3), { bg: C.band });
    const tn = ws.getCell(r, 4); tn.value = rows.length; style(tn, { bg: C.redSoft, color: C.red, bold: true, h: 'center', fmt: '#,##0' });
    const tp = ws.getCell(r, 5); tp.value = 1; style(tp, { bg: C.band, bold: true, h: 'center', fmt: '0%' });
    r += 2;

    let sl = 1;
    for (const [cat, list] of ordered) {
      r = heading(ws, r, span, `${cat}  —  ${list.length.toLocaleString()}`, cat === PRIMARY ? C.red : C.navy);
      headerRow(ws, r, TERM_COLS);
      list.sort((a, b) => num(a.edcNo) - num(b.edcNo) || num(a.logNo) - num(b.logNo)).forEach((l, i) => {
        const vals: (string | number)[] = [sl++, num(l.edcNo) === Number.MAX_SAFE_INTEGER ? (l.edcNo || '') : Number(l.edcNo),
          l.nameBn || l.nameEn || l.customerName || '', l.unionName || '', l.headTeacherName || '', l.headTeacherPhone || ''];
        vals.forEach((v, j) => {
          const c = ws.getCell(r + 1 + i, j + 1); c.value = v;
          style(c, { bg: i % 2 === 1 ? C.zebra : undefined, h: TERM_COLS[j].kind === 'num' ? 'center' : 'left' });
        });
      });
      r += list.length + 2;
    }
    ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  }
  return wb;
}

export async function exportTermXlsx(logs: import('../types').LogEntry[], what: string, filename: string): Promise<void> {
  const wb = await buildTermWorkbook(logs, what);
  download(await wb.xlsx.writeBuffer(), filename);
}
