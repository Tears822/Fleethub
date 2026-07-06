import { RidePlatform, withTenant } from "@fleethub/db";
import {
  resolveTenantUberOrgIds,
  uberSyncOrgIdFromMetadata,
  type UberOrgRef,
} from "./uber-tenant-group-orgs.js";

type DpaOrgHint = { metadata: unknown };

/** Subset of Uber orgs to prefetch — avoids scanning all umbrella orgs on every poll. */
export async function resolveUberPrefetchOrgs(
  tenantId: string,
  options?: {
    /** Single-driver / liquidation: only that driver's org (+ primary fallback). */
    narrowDpas?: DpaOrgHint[];
    /** Poll: union of orgs linked to active Uber drivers. */
    pollMode?: boolean;
  },
): Promise<UberOrgRef[]> {
  const orgs = await resolveTenantUberOrgIds(tenantId);
  if (!orgs.ok || orgs.data.length === 0) return [];
  if (orgs.data.length === 1) return orgs.data;

  const primary = orgs.data[0]!;

  if (options?.narrowDpas?.length) {
    const preferredIds = new Set<string>();
    for (const dpa of options.narrowDpas) {
      const id = uberSyncOrgIdFromMetadata(dpa.metadata);
      if (id) preferredIds.add(id);
    }
    if (preferredIds.size === 0) return [primary];
    const picked = orgs.data.filter((o) => preferredIds.has(o.orgId));
    return picked.length > 0 ? picked : [primary];
  }

  if (options?.pollMode) {
    const dpas = await withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId, platform: RidePlatform.UBER, isActive: true },
        select: { metadata: true },
      }),
    );
    const linkedIds = new Set<string>();
    for (const dpa of dpas) {
      const id = uberSyncOrgIdFromMetadata(dpa.metadata);
      if (id) linkedIds.add(id);
    }
    if (linkedIds.size === 0) return [primary];
    const picked = orgs.data.filter((o) => linkedIds.has(o.orgId));
    return picked.length > 0 ? picked : [primary];
  }

  return orgs.data;
}
