import type { PlatformLogoId } from "@/shared/ui/platform-logo";
import { RidePlatform } from "@prisma/client";

/** Tab slug (lowercase), aligned with `RidePlatform` when present in BD. */
export type AppsPlatformSlug = string;

const DISPLAY_NAMES: Record<string, string> = {
  uber: "Uber",
  freenow: "FreeNow",
  bolt: "Bolt",
  cabify: "Cabify",
};

/** Preferred tab order; unknown platforms sort alphabetically after these. */
const TAB_ORDER: string[] = [
  RidePlatform.UBER.toLowerCase(),
  RidePlatform.FREENOW.toLowerCase(),
  RidePlatform.BOLT.toLowerCase(),
  RidePlatform.CABIFY.toLowerCase(),
];

export function ridePlatformToSlug(platform: RidePlatform): AppsPlatformSlug {
  return platform.toLowerCase();
}

export function appsPlatformDisplayName(slug: AppsPlatformSlug): string {
  return DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function appsPlatformLogoId(slug: AppsPlatformSlug): PlatformLogoId {
  if (slug === "uber" || slug === "freenow" || slug === "bolt" || slug === "cabify") {
    return slug;
  }
  return "bolt";
}

export function sortPlatformSlugs(slugs: AppsPlatformSlug[]): AppsPlatformSlug[] {
  const set = new Set(slugs);
  const ordered: AppsPlatformSlug[] = [];
  for (const s of TAB_ORDER) {
    if (set.has(s)) ordered.push(s);
  }
  const rest = [...set].filter((s) => !TAB_ORDER.includes(s)).sort((a, b) => a.localeCompare(b, "es"));
  return [...ordered, ...rest];
}
