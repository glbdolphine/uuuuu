// One colour per institute category, shared by the Logs toolbar and the log list.

export interface CategoryStyle {
  pill: string;
  dot: string;
}

const STYLES: { match: RegExp; style: CategoryStyle }[] = [
  { match: /technical/i, style: { pill: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' } },
  { match: /social/i, style: { pill: 'bg-lime-50 text-lime-700', dot: 'bg-lime-500' } },
  { match: /diabetic/i, style: { pill: 'bg-cyan-50 text-cyan-700', dot: 'bg-cyan-500' } },
  { match: /ministry|law/i, style: { pill: 'bg-fuchsia-50 text-fuchsia-700', dot: 'bg-fuchsia-500' } },
  { match: /primary/i, style: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' } },
  { match: /secondary/i, style: { pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' } },
  { match: /national|university/i, style: { pill: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' } },
  { match: /madrasa/i, style: { pill: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' } },
  { match: /health/i, style: { pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' } },
  { match: /land|reform/i, style: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' } },
  { match: /govt|government|organi[sz]ation/i, style: { pill: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' } },
];

const FALLBACK: CategoryStyle = { pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

export function categoryStyle(label?: string): CategoryStyle {
  if (!label) return FALLBACK;
  return STYLES.find((s) => s.match.test(label))?.style ?? FALLBACK;
}
