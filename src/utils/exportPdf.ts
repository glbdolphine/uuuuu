import { jsPDF } from 'jspdf';
import autoTable, { CellHookData } from 'jspdf-autotable';
import { LogEntry } from '../types';
import { NameLang, nameFor } from './names';

function savedNameLang(): NameLang {
  try { return localStorage.getItem('pace_it_name_lang') === 'en' ? 'en' : 'bn'; } catch { return 'bn'; }
}

/*
 * Bangla in PDFs
 * jsPDF's built-in fonts have no Bengali glyphs, and jsPDF cannot shape Bengali (conjuncts, vowel
 * signs that move around the consonant), which is what produced the broken characters. The browser
 * can shape it perfectly, so any cell that contains Bangla is drawn by the browser (canvas, using the
 * bundled Nikosh font) and placed in the PDF as a crisp high-resolution image. Everything else stays
 * normal selectable PDF text.
 */

const BANGLA = /[ঀ-৿]/;
const PX_PER_MM = 12; // ~305 dpi
const PT_TO_MM = 25.4 / 72;
const CANVAS_FONT = "Nikosh, 'Fustat', Arial, sans-serif";

async function ensureBanglaFont(): Promise<void> {
  try {
    await document.fonts.load("16px Nikosh", 'অআকখ');
    await document.fonts.ready;
  } catch { /* fall back to whatever the browser has */ }
}

interface TextImage { url: string; wMm: number; hMm: number }

function graphemes(s: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) return Array.from(new Seg('bn', { granularity: 'grapheme' }).segment(s), (x: any) => x.segment as string);
  return Array.from(s);
}

function renderTextImage(text: string, widthMm: number, fontPt: number, bold: boolean, rgb: [number, number, number]): TextImage {
  const fontPx = fontPt * PT_TO_MM * PX_PER_MM;
  const lineH = fontPx * 1.4;
  const wPx = Math.max(10, Math.floor(widthMm * PX_PER_MM));
  const font = `${bold ? 'bold ' : ''}${fontPx}px ${CANVAS_FONT}`;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;

  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (measure.measureText(test).width <= wPx) { line = test; continue; }
      if (line) { lines.push(line); line = ''; }
      if (measure.measureText(word).width <= wPx) { line = word; continue; }
      // A single very long word: break between characters, never inside one
      let chunk = '';
      for (const g of graphemes(word)) {
        if (chunk && measure.measureText(chunk + g).width > wPx) { lines.push(chunk); chunk = ''; }
        chunk += g;
      }
      line = chunk;
    }
    lines.push(line);
  }

  const hPx = Math.ceil(lines.length * lineH + fontPx * 0.2);
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.textBaseline = 'middle';
  lines.forEach((ln, i) => ctx.fillText(ln, 0, i * lineH + lineH / 2));

  return { url: canvas.toDataURL('image/png'), wMm: wPx / PX_PER_MM, hMm: hPx / PX_PER_MM };
}

function banglaHooks(colWidths: number[], padding: number, fontPt: number, boldCols: number[] = []) {
  const images = new WeakMap<object, TextImage>();
  return {
    didParseCell(d: CellHookData) {
      if (d.section !== 'body') return;
      const raw = (d.cell.text || []).join('\n');
      if (!BANGLA.test(raw)) return;
      const bold = boldCols.includes(d.column.index);
      const img = renderTextImage(raw, colWidths[d.column.index] - padding * 2, fontPt, bold, [15, 23, 42]);
      images.set(d.cell, img);
      d.cell.text = [''];
      d.cell.styles.minCellHeight = img.hMm + padding * 2;
    },
    didDrawCell(d: CellHookData) {
      const img = images.get(d.cell);
      if (!img) return;
      d.doc.addImage(img.url, 'PNG', d.cell.x + padding, d.cell.y + padding, img.wMm, img.hMm);
    },
  };
}

export async function exportBatchLogsPdf(logs: LogEntry[], nameLang: NameLang = savedNameLang()): Promise<void> {
  await ensureBanglaFont();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const M = 8;

  doc.setFontSize(14);
  doc.setTextColor(24, 75, 48);
  doc.text('Pace IT - Connections', M, 15);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleString()} | Total Connections: ${logs.length}`, M, 21);

  const tableRows = logs.map((l) => [
    `#${l.logNo}`,
    l.date || '—',
    nameFor(l, nameLang).text || '—',
    l.foremanName || '—',
    l.foremanPhone || '—',
    l.headTeacherName ? `${l.headTeacherName}${l.headTeacherPhone ? ` (${l.headTeacherPhone})` : ''}` : '—',
    l.nmsId || '—',
    l.edcNo || '—',
    [l.upazila, l.unionName].filter(Boolean).join(' / ') || '—',
    l.mac || '—',
    l.routerSerial || '—',
    l.fiberLength ? `${l.fiberLength}m` : '—',
    l.status || '—',
  ]);

  // 281 mm of usable width on landscape A4
  const widths = [12, 17, 46, 22, 22, 34, 15, 12, 28, 26, 22, 10, 15];
  const pad = 1.5;
  const hooks = banglaHooks(widths, pad, 7);

  autoTable(doc, {
    startY: 25,
    margin: { left: M, right: M },
    head: [[
      'Conn #', 'Date', 'Institute Name', 'Foreman', 'Foreman Phone',
      'Head Teacher / In-Charge', 'NMS ID', 'EDC No', 'Upazila / Union',
      'MAC', 'Router Serial', 'Fiber', 'Status',
    ]],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: pad, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 249, 246] },
    columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
    ...hooks,
  });

  doc.save(`Pace_IT_Connections_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportSingleLogPdf(log: LogEntry, nameLang: NameLang = savedNameLang()): Promise<void> {
  await ensureBanglaFont();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setTextColor(24, 75, 48);
  doc.text('Pace IT - Connection Request', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Connection #${log.logNo} | Date: ${log.date || '—'}`, 14, 25);

  const rows = [
    ['Connection No.', `#${log.logNo}`],
    ['Date', log.date || '—'],
    ['Foreman Name', log.foremanName || '—'],
    ['Foreman Phone', log.foremanPhone || '—'],
    ['Customer / Institute Name', nameFor(log, nameLang).text || '—'],
    ['Head Teacher / In-Charge Name', log.headTeacherName || '—'],
    ['Head Teacher Phone', log.headTeacherPhone || '—'],
    ['Upazila / City Corporation', log.upazila || '—'],
    ['Union / Ward / Pouroshova', log.unionName || '—'],
    ['Lat & Long', [log.lat, log.long].filter(Boolean).join(', ') || '—'],
    ['NMS ID', log.nmsId || '—'],
    ['EDC Book No.', log.edcNo || '—'],
    ['Emis / EIIN / DGHS', log.emisEiinDghs || '—'],
    ['Wi-Fi Router Serial No.', log.routerSerial || '—'],
    ['MAC Address', log.mac || '—'],
    ['Optical Fiber Length (m)', log.fiberLength ? `${log.fiberLength} m` : '—'],
    ['Request Type', log.requestType || '—'],
    ['Status', log.status || '—'],
    ['Issue Found', log.issueFound || '—'],
    ['Missing / Wrong Details', log.missingWrongDetails || '—'],
    ['Action Taken', log.actionTaken || '—'],
    ['Reason for Action', log.reasonForAction || '—'],
    ['Foreman Informed', log.foremanInformed || '—'],
    ['Follow-up Needed', log.followUpNeeded || '—'],
    ['Supervisor Informed', log.supervisorInformed || '—'],
    ['Remarks', log.remarks || '—'],
  ];

  // 182 mm of usable width on portrait A4
  const widths = [55, 127];
  const pad = 2;
  const hooks = banglaHooks(widths, pad, 8);

  autoTable(doc, {
    startY: 30,
    margin: { left: 14, right: 14 },
    head: [['Field', 'Details']],
    body: rows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: pad },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: widths[0] }, 1: { cellWidth: widths[1] } },
    ...hooks,
  });

  doc.save(`Pace_IT_Connection_${log.logNo}_${(log.nameEn || 'record').replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`);
}

export interface BillsPdfOptions {
  logs: LogEntry[];
  monthText: string;
  listLabel: string;
  foremanName?: string;
  hasBill: (l: LogEntry) => boolean;
  nameLang?: NameLang;
  fileName: string;
}

export async function exportBillsPdf(o: BillsPdfOptions): Promise<void> {
  const nameLang = o.nameLang ?? savedNameLang();
  await ensureBanglaFont();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const M = 14;
  const got = o.logs.filter(o.hasBill).length;

  doc.setFontSize(15);
  doc.setTextColor(24, 75, 48);
  doc.text(`Pace IT - Bills · ${o.monthText}`, M, 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${o.listLabel}${o.foremanName ? ` · ${o.foremanName}` : ' · All foremen'} | Received: ${got} | Not received: ${o.logs.length - got} | Total: ${o.logs.length}`,
    M, 22,
  );
  doc.text(`Generated on: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true })}`, M, 27);

  const body = o.logs.map((l) => [
    `#${l.logNo}`,
    nameFor(l, nameLang).text || '—',
    l.foremanName || '—',
    l.nmsId || '—',
    l.upazila || '—',
    o.hasBill(l) ? 'Received' : 'Not received',
  ]);

  // 182 mm of usable width on portrait A4
  const widths = [14, 68, 28, 22, 26, 24];
  const pad = 1.6;
  const hooks = banglaHooks(widths, pad, 8, [1]);

  autoTable(doc, {
    startY: 31,
    margin: { left: M, right: M },
    head: [['Conn #', 'Institute Name', 'Foreman', 'NMS ID', 'Upazila', 'Bill']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: pad, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 249, 246] },
    columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
    didParseCell(d: CellHookData) {
      hooks.didParseCell(d);
      if (d.section === 'body' && d.column.index === 5) {
        const ok = String(d.cell.raw) === 'Received';
        d.cell.styles.textColor = ok ? [4, 120, 87] : [190, 18, 60];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: hooks.didDrawCell,
    didDrawPage() {
      const n = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${n}`, 196, 290, { align: 'right' });
    },
  });

  doc.save(o.fileName);
}

export interface FormsPdfOptions {
  logs: LogEntry[];
  monthText: string;
  listLabel: string;
  foremanName?: string;
  hasForm: (l: LogEntry) => boolean;
  nameLang?: NameLang;
  fileName: string;
}

export async function exportFormsPdf(o: FormsPdfOptions): Promise<void> {
  const nameLang = o.nameLang ?? savedNameLang();
  await ensureBanglaFont();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const M = 14;
  const got = o.logs.filter(o.hasForm).length;

  doc.setFontSize(15);
  doc.setTextColor(24, 75, 48);
  doc.text(`Pace IT - Forms · ${o.monthText}`, M, 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${o.listLabel}${o.foremanName ? ` · ${o.foremanName}` : ' · All foremen'} | Received: ${got} | Awaiting: ${o.logs.length - got} | Total: ${o.logs.length}`,
    M, 22,
  );
  doc.text(`Generated on: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true })}`, M, 27);

  const body = o.logs.map((l) => [
    `#${l.logNo}`,
    nameFor(l, nameLang).text || '—',
    l.foremanName || '—',
    l.nmsId || '—',
    l.upazila || '—',
    o.hasForm(l) ? 'Received' : 'Awaiting',
  ]);

  // 182 mm of usable width on portrait A4
  const widths = [14, 68, 28, 22, 26, 24];
  const pad = 1.6;
  const hooks = banglaHooks(widths, pad, 8, [1]);

  autoTable(doc, {
    startY: 31,
    margin: { left: M, right: M },
    head: [['Conn #', 'Institute Name', 'Foreman', 'NMS ID', 'Upazila', 'Form']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: pad, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [24, 75, 48], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 249, 246] },
    columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
    didParseCell(d: CellHookData) {
      hooks.didParseCell(d);
      if (d.section === 'body' && d.column.index === 5) {
        const ok = String(d.cell.raw) === 'Received';
        d.cell.styles.textColor = ok ? [4, 120, 87] : [190, 18, 60];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: hooks.didDrawCell,
    didDrawPage() {
      const n = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${n}`, 196, 290, { align: 'right' });
    },
  });

  doc.save(o.fileName);
}
