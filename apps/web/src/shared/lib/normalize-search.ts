/** Case- and accent-insensitive substring match for client-side filters. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function matchesSearchQuery(text: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  return normalizeForSearch(text).includes(q);
}
