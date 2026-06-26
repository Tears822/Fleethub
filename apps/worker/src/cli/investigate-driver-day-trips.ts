#!/usr/bin/env node
/**
 * Compare DB trips vs FreeNow API for one driver on one day.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/investigate-driver-day-trips.ts <externalDriverId|name> <YYYY-MM-DD> [tenantSlug]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { RidePlatform, withoutTenant, withTenant } from "@fleethub/db";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { buildFreenowTripsByDriver } from "../lib/freenow-bookings.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";
import { freenowEnvReady } from "../lib/freenow-env.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const needle = process.argv[2]?.trim();
const dayStr = process.argv[3]?.trim();
const tenantSlug = process.argv[4]?.trim();

if (!needle || !dayStr) {
  console.error(
    "Usage: investigate-driver-day-trips.ts <externalDriverId|name> <YYYY-MM-DD> [tenantSlug]",
  );
  process.exit(1);
}

const dayStart = new Date(`${dayStr}T00:00:00.000Z`);
const dayEnd = new Date(`${dayStr}T23:59:59.999Z`);

async function main() {
  const drivers = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: {
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
        OR: [
          { fullName: { contains: needle, mode: "insensitive" } },
          {
            driverPlatformAccounts: {
              some: {
                platform: RidePlatform.FREENOW,
                externalDriverId: needle,
              },
            },
          },
        ],
      },
      include: {
        tenant: { select: { slug: true, name: true } },
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { platform: RidePlatform.FREENOW },
          select: { id: true, externalDriverId: true, isActive: true, metadata: true },
        },
      },
    }),
  );

  if (drivers.length === 0) {
    console.log("No driver found for:", needle);
    process.exit(1);
  }

  for (const d of drivers) {
    const fn = d.driverPlatformAccounts[0];
    const extId = fn?.externalDriverId?.trim() ?? "";
    console.log("\n===", d.fullName, "| tenant:", d.tenant.slug, "| company:", d.company.legalName);
    console.log("driverId:", d.id);
    console.log("FreeNow externalDriverId:", extId, fn?.isActive ? "(active)" : "(inactive)");

    const dbTrips = await withTenant(d.tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: d.tenantId,
          driverId: d.id,
          platform: RidePlatform.FREENOW,
          startedAt: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          externalTripId: true,
          startedAt: true,
          endedAt: true,
          grossAmountCents: true,
          netAmountCents: true,
          liquidationStatus: true,
        },
      }),
    );

    console.log("\nDB trips on", dayStr + ":", dbTrips.length);
    for (const t of dbTrips) {
      console.log(
        " ",
        t.startedAt.toISOString(),
        "ext:",
        t.externalTripId,
        "gross:",
        t.grossAmountCents,
        "net:",
        t.netAmountCents,
        t.liquidationStatus,
      );
    }

    if (!fn || !extId || !freenowEnvReady().ok) continue;

    const companyId = await resolveFreenowPublicCompanyIdForDriver(
      d.tenantId,
      d.id,
      fn.metadata,
    );
    console.log("\nFreeNow company:", companyId);

    const from = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000);
    const bookings = await listFreenowCompanyBookings({ publicCompanyId: companyId, from, to });
    if (!bookings.ok) {
      console.log("API error:", bookings.message);
      continue;
    }

    const byDriver = buildFreenowTripsByDriver(bookings.bookings);
    const apiTrips = (byDriver.get(extId) ?? []).filter(
      (t) => t.startedAt >= dayStart && t.startedAt <= dayEnd,
    );

    console.log("\nFreeNow API trips on", dayStr + ":", apiTrips.length);
    for (const t of apiTrips) {
      console.log(
        " ",
        t.startedAt.toISOString(),
        "ext:",
        t.externalTripId,
        "gross:",
        t.grossAmountCents,
      );
    }

    const dbExt = new Set(dbTrips.map((t) => t.externalTripId));
    const apiExt = new Set(apiTrips.map((t) => t.externalTripId));
    const missingInDb = [...apiExt].filter((id) => !dbExt.has(id));
    const extraInDb = [...dbExt].filter((id) => !apiExt.has(id));
    if (missingInDb.length) {
      console.log("\nMISSING in DB:", missingInDb);
    }
    if (extraInDb.length) {
      console.log("\nExtra in DB (not in API day window):", extraInDb);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
