import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'template', 'EDC Form.docx');

function escapeXml(unsafe: string): string {
  return String(unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'');
}

function getParaText(pXml: string): string {
  const matches = pXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
  return unescapeXml(matches.map((m) => m.replace(/<w:t[^>]*>|<\/w:t>/g, '')).join('')).normalize('NFC');
}

export function toBanglaDigits(num: string | number): string {
  const banglaDigits: Record<string, string> = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
    '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
  };
  return String(num).split('').map((ch) => banglaDigits[ch] || ch).join('');
}

export function getBanglaDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    return `${toBanglaDigits(day)}/${toBanglaDigits(month)}/${toBanglaDigits(year)}`;
  }
  return dateStr;
}

export function normalizeMac(raw: string): string {
  if (!raw) return '';
  const match = raw.match(/(?<![0-9A-Fa-f:\-])([0-9A-Fa-f](?:[:\-]?[0-9A-Fa-f]){11})(?![0-9A-Fa-f])/);
  if (match) {
    const hexOnly = match[1].replace(/[^0-9A-Fa-f]/g, '');
    if (hexOnly.length === 12) {
      const pairs = [];
      for (let i = 0; i < 12; i += 2) {
        pairs.push(hexOnly.slice(i, i + 2));
      }
      return pairs.join(':').toUpperCase();
    }
  }
  return raw.trim();
}

export function sanitizeFilename(name: string): string {
  let cleaned = name.replace(/[\\/:*?"<>|]+/g, '');
  cleaned = cleaned.replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned ? cleaned.slice(0, 60) : 'form';
}

function appendValueToPara(pXml: string, value: string): string {
  if (!value) return pXml;

  // Check if paragraph already ends with a space in its text
  const matches = pXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
  const lastText = matches.length > 0 ? matches[matches.length - 1].replace(/<[^>]+>/g, '') : '';
  const needsSpace = !lastText.endsWith(' ') && !value.startsWith(' ');
  const prefix = needsSpace ? ' ' : '';

  // Standard font: Times New Roman / Nikosh, sz 22 (11pt), regular weight (not bold, matching original template)
  const runXml = `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Nikosh"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${prefix}${escapeXml(value)}</w:t></w:r>`;
  return pXml.replace(/<\/w:p>$/, `${runXml}</w:p>`);
}

export function fillEdcDocx(data: Record<string, string>, dateStr: string): Buffer {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`EDC template not found at ${TEMPLATE_PATH}`);
  }

  const zip = new AdmZip(TEMPLATE_PATH);
  let xml = zip.readAsText('word/document.xml');

  const banglaDate = getBanglaDate(dateStr);
  const normalizedMacAddr = normalizeMac(data.router_mac || '');
  const cableBrand = (data.cable_brand || 'BRB').trim();
  const cableQty = (data.cable_qty || '1500').trim();

  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  xml = xml.replace(pRegex, (pXml) => {
    const t = getParaText(pXml);
    // Bangla letters like য় can be stored precomposed (U+09DF) or decomposed (U+09AF U+09BC).
    // getParaText() returns NFC text, so every search string must be NFC too.
    const has = (needle: string) => t.includes(needle.normalize('NFC'));

    // 1. Header line (সুত্র নংঃ ... তারিখঃ ...)
    if (has('সুত্র নং') && has('তারিখ')) {
      // Original template has 124 spaces between "সুত্র নংঃ" and "তারিখঃ"
      const originalGap = 124;
      const sourcePart = data.source_no ? ` ${data.source_no}` : '';
      const datePart = banglaDate ? ` ${banglaDate}` : '';
      const pad = Math.max(originalGap - sourcePart.length, 2);
      const headerText = `সুত্র নংঃ${sourcePart}${' '.repeat(pad)}তারিখঃ${datePart}`;
      return pXml.replace(
        /<w:t[^>]*>সুত্র নংঃ[\s\S]*?তারিখঃ<\/w:t>/,
        `<w:t xml:space="preserve">${escapeXml(headerText)}</w:t>`
      );
    }

    // 2. Table cells
    if (has('EDC Book No.:') && data.source_no) {
      return appendValueToPara(pXml, data.source_no);
    }
    if (has('সংযোগ/NMS আইডিঃ') && data.connection_nms) {
      return appendValueToPara(pXml, data.connection_nms);
    }
    if (has('সংযোগ গ্রহণকারী প্রতিষ্টানের নাম ও ঠিকানাঃ') && data.name) {
      return appendValueToPara(pXml, data.name);
    }
    if (has('Lat & Long:') && data.lat_long) {
      return appendValueToPara(pXml, data.lat_long);
    }
    if (has('ইউনিয়ন') && has('পৌরসভা') && data.union) {
      return appendValueToPara(pXml, data.union);
    }
    if (has('প্রতিষ্টানের কোড') && data.institution_code) {
      return appendValueToPara(pXml, data.institution_code);
    }
    if (has('উপজেলা/সিটি কর্পোরেশনঃ') && data.upazila) {
      return appendValueToPara(pXml, data.upazila);
    }
    if (has('সংযোগ প্রদানের তারিখঃ') && banglaDate) {
      return appendValueToPara(pXml, banglaDate);
    }
    if (has('Wi-Fi Router MAC Address') && normalizedMacAddr) {
      return appendValueToPara(pXml, normalizedMacAddr);
    }
    if (has('Wi-Fi Router Serial No.:') && data.router_serial) {
      return appendValueToPara(pXml, data.router_serial);
    }

    // 3. Optical Fiber Cable Brand
    if (has('Optical Fiber Cable Brand:') && cableBrand) {
      return pXml.replace(
        /<w:t[^>]*>Optical Fiber Cable Brand:.*?<\/w:t>/,
        `<w:t xml:space="preserve">Optical Fiber Cable Brand: ${escapeXml(cableBrand)}</w:t>`
      );
    }

    // 4. Optical Fiber Cable Qty
    if (t.trim() === '1500' && cableQty) {
      return pXml.replace(/<w:t[^>]*>1500<\/w:t>/, `<w:t xml:space="preserve">${escapeXml(cableQty)}</w:t>`);
    }

    // 5. Site visit paragraph (সরজমিনে পরিদর্শন)
    if (has('এর উপরোক্ত') && has('সরজমিনে পরিদর্শন') && data.name) {
      return pXml.replace(
        /<w:t[^>]*>এর উপরোক্ত অফিস<\/w:t>/,
        `<w:t xml:space="preserve">এর ${escapeXml(data.name)} উপরোক্ত অফিস</w:t>`
      );
    }

    return pXml;
  });

  zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'));
  return zip.toBuffer();
}
