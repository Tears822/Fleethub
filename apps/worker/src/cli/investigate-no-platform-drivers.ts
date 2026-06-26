/**
 * Investigate drivers with no active platform link: DB source + live API match.
 * Does NOT delete or merge. YOUSEFF/YOUSSEF treated as separate people.
 *
 * Usage:
 *   npx tsx src/cli/run-with-worker-uber-env.ts src/cli/investigate-no-platform-drivers.ts [slug]
 */
import "../load-env.js";
import { withoutTenant, RidePlatform } from "@fleethub/db";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
  listFreenowLinkedCompanies,
} from "../lib/freenow-client.js";
import {
  listAllUberDrivers,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { resolveTenantFreenowPublicCompanyId } from "../lib/tenant-platform-config.js";

const SLUG = process.argv[2]?.trim() || "trevino";

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared >= Math.max(2, Math.min(ta.size, tb.size) - 1);
}

function dpaSource(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  return String(m.source ?? m.connectionSource ?? "").trim();
}

function fnCompanyFromMeta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { freenowPublicCompanyId?: unknown }).freenowPublicCompanyId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type ApiHit = { platform: "UBER" | "FREENOW"; id: string; name: string; org?: string };

async function fetchUberHits(slug: string): Promise<Map<string, ApiHit[]>> {
  const byName = new Map<string, ApiHit[]>();
  const org = await resolveUberOrgForTenantSlug(slug);
  if (!org.ok) return byName;
  const listed = await listAllUberDrivers(org.data.orgId);
  if (!listed.ok) return byName;
  for (const d of listed.data) {
    const id = uberDriverExternalId(d);
    const name = uberDriverDisplayName(d);
    if (!id || !name) continue;
    const hit: ApiHit = { platform: "UBER", id, name, org: org.data.orgName };
    const key = normalizeName(name);
    const list = byName.get(key) ?? [];
    list.push(hit);
    byName.set(key, list);
  }
  return byName;
}

async function fetchFreenowHits(tenantId: string, slug: string): Promise<Map<string, ApiHit[]>> {
  const byName = new Map<string, ApiHit[]>();
  const primaryId = await resolveTenantFreenowPublicCompanyId(tenantId);
  const linked = await listFreenowLinkedCompanies();
  const companyIds = new Set<string>();
  if (primaryId) companyIds.add(primaryId);
  if (linked.ok) {
    for (const c of linked.companies) {
      const id = c.id?.trim();
      if (!id) continue;
      // Treviño: only tenant company; cosculluela may have galera too via settings
      if (slug === "trevino" && primaryId && id !== primaryId) continue;
      if (slug === "trade-taxi-sl" && primaryId && id !== primaryId) continue;
      companyIds.add(id);
    }
  }

  for (const publicCompanyId of companyIds) {
    const drivers = await listAllFreenowCompanyDrivers(publicCompanyId);
    if (!drivers.ok) continue;
    for (const d of drivers.drivers) {
      const name = freenowDriverDisplayName(d);
      const id = freenowPublicDriverId(d);
      if (!name || !id) continue;
      const hit: ApiHit = { platform: "FREENOW", id, name, org: publicCompanyId };
      const key = normalizeName(name);
      const list = byName.get(key) ?? [];
      list.push(hit);
      byName.set(key, list);
    }
  }
  return byName;
}

function findApiMatches(
  fullName: string,
  uberByName: Map<string, ApiHit[]>,
  fnByName: Map<string, ApiHit[]>,
): ApiHit[] {
  const hits: ApiHit[] = [];
  for (const [, list] of uberByName) {
    for (const h of list) {
      if (namesMatch(fullName, h.name)) hits.push(h);
    }
  }
  for (const [, list] of fnByName) {
    for (const h of list) {
      if (namesMatch(fullName, h.name)) hits.push(h);
    }
  }
  return hits;
}

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${SLUG} not found`);

  console.log(`=== Investigate no-platform drivers: ${tenant.slug} ===\n`);

  const [uberByName, fnByName] = await Promise.all([
    fetchUberHits(SLUG),
    fetchFreenowHits(tenant.id, SLUG),
  ]);
  console.log(`Uber API names indexed: ${uberByName.size}`);
  console.log(`FreeNow API names indexed: ${fnByName.size}\n`);

  const drivers = await withoutTenant(
    (tx) =>
      tx.driver.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          email: true,
          dni: true,
          createdAt: true,
          company: { select: { legalName: true } },
          driverPlatformAccounts: {
            select: {
              id: true,
              platform: true,
              isActive: true,
              externalDriverId: true,
              metadata: true,
              createdAt: true,
            },
          },
          _count: { select: { trips: true } },
        },
        orderBy: { fullName: "asc" },
      }),
    undefined,
    tenant.id,
  );

  const noActivePlatform = drivers.filter(
    (d) => !d.driverPlatformAccounts.some((a) => a.isActive),
  );

  console.log(`Total drivers: ${drivers.length}`);
  console.log(`No active platform link: ${noActivePlatform.length}\n`);

  for (const d of noActivePlatform) {
    const apiHits = findApiMatches(d.fullName, uberByName, fnByName);
    const inactiveDpas = d.driverPlatformAccounts.filter((a) => !a.isActive);
    const sources = [
      ...new Set(d.driverPlatformAccounts.map((a) => dpaSource(a.metadata)).filter(Boolean)),
    ];

    console.log("---");
    console.log(`Driver: ${d.fullName}`);
    console.log(`  active=${d.isActive} company=${d.company.legalName} trips=${d._count.trips}`);
    console.log(`  created=${d.createdAt.toISOString()} email=${d.email ?? "—"} dni=${d.dni ?? "—"}`);
    console.log(`  likely DB source: ${sources.length ? sources.join(", ") : "unknown (no dpa metadata)"}`);

    if (inactiveDpas.length === 0) {
      console.log(`  DB platform rows: none`);
    } else {
      console.log(`  DB platform rows (all inactive):`);
      for (const a of inactiveDpas) {
        const fnCo = a.platform === "FREENOW" ? fnCompanyFromMeta(a.metadata) : null;
        console.log(
          `    ${a.platform} ext=${a.externalDriverId.slice(0, 20)}… fnCompany=${fnCo ?? "—"} source=${dpaSource(a.metadata) || "—"} created=${a.createdAt.toISOString()}`,
        );
      }
    }

    if (apiHits.length === 0) {
      console.log(`  LIVE API: NOT FOUND in tenant Uber org or FreeNow company`);
    } else {
      console.log(`  LIVE API matches (${apiHits.length}):`);
      for (const h of apiHits) {
        const inDb = d.driverPlatformAccounts.some(
          (a) =>
            a.platform === h.platform &&
            a.externalDriverId.toLowerCase() === h.id.toLowerCase(),
        );
        console.log(
          `    ${h.platform} ${h.name} id=${h.id.slice(0, 12)}… ${h.org ?? ""} inDb=${inDb}`,
        );
      }
    }
  }

  // Also flag active drivers that HAVE platform in API but missing active DPA
  const activeNoPlatform = noActivePlatform.filter((d) => d.isActive);
  const apiRecoverable = activeNoPlatform.filter((d) => findApiMatches(d.fullName, uberByName, fnByName).length > 0);
  const trueOrphans = activeNoPlatform.filter((d) => findApiMatches(d.fullName, uberByName, fnByName).length === 0);

  console.log("\n=== Summary ===");
  console.log(`Inactive/no-platform (portal clutter): ${noActivePlatform.filter((d) => !d.isActive).length}`);
  console.log(`Active but no platform — recoverable from API: ${apiRecoverable.length}`);
  console.log(`Active but no platform — not in API: ${trueOrphans.length}`);
  if (apiRecoverable.length) {
    console.log("\nRecoverable (need link, not delete):");
    for (const d of apiRecoverable) console.log(`  ${d.fullName}`);
  }
  if (trueOrphans.length) {
    console.log("\nNot in tenant API (safe to review for removal):");
    for (const d of trueOrphans) console.log(`  ${d.fullName}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
