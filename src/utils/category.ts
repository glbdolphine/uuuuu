// Automatic category detection from the institute name (shared by client and server).

export const CATEGORY_LABELS = [
  'Primary Education',
  'Secondary and Higher Secondary Education',
  'Technical Education',
  'Ministry of Law',
  'Department of Social Services',
  'Diabetic Association of Bangladesh',
  'National University',
  'Madrasa Education',
  'Health Service',
  'Land Reform Board',
  'Govt. Organization',
] as const;

// Order matters: the first rule that matches wins. Education institutes are checked first so
// that e.g. "Union High School" is Secondary and Higher Secondary, not Land Reform (because of "Union").
// Keywords are compared with all whitespace removed, so spacing variants still match.
const LEGACY_SECONDARY = /^secondary\s+education$/i;
export const SECONDARY_LABEL = 'Secondary and Higher Secondary Education';

const RULES: { label: string; keywords: string[] }[] = [
  {
    label: 'National University',
    keywords: [
      'বিশ্ববিদ্যালয়', 'বিশ্ববিদ্যালয', 'ইউনিভার্সিটি', 'university',
      // Degree colleges are affiliated with the National University (a plain "College" stays Secondary and Higher Secondary)
      'degreecollege', 'degreecollage', 'digreecollege', 'digreecollage', 'digricollege', 'digricollage', 'degricollege', 'degricollage', 'ডিগ্রিকলেজ', 'ডিগ্রীকলেজ', 'ডিগ্রীকলেজ',
    ],
  },
  { label: 'Madrasa Education', keywords: ['মাদ্রাসা', 'মাদরাসা', 'madrasa', 'madrasah', 'madrassa'] },
  { label: 'Primary Education', keywords: ['primar', 'প্রাথমিক'] },
  {
    // Checked before Secondary so that "Technical School and College" is Technical, not Secondary (because of "College").
    label: 'Technical Education',
    keywords: [
      'technical', 'polytechnic', 'vocational', 'টেকনিক্যাল', 'টেকনিকেল', 'কারিগরি', 'পলিটেকনিক', 'ভোকেশনাল',
    ],
  },
  {
    label: 'Ministry of Law',
    keywords: [
      'ministryoflaw', 'lawministry', 'আইনমন্ত্রণালয়', 'আইনমন্ত্রনালয়', 'আইনবিচার', 'জজকোর্ট', 'জজআদালত', 'judgecourt', 'আদালত',
      'সাবরেজিস্ট্রি', 'সাব-রেজিস্ট্রি', 'সাবরেজিস্ট্রার', 'subregistr', 'registryoffice',
    ],
  },
  // Both are checked before Health Service, because "সমাজসেবা" and "Diabetic ... Hospital" would otherwise match its "সেবা" / "health" / "clinic" keywords.
  {
    label: 'Department of Social Services',
    keywords: ['socialservice', 'socialwelfare', 'সমাজসেবা', 'সমাজকল্যাণ'],
  },
  {
    label: 'Diabetic Association of Bangladesh',
    keywords: ['diabetic', 'diabetes', 'ডায়াবেটিক', 'ডায়াবেটিস', 'ডায়বেটিক', 'ডায়বেটিস'],
  },
  {
    label: SECONDARY_LABEL,
    keywords: [
      'secondary', 'highschool', 'উচ্চবিদ্যালয়', 'উচ্চবিদ্যালয', 'colleg', 'collage', 'কলেজ',
      'academy', 'একাডেমি', 'একাডেমী',
      'international', 'ইন্টারনেশনাল', 'ইন্টারন্যাশনাল', 'internation', 'আন্তর্জাতিক', 'আন্তর্জাতিক',
    ],
  },
  { label: 'Health Service', keywords: ['ক্লিনিক', 'clinic', 'সেবা', 'health', 'স্বাস্থ'] },
  {
    label: 'Govt. Organization',
    keywords: ['ictcenter', 'govtcenter', 'governmentcenter', 'govt.center', 'উন্নয়নঅফিস', 'আইসিটিঅফিস'],
  },
  { label: 'Land Reform Board', keywords: ['ভূমি', 'ভুমি', 'ইউনিয়ন', 'union'] },
];

function normalize(s: string): string {
  return s
    .normalize('NFC') // য় typed as one char or as য + ় becomes identical
    .replace(/[\u200C\u200D]/g, '')
    .toLowerCase()
    .replace(/\u09C2/g, '\u09C1') // ূ -> ু so ভূমি / ভুমি are the same
    .replace(/\s+/g, '');
}

const NORMALIZED_RULES = RULES.map((r) => ({ label: r.label, keywords: r.keywords.map(normalize) }));

export function stripCategoryNumber(cat?: string): string {
  if (!cat) return '';
  const trimmed = cat.trim();
  const plain = trimmed.replace(/^\d+[\s.-]+/, '').trim() || trimmed;
  // "Secondary Education" was renamed: old records (and old CSV files) show the new name straight away.
  return LEGACY_SECONDARY.test(plain) ? SECONDARY_LABEL : plain;
}

export function detectCategoryFromName(...names: (string | undefined)[]): string {
  const text = normalize(names.filter(Boolean).join(' '));
  if (!text) return '';
  for (const rule of NORMALIZED_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.label;
  }
  return '';
}

export function displayCategory(log: {
  nameBn?: string;
  nameEn?: string;
  customerName?: string;
  category?: string;
}): string {
  return stripCategoryNumber(log.category) || detectCategoryFromName(log.nameBn, log.nameEn, log.customerName);
}

export function resolveCategory(log: {
  nameBn?: string;
  nameEn?: string;
  customerName?: string;
  category?: string;
}): string {
  return detectCategoryFromName(log.nameBn, log.nameEn, log.customerName) || stripCategoryNumber(log.category);
}
