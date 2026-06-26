#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { withoutTenant, withTenant, RidePlatform } from "@fleethub/db";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { buildFreenowTripsByDriver } from "../lib/freenow-bookings.js";
import { freenowEnvReady } from "../lib/freenow-env.js";
import { resolveTenantFreenowPublicCompanyIds } from "../lib/freenow-company-map.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const DRIVER_ID = "5c141e50-4fb2-4768-a9a1-47d7b802f91c";
const FN_DRIVER = "GYYTSMBWG4ZDG";
const FROM = "2026-06-01";
const TO = "2026-06-26";

async function main() {
  const driver = await withoutTenant((tx) =>
    tx.driver.findUnique({
      where: { id: DRIVER_ID },
      include: {
        tenant: { select: { slug: true, settings: true } },
        company: { select: { legalName: true } },
        driverPlatformAccounts: true,
      },
    }),
  );
  if (!driver) throw new Error("driver not found");
  console.log("Driver:", driver.fullName, driver.tenant.slug, driver.company.legalName);
  console.log("Platform accounts:", JSON.stringify(driver.driverPlatformAccounts, null, 2));

  const from = new Date(`${FROM}T00:00:00.000Z`);
  const to = new Date(`${TO}T23:59:59.999Z`);

  const dbTrips = await withTenant(driver.tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        driverId: DRIVER_ID,
        platform: RidePlatform.FREENOW,
        startedAt: { gte: from, lte: to },
      },
      orderBy: { startedAt: "asc" },
      select: {
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        liquidationStatus: true,
      },
    }),
  );
  console.log("\nDB FreeNow trips", FROM, "to", TO + ":", dbTrips.length);
  const byDay = new Map<string, number>();
  for (const t of dbTrips) {
    const d = t.startedAt.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  console.log("By day:", Object.fromEntries([...byDay.entries()].sort()));

  if (!freenowEnvReady().ok) {
    console.log("FreeNow env not ready");
    return;
  }

  const companyIds = await resolveTenantFreenowPublicCompanyIds(driver.tenantId);
  console.log("\nTenant FN company IDs:", companyIds);

  const apiByDay = new Map<string, string[]>();
  let apiTotal = 0;
  for (const companyId of companyIds) {
    const res = await listFreenowCompanyBookings({ publicCompanyId: companyId, from, to });
    if (!res.ok) {
      console.log("API fail", companyId, res.message);
      continue;
    }
    const byDriver = buildFreenowTripsByDriver(res.bookings);
    const trips = byDriver.get(FN_DRIVER) ?? [];
    console.log(`API ${companyId} trips for driver ${FN_DRIVER}:`, trips.length);
    apiTotal += trips.length;
    for (const t of trips) {
      const d = t.startedAt.toISOString().slice(0, 10);
      const list = apiByDay.get(d) ?? [];
      list.push(`${t.startedAt.toISOString().slice(11, 19)} ${t.externalTripId} ${t.grossAmountCents}c`);
      apiByDay.set(d, list);
    }
  }
  console.log("\nAPI total for driver:", apiTotal);
  for (const [day, list] of [...apiByDay.entries()].sort()) {
    console.log(`\n${day} (${list.length}):`);
    for (const line of list) console.log(" ", line);
  }

  const dbJun13 = dbTrips.filter((t) => t.startedAt.toISOString().startsWith("2026-06-13"));
  const apiJun13 = apiByDay.get("2026-06-13") ?? [];
  console.log("\n=== Jun 13 summary ===");
  console.log("DB:", dbJun13.length, "API:", apiJun13.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
