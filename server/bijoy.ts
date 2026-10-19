// Bijoy (SutonnyMJ) -> Bangla Unicode converter.
//
// Many EDC/UPAC PDFs store Bangla names (institute, union, upazila...) as legacy Bijoy
// text, e.g. "evjvMÄ m`i" instead of "বালাগঞ্জ সদর". The PDF text layer therefore holds
// plain Latin-looking characters that must be decoded with the Bijoy keyboard layout.
//
// Rules implemented here:
//  - plain letters / vowels / kar signs map 1:1
//  - "pre-kar" signs (ি ে ৈ) are typed BEFORE the consonant but belong AFTER it in Unicode
//  - half-form glyphs (e.g. চ্ স্) and post-base glyphs (্র ্য ্ব) stay inside the same cluster
//  - reph (©) is typed after the cluster but belongs before it
//  - digits become Bangla digits

const CONSONANT: Record<string, string> = {
  K: 'ক', L: 'খ', M: 'গ', N: 'ঘ', O: 'ঙ', P: 'চ', Q: 'ছ', R: 'জ', S: 'ঝ', T: 'ঞ',
  U: 'ট', V: 'ঠ', W: 'ড', X: 'ঢ', Y: 'ণ', Z: 'ত', _: 'থ', '`': 'দ', a: 'ধ', b: 'ন',
  c: 'প', d: 'ফ', e: 'ব', f: 'ভ', g: 'ম', h: 'য', i: 'র', j: 'ল', k: 'শ', l: 'ষ',
  m: 'স', n: 'হ', o: 'ড়', p: 'ঢ়', q: 'য়', r: 'ৎ',
  // full conjunct glyphs
  'Ä': 'ঞ্জ', '¶': 'ক্ষ',
};

// Half forms: consonant + hasanta, they continue the cluster.
const HALF: Record<string, string> = {
  '”': 'চ্', '¯': 'স্', '’': 'থ',
};
// '’' is really the full letter থ (used after ¯ to make স্থ); keep it as a consonant.
delete HALF['’'];
CONSONANT['’'] = 'থ';

// Post-base glyphs attached to the previous consonant.
const POSTBASE: Record<string, string> = {
  'Ö': '্র', 'ª': '্র', '«': '্র', '¨': '্য', '¬': '্ব', '¦': '্ব', 'œ': '্ন',
};

const VOWEL: Record<string, string> = {
  A: 'অ', B: 'ই', C: 'ঈ', D: 'উ', E: 'ঊ', F: 'ঋ', G: 'এ', H: 'ঐ', I: 'ও', J: 'ঔ',
};

// Signs written after the consonant.
const POSTKAR: Record<string, string> = {
  v: 'া', x: 'ী', y: 'ু', z: 'ূ', 'æ': 'ু', '„': 'ৃ', 'Š': 'ৗ',
  s: 'ং', t: 'ঃ', u: 'ঁ',
};

// Signs written BEFORE the consonant.
const PREKAR: Record<string, string> = {
  w: 'ি', '†': 'ে', '‡': 'ে', 'ˆ': 'ৈ', '‰': 'ৈ',
};

const DIGITS = '০১২৩৪৫৬৭৮৯';
const PASSTHROUGH = new Set([' ', '(', ')', '-', ',', '.', '/', ':', ';', '&', '\u00a0']);

export interface BijoyResult {
  text: string;
  unknown: number;
}

export function convertBijoy(input: string): BijoyResult {
  const chars = Array.from(input);
  const out: string[] = [];
  let unknown = 0;
  let clusterStart = -1; // index in `out` where the last consonant cluster begins
  let pendingPre = '';

  const isConsonantGlyph = (c: string) => c in CONSONANT;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];

    if (c in PREKAR) {
      pendingPre += PREKAR[c];
      continue;
    }

    if (c in HALF || isConsonantGlyph(c)) {
      // Build one cluster: (half-forms)* consonant (post-base)*
      clusterStart = out.length;
      let j = i;
      while (j < chars.length && chars[j] in HALF) {
        out.push(HALF[chars[j]]);
        j++;
      }
      if (j < chars.length && isConsonantGlyph(chars[j])) {
        out.push(CONSONANT[chars[j]]);
        j++;
      }
      while (j < chars.length && chars[j] in POSTBASE) {
        out.push(POSTBASE[chars[j]]);
        j++;
      }
      if (pendingPre) {
        out.push(pendingPre);
        pendingPre = '';
      }
      i = j - 1;
      continue;
    }

    if (c === '©') {
      // reph: typed after the cluster, belongs in front of it
      if (clusterStart >= 0) out.splice(clusterStart, 0, 'র্');
      else unknown++;
      continue;
    }

    if (c in VOWEL) {
      out.push(VOWEL[c]);
      clusterStart = -1;
      continue;
    }

    if (c in POSTKAR) {
      out.push(POSTKAR[c]);
      continue;
    }

    if (c >= '0' && c <= '9') {
      out.push(DIGITS[Number(c)]);
      continue;
    }

    if (c === '|') {
      out.push('।');
      continue;
    }

    if (PASSTHROUGH.has(c)) {
      out.push(c);
      clusterStart = -1;
      continue;
    }

    unknown++;
  }

  if (pendingPre) out.push(pendingPre);

  return { text: out.join('').normalize('NFC').replace(/\s+/g, ' ').trim(), unknown };
}

export function isBijoyChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code < 0x100) return true;
  return '‘’“”•–—˜™‹›‡†‰ŠšŒœŸƒˆ…€'.includes(ch);
}
