import {
  appsPlatformDisplayName,
  ridePlatformToSlug,
  sortPlatformSlugs,
  type AppsPlatformSlug,
} from "@/features/apps/lib/apps-platform";
import type { BillingTableRow } from "@/features/billing/lib/billing-types";
import { RidePlatform } from "@prisma/client";

export type BillingPlatformFilter = "all" | RidePlatform;

export function billingPlatformFilterLabel(filter: BillingPlatformFilter): string {
  if (filter === "all") return "Todas las plataformas";
  return appsPlatformDisplayName(ridePlatformToSlug(filter));
}

export function collectBillingPlatformFilters(
  driverRows: BillingTableRow[],
  globalRows: BillingTableRow[],
): RidePlatform[] {
  const set = new Set<RidePlatform>();
  for (const row of driverRows) {
    for (const slug of row.platformSlugs ?? []) {
      const upper = slug.toUpperCase();
      if (upper in RidePlatform) set.add(upper as RidePlatform);
    }
  }
  for (const row of globalRows) {
    if (row.rowKey.startsWith("platform-")) {
      const p = row.rowKey.slice("platform-".length) as RidePlatform;
      if (p in RidePlatform) set.add(p);
    }
  }
  const slugs = sortPlatformSlugs([...set].map(ridePlatformToSlug));
  return slugs.map((s) => s.toUpperCase() as RidePlatform);
}

export function rowMatchesBillingPlatform(
  row: BillingTableRow,
  filter: BillingPlatformFilter,
): boolean {
  if (filter === "all") return true;
  if (row.rowKey === "total") return false;
  if (row.rowKey.startsWith("platform-")) {
    return row.rowKey === `platform-${filter}`;
  }
  const slug = ridePlatformToSlug(filter);
  return (row.platformSlugs ?? []).includes(slug);
}

export function platformSlugsFromAgg(platforms: Set<RidePlatform>): AppsPlatformSlug[] {
  return sortPlatformSlugs([...platforms].map(ridePlatformToSlug));
}
