export const monthKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const isMonthKey = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function monthLabel(key: string, short = false): string {
  if (!isMonthKey(key)) return key;
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: 'numeric' });
}

export function monthOptions(withData: Iterable<string> = []): string[] {
  const set = new Set<string>();
  for (const m of withData) if (isMonthKey(m)) set.add(m);
  const now = new Date();
  for (let i = 0; i < 6; i++) set.add(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return [...set].sort().reverse();
}
