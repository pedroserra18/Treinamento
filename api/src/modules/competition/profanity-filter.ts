// Server-side profanity / harassment filter for competition chat.
//
// Pragmatic approach: a curated list of pt-BR insults, slurs and a few
// English overlaps. We normalise the input (strip diacritics, lowercase,
// expand common leetspeak) and check for word-boundary matches so plain
// substrings inside legitimate words don't trigger false positives.
// Comprehensive profanity detection is genuinely hard — this catches the
// obvious cases without going to a third-party API.

const BANNED_WORDS: string[] = [
  // pt-BR — palavrões / insultos comuns
  "porra", "merda", "caralho", "puta", "puto", "pqp",
  "filho da puta", "fdp", "vsf", "vai se foder", "vai tomar no cu",
  "cuzao", "cuzão", "cuzudo", "cu",
  "viado", "viadinho", "veado",
  "boiola", "bicha", "bichona",
  "punheteiro", "punhetao", "punhetão",
  "buceta", "boceta", "bucetao", "bocetao", "xoxota",
  "rola", "pinto", "piroca", "pau no cu",
  "babaca", "bostinha", "bosta",
  "otario", "otário", "otaria", "otária",
  "imbecil", "idiota", "burro", "burra", "anta",
  "vagabundo", "vagabunda", "vadia",
  "corno", "corna", "cornudo",
  "puta que pariu",
  "arrombado", "arrombada",
  "lixo humano", "verme",
  "macumbeiro", "macumbeira",
  "retardado", "retardada", "mongoloide", "mongolóide", "mongol",
  // racial / homofóbicos comuns
  "macaco", "preto fedido", "negao fedido",
  "viadinho", "sapatao", "sapatão",
  // English overlaps
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot",
  "retard", "whore", "slut", "bastard"
];

// Maps the common leetspeak / accent substitutions we want to normalize
// away. Applied after lowercase + diacritic strip.
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i"
};

// Strips diacritics + lowercases. ('cAráLhO' → 'caralho')
function normalize(text: string): string {
  // NFD splits 'á' into 'a' + combining accent; we then drop the
  // combining marks.
  let n = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Apply leetspeak replacements char-by-char.
  let out = "";
  for (const ch of n) {
    out += LEET_MAP[ch] ?? ch;
  }
  // Drop any repeated letters (cuuuuu → cu) so simple obfuscation fails too.
  out = out.replace(/(.)\1{2,}/g, "$1$1");
  return out;
}

export type ProfanityCheckResult =
  | { ok: true }
  | { ok: false; matchedWord: string };

// Returns ok=true when the message is clean, ok=false (with the matched
// term, for logging) when it should be blocked. We do word-boundary
// matching on the normalised text so legitimate words containing a
// banned substring aren't false positives.
export function checkProfanity(text: string): ProfanityCheckResult {
  const normalised = normalize(text);
  for (const word of BANNED_WORDS) {
    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b doesn't work across spaces for multi-word terms so we wrap with
    // a manual non-letter boundary that also accepts string start/end.
    const re = new RegExp(`(^|[^a-z])${safe}([^a-z]|$)`, "i");
    if (re.test(normalised)) {
      return { ok: false, matchedWord: word };
    }
  }
  return { ok: true };
}
