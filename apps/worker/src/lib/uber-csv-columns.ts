export type UberCsvRow = Record<string, string>;

export function normalizeHeaderKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickColumn(row: UberCsvRow, names: string[]): string {
  const keys = Object.keys(row);
  const normalizedNames = names.map(normalizeHeaderKey);

  for (const name of names) {
    const exact = row[name];
    if (exact?.trim()) return exact.trim();
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found]?.trim()) return row[found]!.trim();
  }

  for (const key of keys) {
    const nk = normalizeHeaderKey(key);
    for (const want of normalizedNames) {
      if (nk === want || nk.includes(want) || want.includes(nk)) {
        const v = row[key]?.trim();
        if (v) return v;
      }
    }
  }

  return "";
}

/** Exact header match only — avoids Precio column matching Taxímetro headers. */
export function pickColumnExact(row: UberCsvRow, names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = row[name];
    if (exact?.trim()) return exact.trim();
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found]?.trim()) return row[found]!.trim();
  }
  return "";
}

/** First column whose normalized header matches all include tokens (and none of exclude). */
export function pickColumnMatching(
  row: UberCsvRow,
  include: string[],
  exclude: string[] = [],
): string {
  const inc = include.map(normalizeHeaderKey);
  const exc = exclude.map(normalizeHeaderKey);

  for (const key of Object.keys(row)) {
    const nk = normalizeHeaderKey(key);
    if (exc.some((token) => nk.includes(token))) continue;
    if (inc.every((token) => nk.includes(token))) {
      const v = row[key]?.trim();
      if (v) return v;
    }
  }

  return "";
}

export function parseEuroAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (!s) return null;
  const normalized = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(Math.abs(n) * 100));
}

/** Parse Uber CSV datetimes (ISO, Spanish locale, CEST/CET suffix). */
export function parseUberDateTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withoutTzName = s.replace(/\s+(CET|CEST|GMT|UTC|[A-ZÁÉÍÓÚ]{3,5})\s*$/i, "").trim();
  const ms = Date.parse(withoutTzName);
  if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  const ms2 = Date.parse(s);
  if (!Number.isNaN(ms2)) return new Date(ms2).toISOString();
  return null;
}

export function parseSignedEuroAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (!s) return null;
  const negative = s.includes("-") || s.startsWith("(");
  const normalized = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  const cents = BigInt(Math.round(Math.abs(n) * 100));
  return negative ? -cents : cents;
}

export function rowHasTripUuidColumn(row: UberCsvRow): boolean {
  return Boolean(
    pickColumn(row, [
      "Trip UUID",
      "trip_uuid",
      "UUID del viaje",
      "UUID de viaje",
      "Trip ID",
    ]),
  );
}

export function paymentsDriverReportIsTripLevel(rows: UberCsvRow[]): boolean {
  return rows.some((row) => rowHasTripUuidColumn(row));
}
