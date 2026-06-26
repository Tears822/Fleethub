/** Values copied from docs/examples — not real FreeNow int64 ids. */
const PLACEHOLDER_NUMERIC_IDS = new Set([
  12_345,
  98_765,
  98_7654,
  123_456,
  1_234_567,
  12_345_678,
]);

export function isLikelyPlaceholderFreenowNumericId(id: number): boolean {
  return PLACEHOLDER_NUMERIC_IDS.has(id);
}
