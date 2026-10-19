import type { LogEntry, Foreman } from '../types';
import { UPAZILAS, logUpazila } from './upazilas';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function unionText(raw?: string): string {
  return (raw || '')
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

// ───────────── "Looks like the same union" detection (hints only, never merges) ─────────────

function foldBangla(s: string): string {
  return s
    .replace(/ী/g, 'ি')
    .replace(/ূ/g, 'ু')
    .replace(/[শষ]/g, 'স')
    .replace(/ণ/g, 'ন')
    .replace(/য়/g, 'য')
    .replace(/[ড়ঢ়]/g, 'র')
    .replace(/[ডঢ]়/g, 'র')
    .replace(/[ঁ়]/g, '')
    .replace(/ৈ/g, 'ই');
}

const BN_CONS: Record<string, string> = {
  'ক': 'k', 'খ': 'k', 'গ': 'g', 'ঘ': 'g', 'ঙ': 'n', 'চ': 'c', 'ছ': 'c', 'জ': 'j', 'ঝ': 'j', 'ঞ': 'n',
  'ট': 't', 'ঠ': 't', 'ড': 'd', 'ঢ': 'd', 'ত': 't', 'থ': 't', 'দ': 'd', 'ধ': 'd', 'ন': 'n', 'ণ': 'n',
  'প': 'p', 'ফ': 'p', 'ব': 'b', 'ভ': 'b', 'ম': 'm', 'র': 'r', 'ল': 'l', 'শ': 's', 'ষ': 's', 'স': 's',
  'ৎ': 't', 'ং': 'n',
};

function skeleton(text: string): string {
  const s = foldBangla(text.toLowerCase()).replace(/[^\p{L}\p{N}]/gu, '');
  let out = '';
  for (const ch of s) {
    if (BN_CONS[ch]) out += BN_CONS[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
  }
  return out
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/q/g, 'k')
    .replace(/f/g, 'p').replace(/v/g, 'b').replace(/[wy]/g, '').replace(/z/g, 'j').replace(/x/g, 'ks')
    .replace(/(?<=.)h/g, '')
    .replace(/(?<=.)[aeiou]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const looseKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ───────────────────────── Grouping ─────────────────────────

export interface UnionStat {
  id: string;
  upazila: string;
  name: string;
  count: number;
  similarTo: { name: string; count: number }[];
  logIds: string[];
}

export function groupUnions(upazila: string, entries: { id: string; raw: string }[]): UnionStat[] {
  const map = new Map<string, UnionStat>();
  for (const e of entries) {
    const name = unionText(e.raw);
    if (!name) continue;
    let u = map.get(name);
    if (!u) {
      u = { id: `${upazila}::${name}`, upazila, name, count: 0, similarTo: [], logIds: [] };
      map.set(name, u);
    }
    u.count++;
    u.logIds.push(e.id);
  }
  const list = [...map.values()];

  // Flag look-alikes. Only compare within this upazila; a sound match needs >= 3 consonants.
  const loose = new Map<string, UnionStat[]>();
  const sound = new Map<string, UnionStat[]>();
  for (const u of list) {
    const lk = looseKey(u.name);
    if (lk) loose.set(lk, [...(loose.get(lk) || []), u]);
    const sk = skeleton(u.name);
    if (sk.length >= 3) sound.set(sk, [...(sound.get(sk) || []), u]);
  }
  for (const u of list) {
    const peers = new Set<UnionStat>([...(loose.get(looseKey(u.name)) || []), ...(sound.get(skeleton(u.name)) || [])]);
    peers.delete(u);
    u.similarTo = [...peers].sort((a, b) => b.count - a.count).map((p) => ({ name: p.name, count: p.count }));
  }
  return list;
}

// ───────────────────────── The full report ─────────────────────────

export interface UpazilaStat {
  key: string;
  bn: string;
  count: number;
  share: number;
  noUnion: number;
  unions: UnionStat[];
  topUnions: UnionStat[];
  bottomUnions: UnionStat[];
}

export interface CoverageReport {
  total: number;
  noUpazila: LogEntry[];
  noUnion: number;
  upazilas: UpazilaStat[];
  topUpazilas: UpazilaStat[];
  bottomUpazilas: UpazilaStat[];
  unions: UnionStat[];
  topUnions: UnionStat[];
  bottomUnions: UnionStat[];
  lookAlikes: number;
}

function extremes<T extends { count: number }>(list: T[], pick: 'max' | 'min'): T[] {
  if (!list.length) return [];
  const target = pick === 'max' ? Math.max(...list.map((x) => x.count)) : Math.min(...list.map((x) => x.count));
  return list.filter((x) => x.count === target);
}

const byCountThenName = (a: { count: number; name?: string; key?: string }, b: { count: number; name?: string; key?: string }) =>
  b.count - a.count || String(a.name ?? a.key).localeCompare(String(b.name ?? b.key));

export function buildCoverageReport(logs: LogEntry[], foremen: Foreman[]): CoverageReport {
  const live = logs.filter((l) => !l.deletedAt);

  // Same upazila rule the Connection Records filter uses, so the numbers match what you see there.
  const perUpazila = new Map<string, LogEntry[]>();
  const noUpazila: LogEntry[] = [];
  // Lookup once instead of searching the foreman list for every log.
  for (const l of live) {
    const u = logUpazila(l, foremen);
    if (!u) {
      noUpazila.push(l);
      continue;
    }
    const arr = perUpazila.get(u);
    if (arr) arr.push(l);
    else perUpazila.set(u, [l]);
  }

  const known = live.length - noUpazila.length;
  let noUnionTotal = 0;

  const upazilas: UpazilaStat[] = UPAZILAS.map((u) => {
    const rows = perUpazila.get(u.key) || [];
    const withUnion: { id: string; raw: string }[] = [];
    let noUnion = 0;
    for (const l of rows) {
      if (unionText(l.unionName)) withUnion.push({ id: l.id, raw: l.unionName || '' });
      else noUnion++;
    }
    noUnionTotal += noUnion;
    const unions = groupUnions(u.key, withUnion).sort(byCountThenName);
    return {
      key: u.key,
      bn: u.bn,
      count: rows.length,
      share: known ? (rows.length / known) * 100 : 0,
      noUnion,
      unions,
      topUnions: extremes(unions, 'max'),
      bottomUnions: extremes(unions, 'min'),
    };
  }).sort(byCountThenName);

  const unions = upazilas.flatMap((u) => u.unions).sort((a, b) => byCountThenName(a, b) || a.upazila.localeCompare(b.upazila));

  return {
    total: live.length,
    noUpazila,
    noUnion: noUnionTotal,
    upazilas,
    topUpazilas: extremes(upazilas, 'max'),
    bottomUpazilas: extremes(upazilas, 'min'),
    unions,
    topUnions: extremes(unions, 'max'),
    bottomUnions: extremes(unions, 'min'),
    lookAlikes: unions.filter((x) => x.similarTo.length > 0).length,
  };
}
