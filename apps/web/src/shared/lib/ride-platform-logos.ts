export type RidePlatformCode = "UBER" | "FREENOW" | "BOLT" | "CABIFY";

export type PlatformLogoId = "uber" | "freenow" | "bolt" | "cabify";

const RIDE_TO_LOGO: Record<RidePlatformCode, PlatformLogoId> = {
  UBER: "uber",
  FREENOW: "freenow",
  BOLT: "bolt",
  CABIFY: "cabify",
};

const LOGO_ORDER: PlatformLogoId[] = ["uber", "freenow", "bolt", "cabify"];

/** Stable icon order for tables (Uber → FreeNow → Bolt → Cabify). */
export function ridePlatformsToLogoIds(
  platforms: readonly RidePlatformCode[] | undefined,
): PlatformLogoId[] {
  if (!platforms?.length) return [];
  const seen = new Set<PlatformLogoId>();
  for (const code of platforms) {
    const id = RIDE_TO_LOGO[code];
    if (id) seen.add(id);
  }
  return LOGO_ORDER.filter((id) => seen.has(id));
}
