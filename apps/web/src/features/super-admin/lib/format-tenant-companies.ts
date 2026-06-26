/** Summary of legal entities under one tenant for list/export. */
export function formatTenantCompaniesLabel(legalNames: string[]): string {
  const names = legalNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return "—";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} (+${names.length - 2} más)`;
}
