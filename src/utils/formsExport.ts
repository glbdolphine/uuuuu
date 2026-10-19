// Excel export of the Forms tab, laid out exactly like the "EDC Bill" sample sheet:
// column A empty, headers on row 2 (B..L), data from row 3, Arial, centred, thin borders, sheet named after the row count.
import type { Worksheet } from 'exceljs';
import type { LogEntry, Foreman } from '../types';
import { logUpazila, upazilaKey } from './upazilas';

const SAMPLE_UPAZILA: Record<string, string> = {
  'Balaganj': 'Balagonj',
  'Beanibazar': 'Beanibazar',
  'Bishwanath': 'Bissonath',
  'Companiganj': 'Companigonj',
  'Dakshin Surma': 'Doikkinsurma',
  'Fenchuganj': 'Fenchuganj',
  'Golapganj': 'Golapgonj',
  'Gowainghat': 'Gowainghat',
  'Jaintiapur': 'Jaintiapur',
  'Kanaighat': 'Kanaighat',
  'Osmani Nagar': 'OsmaniNagar',
  'Sylhet Sadar': 'SylhetSadar',
  'Zakiganj': 'Zakigonj',
};

const HEADERS = ['SL', 'NAME', 'EDC SL No', 'Internet ID', 'EMIS CODE', 'HEAD Teacher Number', 'Division', 'upazila', 'MAC address', 'Vendor', 'Verified'];
const WIDTHS = [3.9, 9.8, 38.2, 10.4, 10.7, 14.4, 19, 10, 11.8, 19.6, 11.5, 15];

const numOrText = (v?: string | number | null): string | number => {
  const t = String(v ?? '').trim();
  return /^\d{1,15}$/.test(t) ? Number(t) : t;
};

const upazilaText = (l: LogEntry, foremen: Foreman[]): string => {
  const key = logUpazila(l, foremen) || upazilaKey(l.upazila);
  return SAMPLE_UPAZILA[key] || key || (l.upazila || '').trim();
};

export async function exportFormsSample(rows: LogEntry[], foremen: Foreman[], filename: string): Promise<void> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;

  // Group by upazila (in order of first appearance) like the sample; keep the list order inside each group.
  const withUp = rows.map((l) => ({ l, up: upazilaText(l, foremen) }));
  const order: string[] = [];
  for (const x of withUp) if (!order.includes(x.up)) order.push(x.up);
  const sorted = [...withUp].sort((a, b) => order.indexOf(a.up) - order.indexOf(b.up));

  const wb = new ExcelJS.Workbook();
  const ws: Worksheet = wb.addWorksheet(String(rows.length), { views: [{ state: 'frozen', ySplit: 2 }] });
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const edge = { style: 'thin' as const };
  const border = { top: edge, bottom: edge, left: edge, right: edge };
  const center = { horizontal: 'center' as const, vertical: 'middle' as const };

  HEADERS.forEach((h, i) => {
    const c = ws.getCell(2, i + 2);
    c.value = h; c.font = { name: 'Arial', size: 10, bold: true }; c.alignment = center; c.border = border;
  });
  ws.getRow(2).height = 15.75;

  sorted.forEach(({ l, up }, i) => {
    const r = i + 3;
    const vals: (string | number)[] = [
      i + 1,
      l.nameEn || l.customerName || l.nameBn || '',
      numOrText(l.edcNo),
      numOrText(l.nmsId),
      numOrText(l.emisEiinDghs),
      String(l.headTeacherPhone ?? '').trim(),
      'Sylhet',
      up,
      String(l.mac ?? '').trim(),
      up ? `${up}-` : '',
      '', // Verified: left blank for a manual check
    ];
    vals.forEach((v, j) => {
      const c = ws.getCell(r, j + 2);
      c.value = v; c.font = { name: 'Arial', size: 11 }; c.alignment = center; c.border = border;
      if (j === 5) c.numFmt = '@'; // phone numbers stay text, keep the leading 0
    });
    ws.getRow(r).height = 15.75;
  });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
