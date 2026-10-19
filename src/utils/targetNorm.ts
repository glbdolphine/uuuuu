// Shared by the browser and the server: turns whatever the Excel / old targets.json holds into
// one clean shape - a canonical upazila and a canonical category - so the Targets tab can group reliably.
import { upazilaKey, upazilaBn } from './upazilas';
import { CATEGORY_LABELS, SECONDARY_LABEL, detectCategoryFromName, stripCategoryNumber } from './category';

export interface TargetInstitute {
  edc: string;
  upazila: string;
  category: string;
  name: string;
  union?: string;
  department?: string;
  contact?: string;
  mobile?: string;
  emis?: string;
}

export const UNCATEGORISED = 'Uncategorised';

const squash = (s: string) => s.normalize('NFC').replace(/[‌‍]/g, '').replace(/\s+/g, '').toLowerCase();

const DEPARTMENTS: [string, string][] = [
  ['প্রাথমিকশিক্ষা', 'Primary Education'],
  ['মাধ্যমিকওউচ্চশিক্ষা', SECONDARY_LABEL],
  ['মাধ্যমিক', SECONDARY_LABEL],
  ['স্বাস্থ্যসেবা', 'Health Service'],
  ['ভূমিসংস্কার', 'Land Reform Board'],
  ['ভুমিসংস্কার', 'Land Reform Board'],
  ['জাতীয়বিশ্ববিদ্যালয়', 'National University'],
  ['সমাজসেবা', 'Department of Social Services'],
  ['মাদ্রাসা', 'Madrasa Education'],
  ['মাদরাসা', 'Madrasa Education'],
  ['আইনমন্ত্রণালয়', 'Ministry of Law'],
  ['আইনমন্ত্রনালয়', 'Ministry of Law'],
  ['ডায়াবেটিক', 'Diabetic Association of Bangladesh'],
  ['কারিগরিশিক্ষা', 'Technical Education'],
  ['govt.organization', 'Govt. Organization'],
  ['governmentorganization', 'Govt. Organization'],
].map(([k, v]) => [squash(k), v] as [string, string]);

export function normalizeCategory(raw?: string, name?: string): string {
  const text = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const key = squash(text);
  if (key) {
    const hit = DEPARTMENTS.find(([k]) => key.includes(k));
    if (hit) return hit[1];
    const own = stripCategoryNumber(text);
    const label = CATEGORY_LABELS.find((l) => squash(l) === squash(own));
    if (label) return label;
    const guessed = detectCategoryFromName(text);
    if (guessed) return guessed;
  }
  return detectCategoryFromName(name) || text || UNCATEGORISED;
}

export function normalizeUpazila(raw?: string, fallback?: string): string {
  for (const t of [raw, fallback]) {
    const key = upazilaKey(t);
    if (key) return upazilaBn(key);
  }
  return String(raw || fallback || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const cleanEdc = (v: unknown): string => {
  const t = String(v ?? '').trim().replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/\.0+$/, '');
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : '';
};

const clean = (v: unknown, max = 300) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeTarget(o: Record<string, unknown>, sheetName?: string): TargetInstitute | null {
  const edc = cleanEdc(o.edc);
  if (!edc) return null;
  const name = clean(o.name, 500);
  const department = clean(o.department);
  let mobile = clean(o.mobile, 60);
  if (/^1\d{9}$/.test(mobile)) mobile = '0' + mobile; // Excel dropped the leading zero
  const t: TargetInstitute = {
    edc,
    upazila: normalizeUpazila(clean(o.upazila), sheetName),
    category: normalizeCategory(department || clean(o.category), name),
    name,
  };
  const union = clean(o.union);
  const contact = clean(o.contact);
  const emis = clean(o.emis, 60);
  if (union) t.union = union;
  if (department) t.department = department;
  if (contact) t.contact = contact;
  if (mobile) t.mobile = mobile;
  if (emis) t.emis = emis;
  return t;
}

export const sameTarget = (a: TargetInstitute, b: TargetInstitute) =>
  a.upazila === b.upazila && a.category === b.category && a.name === b.name &&
  (a.union || '') === (b.union || '') && (a.department || '') === (b.department || '') &&
  (a.contact || '') === (b.contact || '') && (a.mobile || '') === (b.mobile || '') && (a.emis || '') === (b.emis || '');
