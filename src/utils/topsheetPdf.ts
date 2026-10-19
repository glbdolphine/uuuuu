// "Top Sheet" PDF: the same sheet as the Excel export (same columns, row heights, borders, fonts and A4-landscape
// scaling), drawn page by page. Bangla needs the browser's text shaping (jsPDF cannot shape Bengali), so each page is
// drawn on a 300 dpi canvas with Nikosh (Bangla) and Times New Roman (English) and placed on an A4 page as an image.
import type { LogEntry, Foreman } from '../types';
import { TOPSHEET_LOGO_BASE64 } from './topsheetLogo';
import {
  planTopsheets, topsheetValues, splitRuns, cleanText, HEAD, WIDTHS, TITLES, NOTE, SIGN_LEFT, SIGN_RIGHT, INFO_LINE, ROW_HEIGHTS,
  TOPSHEET_PAGE_SIZE,
} from './topsheetExport';

export const PAGE_W = 841.89, PAGE_H = 595.28;                 // A4 landscape, points
const MARGIN = { l: 0.31 * 72, r: 0.17 * 72, t: 0.24 * 72, b: 0.17 * 72 }; // same as the Excel page setup
const COL_PT = 7 * 0.75;                                 // Excel column-width unit -> points (7 px per character)
const DPI_K = 300 / 72;                                  // canvas pixels per point
const LATIN = '"Times New Roman","Liberation Serif",Times,serif';
const FIRST = 9, NOTE_ROW = 30, SIGN_ROW = 37, END_ROW = 39, LAST = FIRST + TOPSHEET_PAGE_SIZE - 1;

const colX: number[] = [0];
WIDTHS.forEach((w, i) => colX.push(colX[i] + w * COL_PT));
const rowY: number[] = [0, 0];                           // rowY[r] = top of row r (1-based)
for (let r = 1; r <= END_ROW; r++) rowY.push(rowY[r] + (ROW_HEIGHTS[r] ?? 14.25));
const TOTAL_W = colX[12], TOTAL_H = rowY[END_ROW + 1];
const SCALE = Math.min((PAGE_W - MARGIN.l - MARGIN.r) / TOTAL_W, (PAGE_H - MARGIN.t - MARGIN.b) / TOTAL_H, 1);
const OFFSET_X = MARGIN.l + (PAGE_W - MARGIN.l - MARGIN.r - TOTAL_W * SCALE) / 2; // centred left-to-right

type Ctx = CanvasRenderingContext2D;
const clean = (v: string | number) => cleanText(String(v));
const fontFor = (bn: boolean, size: number, bold: boolean) => `${bold ? 'bold ' : ''}${size}px ${bn ? '"Nikosh"' : LATIN}`;

function runsWidth(ctx: Ctx, text: string, size: number, bold: boolean): number {
  return splitRuns(text).reduce((w, r) => { ctx.font = fontFor(r.bn, size, bold); return w + ctx.measureText(r.text).width; }, 0);
}
function drawLine(ctx: Ctx, text: string, cx: number, cy: number, size: number, bold: boolean, maxW?: number) {
  let sz = size;
  const w0 = runsWidth(ctx, text, sz, bold);
  if (maxW && w0 > maxW) sz = size * (maxW / w0);       // shrink to fit, like Excel's "shrink to fit"
  let x = cx - runsWidth(ctx, text, sz, bold) / 2;
  for (const r of splitRuns(text)) {
    ctx.font = fontFor(r.bn, sz, bold);
    ctx.fillText(r.text, x, cy);
    x += ctx.measureText(r.text).width;
  }
}
function drawWrapped(ctx: Ctx, text: string, x0: number, y0: number, w: number, h: number, size: number, bold: boolean) {
  const maxW = w - 6;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (line && runsWidth(ctx, t, size, bold) > maxW) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  const lh = size * 1.3;
  const top = y0 + h / 2 - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => drawLine(ctx, l, x0 + w / 2, top + i * lh, size, bold));
}
const cell = (ctx: Ctx, r: number, c1: number, c2 = c1, r2 = r) => ctx.strokeRect(colX[c1 - 1], rowY[r], colX[c2] - colX[c1 - 1], rowY[r2 + 1] - rowY[r]);

export function drawPage(ctx: Ctx, items: ReturnType<typeof planTopsheets>[number]['items'], upazila: string, logo: HTMLImageElement | null) {
  ctx.save();
  ctx.setTransform(DPI_K * SCALE, 0, 0, DPI_K * SCALE, OFFSET_X * DPI_K, MARGIN.t * DPI_K);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.75; ctx.textBaseline = 'middle';
  const mid = (r: number, r2 = r) => (rowY[r] + rowY[r2 + 1]) / 2;

  TITLES.forEach((t, i) => drawLine(ctx, clean(t), TOTAL_W / 2, mid(2 + i), 14, true));
  if (logo) ctx.drawImage(logo, 15, rowY[2] + 4.5, 86, 55.5);
  [[1, 4], [5, 8], [9, 12]].forEach(([a, b], i) => drawLine(ctx, INFO_LINE[i], (colX[a - 1] + colX[b]) / 2, mid(6), 12, true));

  HEAD.forEach((h, i) => {
    cell(ctx, 8, i + 1);
    drawWrapped(ctx, clean(h), colX[i], rowY[8], colX[i + 1] - colX[i], rowY[9] - rowY[8], 11, true);
  });
  items.forEach(({ l, sl }, k) => {
    const r = FIRST + k;
    topsheetValues(l, sl, upazila).forEach((v, j) => {
      cell(ctx, r, j + 1);
      drawLine(ctx, clean(v), (colX[j] + colX[j + 1]) / 2, mid(r), 11, false, colX[j + 1] - colX[j] - 4);
    });
  });
  void LAST;

  cell(ctx, NOTE_ROW, 1, 12);
  drawWrapped(ctx, clean(NOTE), 0, rowY[NOTE_ROW], TOTAL_W, rowY[NOTE_ROW + 1] - rowY[NOTE_ROW], 15, true);
  cell(ctx, SIGN_ROW, 1, 4, END_ROW);
  SIGN_LEFT.forEach((t, i) => drawLine(ctx, clean(t), (colX[0] + colX[4]) / 2, mid(SIGN_ROW + i), 14, true));
  cell(ctx, SIGN_ROW, 9, 12, END_ROW);
  drawWrapped(ctx, clean(SIGN_RIGHT), colX[8], rowY[SIGN_ROW], colX[12] - colX[8], rowY[END_ROW + 1] - rowY[SIGN_ROW], 14, true);
  ctx.restore();
}

export async function exportTopsheetPdf(rows: LogEntry[], foremen: Foreman[], filename: string): Promise<void> {
  try {
    await document.fonts.load('16px Nikosh', 'অআকখ');
    await document.fonts.load('bold 16px Nikosh', 'অআকখ');
    await document.fonts.ready;
  } catch { /* fall back to the browser's fonts */ }
  const logo = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
    im.src = 'data:image/jpeg;base64,' + TOPSHEET_LOGO_BASE64;
  });
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * DPI_K); canvas.height = Math.round(PAGE_H * DPI_K);
  const ctx = canvas.getContext('2d')!;
  const pages = planTopsheets(rows, foremen);
  pages.forEach((p, i) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawPage(ctx, p.items, p.label, logo);
    if (i > 0) pdf.addPage('a4', 'landscape');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');
  });
  pdf.save(filename);
}
