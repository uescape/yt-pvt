/** Lowercases, strips diacritics and collapses whitespace so "Pránk  VIDEO" matches "prank video". */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WORD = '[\\p{L}\\p{N}\\p{M}]';

/**
 * Compiles a keyword list into one matcher.
 * - Matching is whole-word: "war" does not match "award".
 * - Phrases work: "try not to laugh".
 * - A trailing `*` is a prefix wildcard: "prank*" matches "pranks", "pranked".
 * - `#hashtags` match literally.
 */
export function compileKeywordMatcher(keywords: readonly string[]): ((text: string) => string | null) | null {
  const cleaned = [...new Set(keywords.map((k) => normalizeText(k)).filter(Boolean))];
  if (cleaned.length === 0) return null;

  const patterns = cleaned.map((kw) => {
    const wildcard = kw.endsWith('*');
    const base = escapeRegExp(wildcard ? kw.slice(0, -1).trimEnd() : kw).replace(/ /g, '\\s+');
    return { kw, re: new RegExp(`(?:^|(?!${WORD}).)${base}${wildcard ? `${WORD}*` : ''}(?!${WORD})`, 'u') };
  });

  return (text: string) => {
    const normalized = normalizeText(text);
    for (const p of patterns) {
      if (p.re.test(normalized)) return p.kw;
    }
    return null;
  };
}
