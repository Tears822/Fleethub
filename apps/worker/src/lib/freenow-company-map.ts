import { withTenant } from "@fleethub/db";
import {
  freenowLinkedCompanyName,
  listFreenowLinkedCompanies,
  type FreenowLinkedCompany,
} from "./freenow-client.js";
import { getTenantIntegrationSettings } from "@fleethub/auth";
import { resolveTenantFreenowPublicCompanyId } from "./tenant-platform-config.js";

export type FreenowFleetCompanyMapping = {
  publicCompanyId: string;
  freenowCompanyName: string;
  fleetCompanyId: string;
  fleetLegalName: string;
};

/** Normalize legal names for fuzzy match (BADAVI SL ≈ BADAVI, S.L.). */
export function normalizeCompanyMatchKey(legalName: string): string {
  return legalName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function companiesMatch(freenowName: string, fleetLegalName: string): boolean {
  const a = normalizeCompanyMatchKey(freenowName);
  const b = normalizeCompanyMatchKey(fleetLegalName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6) {
    return a.includes(b) || b.includes(a);
  }
  return false;
}

export async function listAllFreenowLinkedCompanies(): Promise<
  | { ok: true; companies: FreenowLinkedCompany[] }
  | { ok: false; message: string }
> {
  const all: FreenowLinkedCompany[] = [];
  let page = 0;
  let totalPages = 1;
  const pageSize = 25;

  while (page < totalPages) {
    const batch = await listFreenowLinkedCompanies({ page, size: pageSize });
    if (!batch.ok) return batch;
    all.push(...batch.companies);
    const raw = batch.raw as { metadata?: { totalPages?: number } } | undefined;
    totalPages = raw?.metadata?.totalPages ?? page + 1;
    if (batch.companies.length === 0) break;
    page += 1;
  }

  return { ok: true, companies: all };
}

export async function resolveFreenowFleetCompanyMappings(
  tenantId: string,
): Promise<FreenowFleetCompanyMapping[]> {
  const linked = await listAllFreenowLinkedCompanies();
  if (!linked.ok) return [];

  const fleetCompanies = await withTenant(tenantId, (tx) =>
    tx.company.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
  );

  const mappings: FreenowFleetCompanyMapping[] = [];
  const usedFleetIds = new Set<string>();

  for (const fnCompany of linked.companies) {
    const publicCompanyId = fnCompany.id?.trim();
    if (!publicCompanyId) continue;
    const fnName = freenowLinkedCompanyName(fnCompany);

    for (const fleet of fleetCompanies) {
      if (usedFleetIds.has(fleet.id)) continue;
      if (!companiesMatch(fnName, fleet.legalName)) continue;
      mappings.push({
        publicCompanyId,
        freenowCompanyName: fnName,
        fleetCompanyId: fleet.id,
        fleetLegalName: fleet.legalName,
      });
      usedFleetIds.add(fleet.id);
      break;
    }
  }

  return mappings;
}

/** Match a FreeNow umbrella company name to a FleetHub empresa row (no exclusivity). */
export function findFleetCompanyForFreenowName(
  fleetCompanies: { id: string; legalName: string }[],
  freenowName: string,
): { id: string; legalName: string } | null {
  for (const fleet of fleetCompanies) {
    if (companiesMatch(freenowName, fleet.legalName)) return fleet;
  }
  return null;
}

export async function resolveTenantFreenowPublicCompanyIds(tenantId: string): Promise<string[]> {
  const settings = await getTenantIntegrationSettings(tenantId);
  const explicit = settings.freenowPublicCompanyId.trim();

  if (explicit) {
    const ids = new Set<string>([explicit]);
    const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
    for (const m of mappings) ids.add(m.publicCompanyId);
    return [...ids];
  }

  const ids = new Set<string>();
  const primary = await resolveTenantFreenowPublicCompanyId(tenantId);
  if (primary) ids.add(primary);

  const linked = await listAllFreenowLinkedCompanies();
  if (linked.ok) {
    for (const c of linked.companies) {
      if (c.id?.trim()) ids.add(c.id.trim());
    }
  }

  return [...ids];
}

export function freenowPublicCompanyIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).freenowPublicCompanyId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveFreenowPublicCompanyIdForDriver(
  tenantId: string,
  driverId: string,
  dpaMetadata?: unknown,
): Promise<string> {
  const fromMeta = freenowPublicCompanyIdFromMetadata(dpaMetadata);
  if (fromMeta) return fromMeta;

  const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
  if (mappings.length > 0) {
    const driver = await withTenant(tenantId, (tx) =>
      tx.driver.findFirst({
        where: { id: driverId, tenantId },
        select: { companyId: true },
      }),
    );
    if (driver) {
      const match = mappings.find((m) => m.fleetCompanyId === driver.companyId);
      if (match) return match.publicCompanyId;
    }
  }

  return await resolveTenantFreenowPublicCompanyId(tenantId);
}
