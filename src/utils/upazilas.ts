import type { LogEntry, Foreman } from '../types';

// The 13 upazilas of Sylhet district (the company's coverage area).
// `key` is what gets stored in the database (Foreman.area).
export interface Upazila {
  key: string;
  bn: string;
  aliases: string[];
}

export const UPAZILAS: Upazila[] = [
  { key: 'Balaganj', bn: 'বালাগঞ্জ', aliases: ['balagonj', 'balaganj', 'balaganj sadar'] },
  { key: 'Beanibazar', bn: 'বিয়ানীবাজার', aliases: ['beanibazar', 'beani bazar', 'beanibazaar', 'biyanibazar'] },
  { key: 'Bishwanath', bn: 'বিশ্বনাথ', aliases: ['bishwanath', 'biswanath', 'bishwonath', 'biswonath'] },
  { key: 'Companiganj', bn: 'কোম্পানীগঞ্জ', aliases: ['companiganj', 'company ganj', 'companigonj'] },
  { key: 'Dakshin Surma', bn: 'দক্ষিণ সুরমা', aliases: ['দক্ষিন সুরমা', 'dakshin surma', 'south surma', 'dokkhin surma', 'daksin surma', 'd surma', 'd.surma', 'dokkinsurma', 'moglabazar'] },
  { key: 'Fenchuganj', bn: 'ফেঞ্চুগঞ্জ', aliases: ['fenchuganj', 'fenchugonj', 'fencuganj'] },
  { key: 'Golapganj', bn: 'গোলাপগঞ্জ', aliases: ['golapganj', 'golapgonj', 'golapgonj', 'golapganj sadar', 'golabgonj', 'golabganj'] },
  { key: 'Gowainghat', bn: 'গোয়াইনঘাট', aliases: ['gowainghat', 'goainghat', 'gowain ghat'] },
  { key: 'Jaintiapur', bn: 'জৈন্তাপুর', aliases: ['jaintiapur', 'jointiapur', 'jaintapur', 'jointa'] },
  { key: 'Kanaighat', bn: 'কানাইঘাট', aliases: ['kanaighat', 'kanaighat sadar', 'kanai ghat'] },
  { key: 'Osmani Nagar', bn: 'ওসমানী নগর', aliases: ['ওসমানীনগর', 'osmani nagar', 'osmaninagar', 'usmani nagar', 'osmanpur', 'tajpur'] },
  { key: 'Sylhet Sadar', bn: 'সিলেট সদর', aliases: ['sylhet sadar', 'sylhet sodor', 'sylhet sador', 'sadar', 'sylhet', 'সিলেট', 'shah paran', 'airport', 'jalalabad', 'kotwali'] },
  { key: 'Zakiganj', bn: 'জকিগঞ্জ', aliases: ['zakiganj', 'jakiganj', 'zakigonj', 'jakigonj', 'jokigonj', 'jokiganj'] },
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[.,()\-]/g, ' ').replace(/\s+/g, ' ').trim();

export function upazilaKey(text?: string): string {
  if (!text) return '';
  const t = norm(text);
  if (!t) return '';
  for (const u of UPAZILAS) {
    if (norm(u.key) === t || u.bn === text.trim() || u.aliases.some((a) => norm(a) === t)) return u.key;
  }
  // Bangla text that contains an upazila name, e.g. "সিলেট সদর"
  for (const u of UPAZILAS) {
    if (text.includes(u.bn)) return u.key;
  }
  return '';
}

export function upazilaBn(key: string): string {
  return UPAZILAS.find((u) => u.key === key)?.bn || '';
}

export function splitLegacyName(full: string): { name: string; area: string } | null {
  const m = full.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (!m) return null;
  const area = upazilaKey(m[2]);
  return area ? { name: m[1].trim(), area } : null;
}

export function foremanServes(f: Foreman | null | undefined, upazila: string): boolean {
  if (!f) return false;
  const u = upazilaKey(upazila);
  if (!u) return true;
  if (upazilaKey(f.area) === u) return true;
  if (!f.roam) return false;
  const areas = (f.roamAreas || []).map((a) => upazilaKey(a)).filter(Boolean);
  return areas.length === 0 || areas.includes(u);
}

export function logUpazila(log: LogEntry, foremen: Foreman[]): string {
  const r =
    (log.foremanId && foremen.find((x) => x.id === log.foremanId)) ||
    foremen.find((x) => x.name.trim().toLowerCase() === (log.foremanName || '').trim().toLowerCase());
  // The record's own upazila wins (it is normally the foreman's area anyway); a record with no foreman yet is counted by it too.
  if (upazilaKey(log.upazila)) return upazilaKey(log.upazila);
  return upazilaKey(r?.area) || upazilaKey(log.upazila) || upazilaKey(log.foremanName.split(/[-–]/).pop());
}

export function foremanLogName(r: Foreman, all: Foreman[]): string {
  const clash = all.some((x) => x.id !== r.id && !x.deletedAt && x.name.trim().toLowerCase() === r.name.trim().toLowerCase());
  return clash && r.area ? `${r.name} (${r.area})` : r.name;
}

export function parseForemanAndUpazilaFromArea(
  areaText: string,
  thanaText: string = '',
  foremen: Foreman[] = []
): { foreman: Foreman | null; foremanName: string; upazila: string; foremanPhone: string } {
  const cleanArea = (areaText || '').trim();
  const cleanThana = (thanaText || '').trim();

  // Primary thana/upazila from the Thana column
  let detectedUpazila = upazilaKey(cleanThana);

  // Extract foreman candidate name and possible upazila from Area string
  // Examples: "36.EDC-Sylhet-Sadar-Liton" -> upazila: "Sylhet-Sadar", foreman: "Liton"
  // "04.EDC-D.Surma-Shahel" -> upazila: "D.Surma", foreman: "Shahel"
  // "42.EDC-Beanibazar-Sohag-Ahmed" -> upazila: "Beanibazar", foreman: "Sohag-Ahmed"
  // "27.EDC-Jokigonj-Monir/Shunasar" -> upazila: "Jokigonj", foreman: "Monir/Shunasar"
  let candidateForeman = '';
  let areaUpazilaCandidate = '';

  const edcMatch = cleanArea.match(/^\d+\.EDC-(.+)$/i);
  if (edcMatch) {
    const rest = edcMatch[1]; // e.g. "Sylhet-Sadar-Liton", "D.Surma-Shahel", "Beanibazar-Sohag-Ahmed"
    
    // Test known upazilas as prefix
    for (const u of UPAZILAS) {
      const uAliases = [u.key, ...u.aliases];
      for (const alias of uAliases) {
        const regexStr = '^' + alias.replace(/[.\-]/g, '[.\\-]').replace(/\s+/g, '[\\s.\\-]') + '-(.+)$';
        const match = rest.match(new RegExp(regexStr, 'i'));
        if (match) {
          areaUpazilaCandidate = u.key;
          candidateForeman = match[1].trim();
          break;
        }
      }
      if (candidateForeman) break;
    }

    if (!candidateForeman) {
      // Fallback: take the last segment after the last dash
      const parts = rest.split('-');
      candidateForeman = parts.pop()?.trim() || '';
      areaUpazilaCandidate = upazilaKey(parts.join(' '));
    }
  } else if (cleanArea) {
    candidateForeman = cleanArea;
  }

  // Prioritize areaUpazilaCandidate if thana was empty, or use thana
  if (!detectedUpazila && areaUpazilaCandidate) {
    detectedUpazila = areaUpazilaCandidate;
  }

  // Now match against foremen in the database
  let matchedForeman: Foreman | null = null;
  const candLower = candidateForeman.toLowerCase();

  if (candLower && foremen.length > 0) {
    // 1. Exact name match
    matchedForeman = foremen.find((r) => !r.deletedAt && r.name.trim().toLowerCase() === candLower) || null;

    // 2. Substring / slash match (e.g. "Monir" matching "Monir/Shunasar" or vice versa)
    if (!matchedForeman) {
      matchedForeman = foremen.find((r) => {
        if (r.deletedAt) return false;
        const rName = r.name.trim().toLowerCase();
        return (
          candLower.includes(rName) ||
          rName.includes(candLower) ||
          candLower.split(/[/_-]/).some((part) => part && rName === part) ||
          rName.split(/[/_-]/).some((part) => part && candLower === part)
        );
      }) || null;
    }

    // 3. Match by name within the same upazila
    if (!matchedForeman && detectedUpazila) {
      matchedForeman = foremen.find(
        (r) => !r.deletedAt && upazilaKey(r.area) === detectedUpazila && (candLower.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(candLower))
      ) || null;
    }
  }

  // If foreman was matched and has an area, that confirms or supplies upazila
  if (matchedForeman && matchedForeman.area) {
    detectedUpazila = upazilaKey(matchedForeman.area) || detectedUpazila;
  }

  const finalForemanName = matchedForeman ? matchedForeman.name : candidateForeman || cleanArea;
  const finalPhone = matchedForeman?.phone || '';

  return {
    foreman: matchedForeman,
    foremanName: finalForemanName,
    upazila: detectedUpazila || areaUpazilaCandidate,
    foremanPhone: finalPhone,
  };
}

