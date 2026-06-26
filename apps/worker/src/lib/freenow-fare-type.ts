const T3_PATTERNS = [
  /\bt3\b/i,
  /tarifa\s*3/i,
  /precio\s*cerrado/i,
  /\bnon\s*metered\b/i,
  /\bnonmetered\b/i,
  /\bfixed\s*price\b/i,
  /\bfixed\s*fare\b/i,
  /\bupfront\b/i,
];

function looksLikeT3(label: string): boolean {
  const u = label.trim();
  if (!u) return false;
  return T3_PATTERNS.some((re) => re.test(u));
}

function looksLikeMetered(label: string): boolean {
  const upper = label.trim().toUpperCase();
  if (!upper) return false;
  if (upper.includes("NON_METER") || upper.includes("NONMETER")) return false;
  return upper.includes("METERED") || (upper.includes("METER") && !upper.includes("NON"));
}

/** Map FreeNow subFleetTypeLabel (Spain) → FleetHub fare type. */
export function mapFreenowSubFleetTypeLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  if (looksLikeT3(trimmed)) return "Precio cerrado (T3)";
  if (looksLikeMetered(trimmed)) return "Taxímetro";
  return trimmed;
}

/**
 * Map subFleetTypeId from live API (fleet-owner token returns id, not label).
 * Heuristic aligned with William's examples: *LITE* → fixed price; TAXI-ES-* → meter.
 */
export function mapFreenowSubFleetTypeId(id: string | null | undefined): string | null {
  const raw = id?.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  if (upper.includes("LITE")) return "Precio cerrado (T3)";

  if (
    upper.startsWith("TAXI-ES-") ||
    upper.startsWith("TAXIVAN-ES-") ||
    upper.includes("B2BTAXI")
  ) {
    return "Taxímetro";
  }

  if (looksLikeT3(raw) || looksLikeMetered(raw)) {
    return mapFreenowSubFleetTypeLabel(raw);
  }

  return null;
}

/** Map FreeNow `fixedFare` flag → FleetHub fare type. */
export function mapFreenowFixedFare(fixedFare: boolean | null | undefined): string | null {
  if (fixedFare === true) return "Precio cerrado (T3)";
  if (fixedFare === false) return "Taxímetro";
  return null;
}

/** Map FreeNow booking fields → FleetHub fareType (T3 vs taxímetro). */
export function mapFreenowFareType(
  hailingType: string | null | undefined,
  subFleetTypeLabel?: string | null,
  subFleetTypeId?: string | null,
  fixedFare?: boolean | null,
): string | null {
  const fromFixedFare = mapFreenowFixedFare(fixedFare);
  if (fromFixedFare) return fromFixedFare;

  const fromId = mapFreenowSubFleetTypeId(subFleetTypeId);
  if (fromId === "Precio cerrado (T3)" || fromId === "Taxímetro") {
    return fromId;
  }

  const fromSubFleet = mapFreenowSubFleetTypeLabel(subFleetTypeLabel);
  if (fromSubFleet === "Precio cerrado (T3)" || fromSubFleet === "Taxímetro") {
    return fromSubFleet;
  }

  const candidates = [subFleetTypeLabel, hailingType]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  for (const c of candidates) {
    if (looksLikeT3(c)) return "Precio cerrado (T3)";
  }

  for (const c of candidates) {
    if (looksLikeMetered(c)) return "Taxímetro";
  }

  const primary = candidates[0];
  if (!primary) return fromId ?? fromSubFleet ?? null;

  const upper = primary.toUpperCase();
  if (upper.includes("NON_METER") || upper.includes("NONMETER")) {
    return "Precio cerrado (T3)";
  }
  if (upper === "METERED" || (upper.includes("METER") && !upper.includes("NON"))) {
    return "Taxímetro";
  }

  return fromSubFleet ?? fromId ?? primary;
}
