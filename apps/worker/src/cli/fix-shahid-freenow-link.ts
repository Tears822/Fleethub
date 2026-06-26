#!/usr/bin/env node
/**
 * Link Muhammad Shahid to FreeNow + report trip gaps.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/fix-shahid-freenow-link.ts [--sync]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { RidePlatform, withoutTenant, withTenant } from "@fleethub/db";
import { linkFreenowDriversForTenant } from "../lib/freenow-link-drivers.js";
import { listFreenowCompanyBookings, buildFreenowTripsByDriver } from "../lib/freenow-bookings.js";
import { resolveTenantFreenowPublicCompanyIds } from "../lib/freenow-company-map.js";
import { processPlatformSyncJob } from "../jobs/process-platform-sync.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const DRIVER_ID = "5c141e50-4fb2-4768-a9a1-47d7b802f91c";
const FN_PUBLIC = "GYYTSMBWG4ZDG";
const FN_COMPANY = "GIYTMMZV";
const FROM = "2026-06-01";
const TO = "2026-06-26";
const runSync = process.argv.includes("--sync");

async function tripGapReport(tenantId: string) {
  const from = new Date(`${FROM}T00:00:00.000Z`);
  const to = new Date(`${TO}T23:59:59.999Z`);
  const dbTrips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        driverId: DRIVER_ID,
        platform: RidePlatform.FREENOW,
        startedAt: { gte: from, lte: to },
      },
      select: { externalTripId: true, startedAt: true },
    }),
  );
  const companyIds = await resolveTenantFreenowPublicCompanyIds(tenantId);
  const apiTrips: { externalTripId: string; startedAt: Date }[] = [];
  for (const cid of companyIds) {
    const res = await listFreenowCompanyBookings({ publicCompanyId: cid, from, to });
    if (!res.ok) continue;
    const byDriver = buildFreenowTripsByDriver(res.bookings);
    for (const t of byDriver.get(FN_PUBLIC) ?? []) {
      apiTrips.push({
        externalTripId: t.externalTripId,
        startedAt: t.startedAt instanceof Date ? t.startedAt : new Date(t.startedAt),
      });
    }
  }
  const dbIds = new Set(dbTrips.map((t) => t.externalTripId));
  const missing = apiTrips.filter((t) => !dbIds.has(t.externalTripId));
  console.log(`\nTrip gap ${FROM}..${TO}: DB ${dbTrips.length}, API ${apiTrips.length}, missing ${missing.length}`);
  const byDay = new Map<string, string[]>();
  for (const t of missing) {
    const d = t.startedAt.toISOString().slice(0, 10);
    const list = byDay.get(d) ?? [];
    list.push(t.externalTripId);
    byDay.set(d, list);
  }
  for (const [day, ids] of [...byDay.entries()].sort()) {
    console.log(`  ${day}: ${ids.length} missing — ${ids.join(", ")}`);
  }
  const jun13Db = dbTrips.filter((t) => t.startedAt.toISOString().startsWith("2026-06-13"));
  const jun13Api = apiTrips.filter((t) => t.startedAt.toISOString().startsWith("2026-06-13"));
  console.log(`\nJun 13: DB ${jun13Db.length}, API ${jun13Api.length}`);
  return missing.length;
}

async function main() {
  const driver = await withoutTenant((tx) =>
    tx.driver.findUnique({
      where: { id: DRIVER_ID },
      include: { tenant: { select: { id: true, slug: true } } },
    }),
  );
  if (!driver) throw new Error("driver not found");

  const fnAccounts = await withoutTenant(
    (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId: driver.tenantId, driverId: DRIVER_ID, platform: RidePlatform.FREENOW },
      }),
    undefined,
    driver.tenantId,
  );

  console.log("Driver:", driver.fullName, driver.tenant.slug);
  console.log("FreeNow accounts before:", fnAccounts.length);

  const linked = await linkFreenowDriversForTenant(driver.tenantId, FN_COMPANY);
  console.log("Link result:", linked);

  let after = fnAccounts;

  if (after.length === 0) {
    console.log("Name link missed — creating DPA manually for", FN_PUBLIC);
    await withTenant(driver.tenantId, (tx) =>
      tx.driverPlatformAccount.create({
        data: {
          tenantId: driver.tenantId,
          driverId: DRIVER_ID,
          platform: RidePlatform.FREENOW,
          externalDriverId: FN_PUBLIC,
          isActive: true,
          metadata: {
            freenowLinkedAt: new Date().toISOString(),
            freenowPublicCompanyId: FN_COMPANY,
          },
        },
      }),
    );
    after = await withoutTenant((tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId: driver.tenantId, driverId: DRIVER_ID, platform: RidePlatform.FREENOW },
      }),
    );
  }

  console.log(
    "FreeNow accounts after:",
    after.map((a) => ({
      id: a.id,
      externalDriverId: a.externalDriverId,
      isActive: a.isActive,
      metadata: a.metadata,
    })),
  );

  const missingBefore = await tripGapReport(driver.tenantId);

  if (runSync && after.length > 0) {
    console.log("\n=== Running FREENOW platform sync ===");
    await processPlatformSyncJob({
      id: "cli-shahid",
      data: { tenantId: driver.tenantId, platform: RidePlatform.FREENOW, trigger: "manual" },
    } as Parameters<typeof processPlatformSyncJob>[0]);
    console.log("\n=== After sync ===");
    await tripGapReport(driver.tenantId);
  } else if (missingBefore > 0) {
    console.log("\nRe-run with --sync to backfill missing trips.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
