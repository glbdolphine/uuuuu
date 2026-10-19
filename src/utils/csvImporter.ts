import { LogEntry, Foreman } from '../types';
import { splitName } from './names';
import { stripCategoryNumber, resolveCategory } from './category';
import { parseForemanAndUpazilaFromArea, upazilaKey } from './upazilas';

function formatToLogDate(isoOrDateStr: string): string {
  if (!isoOrDateStr || !isoOrDateStr.trim()) {
    return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const clean = isoOrDateStr.trim().split(' ')[0]; // Handle "2024-06-10" or "2024-06-10 12:00:00"
  const parts = clean.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return isoOrDateStr;
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF after CR
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.some((f) => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface SkippedLogRecord {
  nmsId: string;
  customerName: string;
  category?: string;
  reason: string;
}

export interface CsvImportAnalysis {
  readyToImport: LogEntry[];
  skippedDuplicates: SkippedLogRecord[];
  totalRows: number;
  categoryCounts: Record<string, number>;
  foremanCounts: Record<string, number>;
}


export function cleanCategoryLabel(cat?: string): string {
  return stripCategoryNumber(cat) || 'Uncategorized';
}

export function analyzeCsvForImport(
  csvContent: string,
  existingLogs: LogEntry[],
  foremen: Foreman[],
  startingLogNo: number = 1
): CsvImportAnalysis {
  const rows = parseCsvRows(csvContent);
  if (rows.length === 0) {
    return {
      readyToImport: [],
      skippedDuplicates: [],
      totalRows: 0,
      categoryCounts: {},
      foremanCounts: {},
    };
  }

  // Find header row
  let headerIndex = -1;
  let headers: Record<string, number> = {};

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i].map((h) => h.trim().toLowerCase());
    if (row.includes('cust id') || row.includes('username') || (row.includes('name') && row.includes('area'))) {
      headerIndex = i;
      rows[i].forEach((col, idx) => {
        headers[col.trim().toLowerCase()] = idx;
      });
      break;
    }
  }

  if (headerIndex === -1) {
    // If no explicit header matched, assume standard header ordering
    headers = {
      sn: 0,
      'cust id': 1,
      username: 2,
      name: 3,
      package: 4,
      balance: 5,
      'exp date': 6,
      'last logout': 7,
      mobile: 8,
      created: 9,
      status: 10,
      'flat/level': 11,
      house: 12,
      road: 13,
      area: 14,
      ip: 15,
      pop: 16,
      group: 17,
      'net bill': 18,
      'vlan/box': 19,
      nid: 20,
      email: 21,
      discount: 22,
      'bill cycle': 23,
      remarks: 24,
      dob: 25,
      'used months': 26,
      district: 27,
      thana: 28,
    };
    headerIndex = -1; // start from 0 if first row wasn't recognized as header, or skip row 0 if it looks like header
    if (rows[0][0].toLowerCase().includes('sn') || rows[0][1]?.toLowerCase().includes('cust')) {
      headerIndex = 0;
    }
  }

  const getCol = (row: string[], name: string): string => {
    const idx = headers[name.toLowerCase()];
    return idx !== undefined && idx < row.length ? row[idx].trim() : '';
  };

  // Build a set of existing NMS IDs for exact duplicate checking
  const existingNmsMap = new Map<string, LogEntry>();
  existingLogs.forEach((l) => {
    if (l.nmsId && l.nmsId.trim()) {
      existingNmsMap.set(l.nmsId.trim().toLowerCase(), l);
    }
  });

  const readyToImport: LogEntry[] = [];
  const skippedDuplicates: SkippedLogRecord[] = [];
  const seenInBatch = new Set<string>();
  const categoryCounts: Record<string, number> = {};
  const foremanCounts: Record<string, number> = {};

  let currentLogNo = startingLogNo;
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;

  for (const row of dataRows) {
    if (!row || row.length === 0 || row.every((c) => !c.trim())) continue;

    // 1. Extract NMS ID / Cust ID
    let nmsId = getCol(row, 'cust id');
    if (!nmsId) {
      const uname = getCol(row, 'username');
      if (uname) {
        nmsId = uname.split('@')[0].trim();
      }
    }

    const customerName = getCol(row, 'name') || getCol(row, 'house') || 'Unknown Institute';
    const rawPop = getCol(row, 'pop');
    // Category is detected from the institute name; the CSV's POP value is only a fallback.
    const category = resolveCategory({ customerName, category: rawPop }) || 'Uncategorized';

    if (!nmsId) {
      // If row has no NMS ID, skip or treat as invalid
      continue;
    }

    const nmsLower = nmsId.toLowerCase();

    // Skip rows whose NMS ID already exists in the logs or earlier in this batch
    if (existingNmsMap.has(nmsLower)) {
      const existing = existingNmsMap.get(nmsLower)!;
      skippedDuplicates.push({
        nmsId,
        customerName,
        category,
        reason: `Already exists on Connection #${existing.logNo} (${existing.customerName})`,
      });
      continue;
    }

    if (seenInBatch.has(nmsLower)) {
      skippedDuplicates.push({
        nmsId,
        customerName,
        category,
        reason: 'Duplicate entry within this CSV file',
      });
      continue;
    }

    seenInBatch.add(nmsLower);

    // 3. Extract Area, Thana, Foreman and Upazila
    const areaText = getCol(row, 'area');
    const thanaText = getCol(row, 'thana');
    const houseText = getCol(row, 'house');
    const roadText = getCol(row, 'road');
    const mobile = getCol(row, 'mobile');
    const createdDate = getCol(row, 'created');
    const remarks = getCol(row, 'remarks');

    const matched = parseForemanAndUpazilaFromArea(areaText, thanaText, foremen);

    // 4. Build LogEntry
    const dateFormatted = formatToLogDate(createdDate);

    // Address/Union
    const unionName = [houseText, roadText].filter(Boolean).join(', ') || '';

    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      logNo: currentLogNo++,
      date: dateFormatted,
      foremanName: matched.foremanName || 'Unassigned',
      foremanId: matched.foreman?.id,
      foremanPhone: matched.foremanPhone || (matched.foreman?.phone || ''),
      requestType: 'New User ID',
      customerName,
      ...splitName(customerName),
      headTeacherName: '', // left empty on purpose - filled in later from the signed form
      headTeacherPhone: mobile || '',
      nmsId,
      mac: '', // filled in manually
      upazila: matched.upazila || upazilaKey(thanaText) || '',
      unionName,
      category,
      issueFound: 'New connection setup from CSV import',
      missingWrongDetails: '',
      actionTaken: 'Pending MAC address configuration',
      reasonForAction: 'New connection provisioning',
      foremanInformed: 'Yes - phone',
      followUpNeeded: 'Yes',
      status: 'Pending - waiting for foreman',
      supervisorInformed: 'I informed my superiors',
      remarks: remarks || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    readyToImport.push(newLog);

    // Update statistics
    const catLabel = cleanCategoryLabel(category);
    categoryCounts[catLabel] = (categoryCounts[catLabel] || 0) + 1;

    const resLabel = matched.foremanName || 'Unassigned';
    foremanCounts[resLabel] = (foremanCounts[resLabel] || 0) + 1;
  }

  return {
    readyToImport,
    skippedDuplicates,
    totalRows: dataRows.length,
    categoryCounts,
    foremanCounts,
  };
}
