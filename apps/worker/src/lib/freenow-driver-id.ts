/** Optional legacy int64 `driverId` for older OpenAPI builds. Live API uses public ids in the path only. */

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

let mapCache: Record<string, number> | null = null;

function loadMap(): Record<string, number> {
  if (mapCache) return mapCache;
  mapCache = {};
  const raw = pick("FREENOW_DRIVER_ID_MAP");
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
 * Resolve numeric driverId for `publicDriverId` (e.g. GYZDOMBRHEZDQ).
 * `getCompanyDriversPaginated` returns `content[].id` (public string) + `name`.
 * Numeric `driverId` query params are deprecated; only set `FREENOW_DRIVER_ID_MAP` if
 * FreeNow ops still asks for them on your account.
 */
export function resolveFreenowNumericDriverId(publicDriverId: string): number | undefined {
  const fromMap = loadMap()[publicDriverId];
  if (fromMap != null) return fromMap;

  const defaultPublic = pick("FREENOW_PUBLIC_DRIVER_ID");
  const defaultNumeric = pick("FREENOW_DRIVER_ID");
  if (defaultNumeric && (!defaultPublic || defaultPublic === publicDriverId)) {
    const n = Number(defaultNumeric);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
