/**
 * Inspect stale / inactive Uber platform links for group tenants.
 */
import "../load-env.js";
import { withoutTenant, RidePlatform } from "@fleethub/db";
import {
  listAllUberDrivers,
  listUberOrganizations,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";

async function cosculluelaGroupDriverMap(): Promise<Map<string, { org: string; name: string }>> {
  const map = new Map<string, { org: string; name: string }>();
  const orgs = await listUberOrganizations();
  if (!orgs.ok) return map;
  const blocked = ["tradetaxi", "taxi business"];
  for (const org of orgs.data) {
    const name = (org.name ?? "").toLowerCase();
    if (blocked.some((b) => name.includes(b))) continue;
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const d of listed.data) {
      const id = uberDriverExternalId(d);
      if (id) map.set(id.toLowerCase(), { org: org.name ?? "?", name: uberDriverDisplayName(d) });
    }
  }
  return map;
}

async function trevinoDriverMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const org = await resolveUberOrgForTenantSlug("trevino");
  if (!org.ok) return map;
  const listed = await listAllUberDrivers(org.data.orgId);
  if (!listed.ok) return map;
  for (const d of listed.data) {
    const id = uberDriverExternalId(d);
    if (id) map.set(id.toLowerCase(), uberDriverDisplayName(d));
  }
  return map;
}

async function inspect(slug: "cosculluela" | "trevino") {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) throw new Error(`Tenant ${slug} not found`);

  const apiMap =
    slug === "cosculluela" ? await cosculluelaGroupDriverMap() : await trevinoDriverMap();

  const accounts = await withoutTenant(
    (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId: tenant.id, platform: RidePlatform.UBER },
        select: {
          id: true,
          externalDriverId: true,
          isActive: true,
          metadata: true,
          driver: {
            select: {
              id: true,
              fullName: true,
              email: true,
              isActive: true,
              company: { select: { legalName: true } },
            },
          },
        },
        orderBy: { driver: { fullName: "asc" } },
      }),
    undefined,
    tenant.id,
  );

  console.log(`\n=== ${slug} (${accounts.length} uber DPA rows, API ${apiMap.size} drivers) ===`);
  for (const a of accounts) {
    const ext = a.externalDriverId.trim().toLowerCase();
    const hit = apiMap.get(ext);
    console.log(
      JSON.stringify({
        driver: a.driver.fullName,
        company: a.driver.company.legalName,
        email: a.driver.email,
        driverActive: a.driver.isActive,
        dpaActive: a.isActive,
        uuid: a.externalDriverId,
        inApi: !!hit,
        apiOrg: slug === "cosculluela" && hit ? (hit as { org: string }).org : undefined,
        apiName: hit ? (typeof hit === "string" ? hit : hit.name) : undefined,
      }),
    );
  }
}

async function main() {
  await inspect("cosculluela");
  await inspect("trevino");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
