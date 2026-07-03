import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import {
  listAllUberDrivers,
  listUberOrganizations,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { defaultUberOrgForTenantSlug } from "../lib/uber-tenant-org-map.js";

async function main() {
  const namePart = process.argv[2]?.trim() ?? "Rakib";

  const drivers = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { fullName: { contains: namePart, mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        isActive: true,
        tenant: { select: { slug: true, name: true } },
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { platform: RidePlatform.UBER },
          select: {
            id: true,
            externalDriverId: true,
            isActive: true,
            metadata: true,
            _count: { select: { trips: true } },
          },
        },
        _count: { select: { trips: true } },
      },
    }),
  );

  console.log("=== FleetHub drivers matching", namePart, "===");
  for (const d of drivers) {
    console.log({
      tenant: d.tenant.slug,
      company: d.company.legalName,
      name: d.fullName,
      active: d.isActive,
      trips: d._count.trips,
      uber: d.driverPlatformAccounts.map((a) => ({
        ext: a.externalDriverId?.slice(0, 12),
        active: a.isActive,
        trips: a._count.trips,
        org: (a.metadata as { uberSyncOrgName?: string } | null)?.uberSyncOrgName,
      })),
    });

    const tenant = await withoutTenant((tx) =>
      tx.tenant.findUnique({ where: { slug: d.tenant.slug }, select: { id: true } }),
    );
    if (!tenant) continue;
    const uberTrips = await withTenant(tenant.id, (tx) =>
      tx.trip.count({
        where: {
          driverId: d.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: new Date("2026-06-01") },
        },
      }),
    );
    console.log("  uber trips since Jun 2026:", uberTrips);
  }

  console.log("\n=== Uber API orgs ===");
  const orgs = await listUberOrganizations();
  if (!orgs.ok) {
    console.error(orgs.message);
    return;
  }
  for (const org of orgs.data) {
    console.log("-", org.name, org.id?.slice(0, 20) + "...");
  }

  const trevinoOrg = defaultUberOrgForTenantSlug("trevino");
  console.log("\n=== Trevino expected org ===", trevinoOrg?.orgName);

  for (const org of orgs.data) {
    const name = (org.name ?? "").toLowerCase();
    if (!name.includes("taxi") && !name.includes("business")) continue;
    const listed = await listAllUberDrivers(org.id!);
    if (!listed.ok) {
      console.log("FAIL list drivers", org.name, listed.message);
      continue;
    }
    const hits = listed.data.filter((d) =>
      uberDriverDisplayName(d).toLowerCase().includes(namePart.toLowerCase()),
    );
    if (hits.length === 0) continue;
    console.log(`\n=== Uber drivers in org "${org.name}" matching ${namePart} ===`);
    for (const h of hits) {
      console.log({
        uuid: uberDriverExternalId(h),
        name: uberDriverDisplayName(h),
        email: (h as { email?: string }).email,
        status: (h as { status?: string }).status,
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
