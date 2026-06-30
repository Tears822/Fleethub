import { RidePlatform, withoutTenant, withTenantRls } from "@fleethub/db";
import { isSyncRunStale, SYNC_RUN_RUNNING_STALE_MS } from "./sync-run-staleness";

export type StaleSyncRunRow = {
  id: string;
  tenantId: string;
  platform: RidePlatform;
};

export type ReconcileStaleSyncRunsResult = {
  reconciled: StaleSyncRunRow[];
};

/** Mark RUNNING rows failed when a BullMQ job stalls (heartbeat may still look fresh). */
export async function failRunningSyncRunsForStalledJob(
  tenantId: string,
  platform: RidePlatform,
): Promise<number> {
  const running = await withTenantRls(tenantId, (tx) =>
    tx.syncRun.findMany({
      where: { tenantId, platform, status: "RUNNING" },
      select: { id: true },
    }),
  );
  for (const row of running) {
    await withTenantRls(tenantId, (tx) =>
      tx.syncRun.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage:
            "Sync interrumpida (job BullMQ stalled). Reintento automático encolado.",
        },
      }),
    );
  }
  return running.length;
}

/** Mark orphaned RUNNING rows as FAILED (same rule as worker poll reconciler). */
export async function reconcileStaleSyncRuns(options?: {
  tenantId?: string;
  platform?: RidePlatform;
  staleMs?: number;
  take?: number;
}): Promise<ReconcileStaleSyncRunsResult> {
  const staleMs = options?.staleMs ?? SYNC_RUN_RUNNING_STALE_MS;
  const staleBefore = new Date(Date.now() - staleMs);
  const candidates = await withoutTenant((tx) =>
    tx.syncRun.findMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: staleBefore },
        ...(options?.tenantId ? { tenantId: options.tenantId } : {}),
        ...(options?.platform ? { platform: options.platform } : {}),
      },
      select: { id: true, tenantId: true, platform: true, startedAt: true, cursorHint: true },
      take: options?.take ?? 200,
    }),
  );

  const stuck = candidates.filter((row) =>
    isSyncRunStale(row.startedAt, row.cursorHint, staleMs),
  );

  const reconciled: StaleSyncRunRow[] = [];
  for (const row of stuck) {
    await withTenantRls(row.tenantId, (tx) =>
      tx.syncRun.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage:
            "Sync interrumpido (RUNNING obsoleto). Reintento automático encolado.",
        },
      }),
    );
    reconciled.push({ id: row.id, tenantId: row.tenantId, platform: row.platform });
  }

  return { reconciled };
}

export type SuperAdminSyncAlertSummary = {
  queueFailed: number;
  staleRunningCount: number;
  failedLast24h: number;
  tenantsWithProblems: number;
};

const SYNC_PLATFORMS = [RidePlatform.UBER, RidePlatform.FREENOW] as const;

/** Tenants with a stale RUNNING sync or whose latest run per platform is FAILED. */
async function countTenantsWithActiveSyncProblems(): Promise<number> {
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: { commercialStatus: "ACTIVE" },
      select: { id: true },
    }),
  );

  const problemTenantIds = new Set<string>();

  const runningRows = await withoutTenant((tx) =>
    tx.syncRun.findMany({
      where: {
        status: "RUNNING",
        tenantId: { in: tenants.map((t) => t.id) },
        platform: { in: [...SYNC_PLATFORMS] },
      },
      select: { tenantId: true, startedAt: true, cursorHint: true },
    }),
  );
  for (const row of runningRows) {
    if (isSyncRunStale(row.startedAt, row.cursorHint, SYNC_RUN_RUNNING_STALE_MS)) {
      problemTenantIds.add(row.tenantId);
    }
  }

  for (const tenant of tenants) {
    for (const platform of SYNC_PLATFORMS) {
      const last = await withoutTenant((tx) =>
        tx.syncRun.findFirst({
          where: { tenantId: tenant.id, platform },
          orderBy: { startedAt: "desc" },
          select: { status: true },
        }),
      );
      if (last?.status.toUpperCase() === "FAILED") {
        problemTenantIds.add(tenant.id);
        break;
      }
    }
  }

  return problemTenantIds.size;
}

/** Lightweight counts for Super Admin dashboard banner. */
export async function getSuperAdminSyncAlertSummary(
  queueFailed: number,
): Promise<SuperAdminSyncAlertSummary> {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000);

  const [staleRunningCount, failedRuns, tenantsWithProblems] = await Promise.all([
    withoutTenant(async (tx) => {
      const staleBefore = new Date(Date.now() - SYNC_RUN_RUNNING_STALE_MS);
      const candidates = await tx.syncRun.findMany({
        where: { status: "RUNNING", startedAt: { lt: staleBefore } },
        select: { startedAt: true, cursorHint: true },
        take: 200,
      });
      return candidates.filter((row) =>
        isSyncRunStale(row.startedAt, row.cursorHint, SYNC_RUN_RUNNING_STALE_MS),
      ).length;
    }),
    withoutTenant((tx) =>
      tx.syncRun.findMany({
        where: {
          status: { in: ["FAILED", "failed"] },
          startedAt: { gte: since24h },
        },
        select: { tenantId: true },
        take: 500,
      }),
    ),
    countTenantsWithActiveSyncProblems(),
  ]);

  return {
    queueFailed,
    staleRunningCount,
    failedLast24h: failedRuns.length,
    tenantsWithProblems,
  };
}
