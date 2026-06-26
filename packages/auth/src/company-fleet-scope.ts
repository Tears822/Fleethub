/**
 * Fleet operators (S.L., etc.) vs autónomo drivers stored as their own "company" row (personal NIF).
 * Shell company filter should list only fleet operators — not driver autónomo accounts.
 */

export function isFleetOperatorTaxId(taxId: string | null | undefined): boolean {
  if (!taxId) return false;
  const t = taxId.trim().toUpperCase().replace(/[\s.]/g, "");
  if (t.length < 2) return false;

  // Personal NIF: 8 digits + letter.
  if (/^[0-9]{8}[A-Z]$/.test(t)) return false;
  // NIE / special personal: X/Y/Z/K/L/M + 7 digits + letter.
  if (/^[XYZKLM][0-9]{7}[A-Z]$/.test(t)) return false;

  // Spanish juridical-person CIF (S.L., S.A., etc.).
  if (/^[A-W][0-9]{7}[0-9A-J]$/.test(t)) return true;

  // Production / demo seeds (e.g. P-NOEMI-ALQ).
  if (/^P-[A-Z0-9-]+$/.test(t)) return true;

  return false;
}

export function isFleetOperatorCompany(company: {
  taxId: string | null;
}): boolean {
  return isFleetOperatorTaxId(company.taxId);
}
