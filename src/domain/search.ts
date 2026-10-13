// Letters that don't decompose into base letter + accent under NFD.
const EXTRA: Record<string, string> = {
  ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i',
};

/** Lower-cases and strips accent marks, so "Ødegaard" and "José" match "odegaard" and "jose". */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øłđðþßæœı]/g, (c) => EXTRA[c]);
}

/** True if `text` contains `query`, ignoring case, accents and surrounding spaces. Empty query matches all. */
export function matchesQuery(text: string, query: string): boolean {
  const q = foldText(query.trim());
  return !q || foldText(text).includes(q);
}
