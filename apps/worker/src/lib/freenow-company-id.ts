/** Optional legacy int64 `companyId`. Live Meta-Account API uses public company id in the path. */

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

let mapCache: Record<string, number> | null = null;

function loadMap(): Record<string, number> {
  if (mapCache) return mapCache;
  mapCache = {};
  const raw = pick("FREENOW_COMPANY_ID_MAP");
  if (!raw) return mapCache;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) mapCache[k] = n;
    }
  } catch {
    mapCache = {};
  }
  return mapCache;
}

/**
 * Resolve numeric companyId for `publicCompanyId` (e.g. GEYTMOBQGE).
 * Set `FREENOW_COMPANY_ID_MAP='{"GEYTMOBQGE":12345}'` from FreeNow ops / doc.
 */
export function resolveFreenowNumericCompanyId(publicCompanyId: string): number | undefined {
  const fromMap = loadMap()[publicCompanyId];
  if (fromMap != null) return fromMap;

  const defaultPublic = pick("FREENOW_PUBLIC_COMPANY_ID");
  const defaultNumeric = pick("FREENOW_COMPANY_ID");
  if (defaultNumeric && (!defaultPublic || defaultPublic === publicCompanyId)) {
    const n = Number(defaultNumeric);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
