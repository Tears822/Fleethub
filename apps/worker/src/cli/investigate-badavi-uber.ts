#!/usr/bin/env node
/**
 * Compare BADAVI Uber drivers: FleetHub DB vs Uber Trip Activity report.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/investigate-badavi-uber.ts [days=7]
 */
import "../load-env.js";
import { RidePlatform, withoutTenant, withTenant } from "@fleethub/db";
import { resolveTenantUberOrgId } from "../lib/tenant-platform-config.js";
import {
  listAllUberDrivers,
  resolveUberOrgId,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { fetchUberTripActivityRows } from "../lib/uber-reports.js";
import { pickColumn } from "../lib/uber-csv-columns.js";

const TENANT_SLUG = "cosculluela";
const COMPANY_NEEDLE = "BADAVI";
const days = Math.min(28, Math.max(1, Number(process.argv[2] ?? 7) || 7));

function driverUuidFromRow(row: Record<string, string>): string {
  return (
    pickColumn(row, [
      "Driver UUID",
      "driver_uuid",
      "UUID del conductor",
      "UUID de conductor",
    ]) ?? ""
  ).trim();
}

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const company = await withTenant(tenant.id, (tx) =>
    tx.company.findFirst({
      where: { tenantId: tenant.id, legalName: { contains: COMPANY_NEEDLE, mode: "insensitive" } },
      select: { id: true, legalName: true },
    }),
  );
  if (!company) throw new Error("BADAVI company not found");

  const drivers = await withTenant(tenant.id, (tx) =>
    tx.driver.findMany({
      where: { companyId: company.id, isActive: true },
      include: {
        driverPlatformAccounts: { where: { platform: RidePlatform.UBER } },
      },
      orderBy: { fullName: "asc" },
    }),
  );

  const orgOverride = await resolveTenantUberOrgId(tenant.id);
  const org = await resolveUberOrgId(orgOverride);
  if (!org.ok) throw new Error(org.message);

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  console.log(`=== ${company.legalName} Uber (${days}d window) ===`);
  console.log("Org:", org.data.slice(0, 20) + "…");
  console.log("Window:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10));

  const uberDrivers = await listAllUberDrivers(org.data);
  if (!uberDrivers.ok) throw new Error(uberDrivers.message);
  const uberByUuid = new Map<string, string>();
  for (const row of uberDrivers.data) {
    const id = uberDriverExternalId(row);
    const name = uberDriverDisplayName(row);
    if (id) uberByUuid.set(id.toLowerCase(), name);
  }
  console.log("\nUber portal drivers in org:", uberByUuid.size);

  const activity = await fetchUberTripActivityRows(org.data, from, to);
  if (!activity.ok) throw new Error(activity.message);

  const apiTripsByDriver = new Map<string, number>();
  for (const row of activity.data) {
    const uuid = driverUuidFromRow(row).toLowerCase();
    if (!uuid) continue;
    apiTripsByDriver.set(uuid, (apiTripsByDriver.get(uuid) ?? 0) + 1);
  }
  console.log("Trip Activity report rows:", activity.data.length);
  console.log("Drivers with trips in report:", apiTripsByDriver.size);

  console.log("\n--- Per driver (DB vs API) ---");
  let linkedNoTripsApi = 0;
  let linkedNoTripsDb = 0;
  let unlinkedWithApiTrips = 0;

  for (const d of drivers) {
    const dpa = d.driverPlatformAccounts[0];
    const ext = dpa?.externalDriverId?.trim().toLowerCase() ?? "";
    const dbCount = await withTenant(tenant.id, (tx) =>
      tx.trip.count({
        where: {
          driverId: d.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: from, lte: to },
        },
      }),
    );
    const apiCount = ext ? (apiTripsByDriver.get(ext) ?? 0) : 0;
    const inPortal = ext ? uberByUuid.has(ext) : false;

    if (apiCount > 0 || dbCount > 0 || dpa?.isActive) {
      const flag =
        dpa?.isActive && apiCount > 0 && dbCount === 0
          ? " ← MISSING IN DB"
          : !dpa?.isActive && apiCount > 0
            ? " ← NOT LINKED"
            : "";
      console.log(
        `${d.fullName.slice(0, 32).padEnd(32)} | link: ${ext ? ext.slice(0, 8) + "…" : "NO"} | portal: ${inPortal ? "yes" : "no"} | API: ${apiCount} | DB: ${dbCount}${flag}`,
      );
    }

    if (dpa?.isActive && ext && apiCount === 0) linkedNoTripsApi++;
    if (dpa?.isActive && ext && dbCount === 0) linkedNoTripsDb++;
    if (!dpa?.isActive && apiCount > 0) unlinkedWithApiTrips++;
  }

  // API drivers with trips not in our BADAVI driver list
  const linkedUuids = new Set(
    drivers
      .flatMap((d) => d.driverPlatformAccounts.map((a) => a.externalDriverId?.trim().toLowerCase()))
      .filter(Boolean),
  );
  const orphanApi: string[] = [];
  for (const [uuid, count] of apiTripsByDriver) {
    if (!linkedUuids.has(uuid) && count > 0) {
      orphanApi.push(`${uberByUuid.get(uuid) ?? uuid.slice(0, 8)} (${count} trips, uuid ${uuid.slice(0, 8)}…)`);
    }
  }

  console.log("\n--- Summary ---");
  console.log("BADAVI active drivers:", drivers.length);
  console.log("With Uber DPA linked:", drivers.filter((d) => d.driverPlatformAccounts.some((a) => a.isActive)).length);
  console.log("Linked, 0 trips in API window:", linkedNoTripsApi);
  console.log("Linked, 0 trips in DB (window):", linkedNoTripsDb);
  console.log("Unlinked but API has trips:", unlinkedWithApiTrips);
  if (orphanApi.length) {
    console.log("\nTrip Activity for drivers not linked in FleetHub:");
    for (const line of orphanApi.slice(0, 20)) console.log(" ", line);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
