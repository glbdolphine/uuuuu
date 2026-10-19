// Rule-based UPAC / EDC certificate extractor. Reads the PDF text layer only; no network.
//
// How it works
// 1. pdfjs reads the PDF's embedded text layer (text + x/y position of every piece).
// 2. Pieces are grouped into visual lines (same y), left to right.
// 3. Fields are located by their fixed English labels ("EDC Book No.", "Lat & Long",
//    "Wi-Fi Router Serial No." ...) which are identical on every UPAC form.
// 4. Bangla values (institute / union / upazila) are decoded from legacy Bijoy text.
//    Some PDFs have a corrupted Bangla text layer; for those the Bangla values are
//    looked up in data/index.json by EDC Book No. instead.
//
// Scanned images (no text layer) cannot be read this way; a clear error is returned.

import fs from 'fs';
import path from 'path';
import { convertBijoy, isBijoyChar } from './bijoy';
import { getEdcIndex } from './edcIndex';

export interface ExtractedForm {
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
  date: string;
  confidence: number;
  warnings: string[];
}

// EDC index (data/index.json)
interface IndexData {
  name?: string;
  mobile?: string;
  union?: string;
  upazila?: string;
}
function loadIndex(): Record<string, { data: IndexData }[]> {
  return getEdcIndex();
}

const BENGALI = /[\u0980-\u09FF]/;

function lookupIndex(edcNo: string): IndexData | null {
  const rows = loadIndex()[edcNo];
  if (!rows || !rows.length) return null;
  return rows.find((r) => BENGALI.test(r.data?.name || ''))?.data || rows[0].data || null;
}

// PDF text -> lines
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function asciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

async function readLines(buffer: Buffer): Promise<string[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  try {
    const page = await doc.getPage(1); // the UPAC certificate is page 1
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        w: (it.width as number) || 0,
      }));

    // group by y (3pt tolerance), top to bottom
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: typeof items }[] = [];
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 3);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);

    return rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = -Infinity;
      for (const it of r.items) {
        const gap = it.x - prevEnd;
        if (line && gap > 1.5 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
        line += it.str;
        prevEnd = it.x + it.w;
      }
      return line.replace(/\s+/g, ' ').trim();
    });
  } finally {
    await doc.destroy();
  }
}

// Field helpers
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(raw: string): string {
  const m = asciiDigits(raw).match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}

function cleanMac(raw: string): string {
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return '';
  return hex.match(/.{2}/g)!.join(':');
}

function bijoyAfter(line: string, labelRe: RegExp): { text: string; unknown: number } | null {
  const m = line.match(labelRe);
  if (!m || m.index === undefined) return null;
  const rest = line.slice(m.index + m[0].length);
  const tokens = rest.split(/\s+/).filter(Boolean);
  const take: string[] = [];
  for (const tok of tokens) {
    if (!Array.from(tok).every(isBijoyChar)) break;
    take.push(tok);
  }
  if (!take.length) return null;
  const res = convertBijoy(take.join(' '));
  return res.text ? res : null;
}

const hasLatin = (s: string) => /[A-Za-z]/.test(s);

// Main
export async function extractUpacPdf(buffer: Buffer, fileName = 'document.pdf'): Promise<ExtractedForm> {
  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Only PDF files can be scanned. Photos / images are not supported.');
  }

  const lines = await readLines(buffer);
  const text = lines.join('\n');

  if (!/UPAC|Acceptance Certificate|EDC\s*Book/i.test(text)) {
    throw new Error(
      lines.length === 0
        ? 'This PDF has no text layer (it is a scanned image), so it cannot be read without OCR.'
        : 'This does not look like a UPAC / EDC certificate.'
    );
  }

  const warnings: string[] = [];
  const grab = (re: RegExp, group = 1) => (text.match(re)?.[group] || '').trim();

  const edcNo =
    grab(/EDC\s*Book\s*No\.?\s*:?\s*(\d+)/i) ||
    asciiDigits(grab(/নং\.?\s*[ঃ:]+\s*([0-9০-৯]+)/));
  const nmsId = grab(/NMS[^\n\d]{0,20}?(\d{4,7})/i);

  const ll = text.match(/Lat\s*&\s*Long\s*:?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const lat = ll?.[1] || '';
  const long = ll?.[2] || '';

  const routerSerial = grab(/Router\s*Serial\s*No\.?\s*:?\s*([A-Za-z0-9]{6,})/i);

  const macMatch = text.match(/\b([0-9A-Fa-f]{2}(?:[:\-][0-9A-Fa-f]{2}){5})\b/);
  const mac = macMatch ? cleanMac(macMatch[1]) : '';

  // Fibre length: quantity cell of the "Optical Fiber Cable" BOQ row.
  const fiberLength =
    grab(/Optical\s*Fiber\s*Cable\s*:[\s\S]{0,200}?\bmtr\.\s*(\d{2,5})\b/i) ||
    grab(/\b(\d{2,5})\s+Optical\s*Fiber\s*Cable\s*Brand/i);

  // Date: "তারিখ" at the top of the form, falling back to the connection date.
  const date = formatDate(text.match(/(?:তারিখ|তািরখ)[^\d০-৯\n]{0,6}([0-9০-৯]{1,2}\s*\/\s*[0-9০-৯]{1,2}\s*\/\s*[0-9০-৯]{2,4})/)?.[1] || '') ||
    formatDate(text);

  // ---- Bangla values -------------------------------------------------------
  const index = edcNo ? lookupIndex(edcNo) : null;

  const nameLine = lines.find((l) => /নাম\s*ও/.test(l)) || '';
  const unionLine = lines.find((l) => /EMIS/i.test(l) && /[:ঃ]/.test(l)) || '';
  const upazilaLine = lines.find((l) => /উপ\S{1,6}লা\//.test(l)) || '';

  const pdfName = bijoyAfter(nameLine, /নাম\s*ও\s*[^\s:ঃ]+\s*[:ঃ]/);
  const pdfUnion = bijoyAfter(unionLine, /ইউ[^:ঃ\n]*[:ঃ]/);
  const pdfUpazila = bijoyAfter(upazilaLine, /উপ\S{1,6}লা\/[^:ঃ\n]*[:ঃ]/);

  const pick = (
    label: string,
    fromPdf: { text: string; unknown: number } | null,
    fromIndex: string | undefined
  ): string => {
    const pdfOk = fromPdf && fromPdf.unknown === 0 && BENGALI.test(fromPdf.text) && !hasLatin(fromPdf.text);
    if (pdfOk) return fromPdf!.text;
    const idxOk = fromIndex && BENGALI.test(fromIndex);
    if (idxOk) {
      warnings.push(`${label} taken from the EDC index (EDC ${edcNo}) because the PDF text for it is unreadable.`);
      return fromIndex!;
    }
    warnings.push(`${label} could not be read from this PDF - please fill it in manually.`);
    return '';
  };

  const customerName = pick('Institute name', pdfName, index?.name);
  const unionName = pick('Union', pdfUnion, index?.union);
  const upazila = pick('Upazila', pdfUpazila, index?.upazila);

  // The form leaves the head teacher mobile blank; the EDC index keeps the institute contact.
  const headTeacherPhone = index?.mobile ? String(index.mobile) : '';

  const keyFields = [edcNo, nmsId, lat && long, routerSerial, fiberLength, customerName, unionName, upazila, date];
  const found = keyFields.filter(Boolean).length;

  if (!edcNo) warnings.push('EDC Book No. not found.');
  if (!nmsId) warnings.push('NMS ID not found.');
  if (!routerSerial) warnings.push('Router serial not found.');
  if (!mac) warnings.push('Router MAC is blank on this form.');

  return {
    fileName,
    customerName,
    edcNo,
    nmsId,
    upazila,
    unionName,
    lat,
    long,
    routerSerial,
    mac,
    fiberLength,
    headTeacherPhone,
    date,
    confidence: found / keyFields.length,
    warnings,
  };
}
