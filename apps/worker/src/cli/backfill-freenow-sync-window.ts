#!/usr/bin/env node
/**
 * Temporarily widen FreeNow sync window, run platform-sync, restore default.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/backfill-freenow-sync-window.ts <tenant-slug> [days=28] [--keep-days]
 */
import "../load-env.js";
import { withoutTenant, withTenantRls, RidePlatform } from "@fleethub/db";
import { getTenantIntegrationSettings } from "@fleethub/auth";
import { processPlatformSyncJob } from "../jobs/process-platform-sync.js";

const slug = process.argv[2]?.trim();
const widenDays = Math.min(28, Math.max(1, Number(process.argv[3] ?? 28) || 28));
const keepDays = process.argv.includes("--keep-days");

if (!slug) {
  console.error(
    "Usage: backfill-freenow-sync-window.ts <tenant-slug> [days=28] [--keep-days]",
  );
  process.exit(1);
}

async function setFreenowSyncDays(tenantId: string, days: number): Promise<number> {
  let previous = 7;
  await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings =
      tenant?.settings && typeof tenant.settings === "object"
        ? ({ ...(tenant.settings as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const integrations =
      settings.integrations && typeof settings.integrations === "object"
        ? ({ ...(settings.integrations as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    previous = Number(integrations.freenowSyncDays) || 7;
    integrations.freenowSyncDays = days;
    settings.integrations = integrations;
    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings },
    });
  });
  return previous;
}

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const before = await getTenantIntegrationSettings(tenant.id);
  console.log(`=== ${tenant.slug}: freenowSyncDays ${before.freenowSyncDays} → ${widenDays} ===`);
  const previous = await setFreenowSyncDays(tenant.id, widenDays);
  const widened = await getTenantIntegrationSettings(tenant.id);
  console.log("Confirmed freenowSyncDays:", widened.freenowSyncDays);

  console.log("\n=== Running FREENOW platform-sync ===");
  await processPlatformSyncJob({
    id: "cli-backfill-window",
    data: { tenantId: tenant.id, platform: RidePlatform.FREENOW, trigger: "manual" },
  } as Parameters<typeof processPlatformSyncJob>[0]);

  if (!keepDays) {
    const restoreTo = previous >= 1 && previous <= 28 ? previous : 7;
    console.log(`\n=== Restoring freenowSyncDays → ${restoreTo} ===`);
    await setFreenowSyncDays(tenant.id, restoreTo);
    const after = await getTenantIntegrationSettings(tenant.id);
    console.log("Confirmed freenowSyncDays:", after.freenowSyncDays);
  } else {
    console.log("\n(--keep-days: left freenowSyncDays at", widenDays + ")");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
