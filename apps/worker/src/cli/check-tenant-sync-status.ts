import "../load-env.js";
import { getSuperAdminSyncAlertSummary, listTenantSyncHealth } from "@fleethub/auth";
import { getFleetQueuesSnapshot } from "@fleethub/db/bullmq-queue-stats";
import { withoutTenant } from "@fleethub/db";

const SLUG = process.argv[2]?.trim() ?? "cosculluela";

const tenant = await withoutTenant((tx) =>
  tx.tenant.findFirst({
    where: { slug: SLUG },
    select: { id: true, name: true, slug: true },
  }),
);
if (!tenant) {
  console.error("Tenant not found:", SLUG);
  process.exit(1);
}

console.log("=== TENANT ===");
console.log(tenant.name, tenant.slug, tenant.id);

const runs = await withoutTenant((tx) =>
  tx.syncRun.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startedAt: "desc" },
    take: 8,
    select: {
      platform: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      cursorHint: true,
    },
  }),
);

console.log("\n=== RECENT SYNC RUNS ===");
for (const r of runs) {
  const hint = r.cursorHint as { tripsUpserted?: number; trigger?: string } | null;
  const dur =
    r.finishedAt != null
      ? `${Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 60_000)}m`
      : `${Math.round((Date.now() - r.startedAt.getTime()) / 60_000)}m (running)`;
  console.log(
    [
      r.platform.padEnd(8),
      r.status.padEnd(8),
      r.startedAt.toISOString().slice(0, 16),
      dur.padStart(12),
      hint?.tripsUpserted != null ? `${hint.tripsUpserted} trips` : "",
      r.errorMessage ? r.errorMessage.slice(0, 60) : "",
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

const running = await withoutTenant((tx) =>
  tx.syncRun.count({ where: { tenantId: tenant.id, status: "RUNNING" } }),
);
const failed24h = await withoutTenant((tx) =>
  tx.syncRun.count({
    where: {
      tenantId: tenant.id,
      status: { in: ["FAILED", "failed"] },
      startedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
    },
  }),
);

console.log("\n=== COUNTS ===");
console.log("RUNNING now:", running);
console.log("FAILED last 24h:", failed24h);

const queues = await getFleetQueuesSnapshot();
const alerts = await getSuperAdminSyncAlertSummary(queues.fleetSync.failed);
console.log("\n=== GLOBAL ===");
console.log("Queue failed:", queues.fleetSync.failed, "active:", queues.fleetSync.active);
console.log("Alerts:", alerts);

const health = await listTenantSyncHealth();
const row = health.find((h) => h.tenantId === tenant.id);
if (row) {
  console.log("\n=== SYNC HEALTH ROW ===");
  console.log("Coverage 24h:", row.coverage.coveragePct + "%");
  console.log("Last success:", row.lastSuccessAt?.toISOString() ?? "—");
  console.log("Failed 7d:", row.failedLast7d);
  console.log("Running:", row.runningSyncs);
}
