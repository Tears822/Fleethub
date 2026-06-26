/**
 * Detect fleet businesses / org rows that platforms list as "drivers" but are not people.
 * Uber returns each linked DRIVER_BUSINESS org as a row in GET /drivers for that org.
 */

export function normalizeFleetEntityMatchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function fleetEntityNamesMatch(a: string, b: string): boolean {
  const left = normalizeFleetEntityMatchKey(a);
  const right = normalizeFleetEntityMatchKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 6 && right.length >= 6) {
    return left.includes(right) || right.includes(left);
  }
  return false;
}

/** Name looks like a company (S.L., known fleet brands) rather than a person. */
export function isLikelyCompanyNameDriver(fullName: string): boolean {
  const key = normalizeFleetEntityMatchKey(fullName);
  if (!key) return false;
  return (
    key.includes("BADAVI") ||
    key.includes("TAXIBUSINESS") ||
    key.includes("TRADETAXI") ||
    key.includes("TRADETAXIS") ||
    key.includes("GOLDENTAXI") ||
    (key.endsWith("SL") && key.length < 28) ||
    /\bSRL\b/.test(key) ||
    key.endsWith("SA")
  );
}

/**
 * Skip import when display name matches a fleet org/company label from the platform or tenant.
 */
export function isLikelyFleetEntityDriverName(
  fullName: string,
  referenceNames: string[] = [],
): boolean {
  const trimmed = fullName.trim();
  if (!trimmed) return true;

  if (isLikelyCompanyNameDriver(trimmed)) return true;

  for (const ref of referenceNames) {
    if (ref.trim() && fleetEntityNamesMatch(trimmed, ref)) return true;
  }

  return false;
}
