import {
  appsPlatformDisplayName,
  appsPlatformLogoId,
  ridePlatformToSlug,
  sortPlatformSlugs,
  type AppsPlatformSlug,
} from "@/features/apps/lib/apps-platform";
import type { PlatformLogoId } from "@/shared/ui/platform-logo";
import { RidePlatform } from "@prisma/client";

/** Row key: single-platform suffix or `multi` when several platforms have trips. */
export type PlatformKey = string;

export type ShiftPlatformFilter = "all" | RidePlatform;

export function isMultiPlatform(key: PlatformKey): boolean {
  return key === "both" || key === "multi";
}

export function platformKeyFromSet(platforms: Set<RidePlatform>): PlatformKey {
  const slugs = sortPlatformSlugs([...platforms].map(ridePlatformToSlug));
  if (slugs.length === 0) return "uber-only";
  if (slugs.length === 1) {
    const s = slugs[0]!;
    if (s === "freenow") return "freenow";
    if (s === "uber") return "uber-only";
    return `${s}-only`;
  }
  return "multi";
}

export function platformSlugsFromRow(
  plataformas: PlatformKey,
  desglose?: { platform: string }[],
): AppsPlatformSlug[] {
  if (isMultiPlatform(plataformas) && desglose?.length) {
    return sortPlatformSlugs(desglose.map((d) => displayNameToSlug(d.platform)));
  }
  if (plataformas === "both") return ["uber", "freenow"];
  if (plataformas === "freenow") return ["freenow"];
  if (plataformas === "uber-only") return ["uber"];
  if (plataformas.endsWith("-only")) {
    return [plataformas.replace(/-only$/, "") as AppsPlatformSlug];
  }
  return [];
}

/** Display name for a single-platform row key (`uber-only`, `bolt-only`, …). */
export function shiftPlatformNameFromKey(key: PlatformKey): string {
  if (key === "freenow") return "FreeNow";
  if (key === "uber-only") return "Uber";
  if (key.endsWith("-only")) {
    return appsPlatformDisplayName(key.replace(/-only$/, ""));
  }
  return "Uber";
}

export function displayNameToSlug(name: string): AppsPlatformSlug {
  const lower = name.trim().toLowerCase();
  if (lower === "freenow") return "freenow";
  if (lower === "uber") return "uber";
  if (lower === "bolt") return "bolt";
  if (lower === "cabify") return "cabify";
  return lower.replace(/\s+/g, "") as AppsPlatformSlug;
}

export function shiftPlatformDisplayName(platform: RidePlatform): string {
  return appsPlatformDisplayName(ridePlatformToSlug(platform));
}

export function platformSummaryLabel(plataformas: PlatformKey, desglose?: { platform: string }[]): string {
  if (isMultiPlatform(plataformas) && desglose?.length) {
    return desglose.map((d) => d.platform).join(" + ");
  }
  const slugs = platformSlugsFromRow(plataformas, desglose);
  return slugs.map((s) => appsPlatformDisplayName(s)).join(" + ");
}

export function shiftPlatformFilterToQuery(filter: ShiftPlatformFilter): RidePlatform | undefined {
  if (filter === "all") return undefined;
  return filter;
}

export function ridePlatformFromFilter(filter: ShiftPlatformFilter): RidePlatform | null {
  if (filter === "all") return null;
  return filter;
}

export function logoIdsForPlatformKey(
  plataformas: PlatformKey,
  desglose?: { platform: string }[],
): PlatformLogoId[] {
  return platformSlugsFromRow(plataformas, desglose).map((s) => appsPlatformLogoId(s));
}

export function displayNameToRidePlatform(name: string): RidePlatform | null {
  const slug = displayNameToSlug(name);
  const upper = slug.toUpperCase();
  if (upper in RidePlatform) return upper as RidePlatform;
  return null;
}

export function collectPlatformFiltersFromRows(
  rows: { plataformas: PlatformKey; desglose?: { platform: string }[] }[],
): RidePlatform[] {
  const set = new Set<RidePlatform>();
  for (const row of rows) {
    if (isMultiPlatform(row.plataformas) && row.desglose?.length) {
      for (const d of row.desglose) {
        const p = displayNameToRidePlatform(d.platform);
        if (p) set.add(p);
      }
    } else {
      for (const slug of platformSlugsFromRow(row.plataformas, row.desglose)) {
        const upper = slug.toUpperCase();
        if (upper in RidePlatform) set.add(upper as RidePlatform);
      }
    }
  }
  const slugs = sortPlatformSlugs([...set].map(ridePlatformToSlug));
  return slugs.map((s) => s.toUpperCase() as RidePlatform);
}
