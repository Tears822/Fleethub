import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

const COVERAGE_PLATFORMS = [RidePlatform.UBER, RidePlatform.FREENOW] as const;

export type PlatformDriverCoverage = {
  platform: (typeof COVERAGE_PLATFORMS)[number];
  linkedDrivers: number;
  activeLast24h: number;
  coveragePct: number;
};

export type TenantDriverCoverage = {
  linkedDrivers: number;
  activeLast24h: number;
  coveragePct: number;
  byPlatform: PlatformDriverCoverage[];
};

function coveragePct(linked: number, active: number): number {
  if (linked <= 0) return 0;
  return Math.min(100, Math.round((active / linked) * 100));
}

function isLivePlatformAccount(externalDriverId: string): boolean {
  return !externalDriverId.startsWith("seed-");
}

/** Conductores con cuenta vinculada que tienen al menos un viaje en las últimas 24 h (proxy FRD §4.3). */
export async function getTenantDriverCoverage(tenantId: string): Promise<TenantDriverCoverage> {
  return withTenant(tenantId, async (tx) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const linkedAccounts = await tx.driverPlatformAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        platform: { in: [...COVERAGE_PLATFORMS] },
      },
      select: { driverId: true, platform: true, externalDriverId: true },
    });

    const linkedByPlatform = new Map<RidePlatform, Set<string>>();
    for (const p of COVERAGE_PLATFORMS) {
      linkedByPlatform.set(p, new Set());
    }
    for (const row of linkedAccounts) {
      if (!isLivePlatformAccount(row.externalDriverId)) continue;
      linkedByPlatform.get(row.platform)?.add(row.driverId);
    }

    const activeDriverIds = await tx.trip.findMany({
      where: {
        tenantId,
        startedAt: { gte: since },
        platform: { in: [...COVERAGE_PLATFORMS] },
      },
      select: { driverId: true, platform: true },
      distinct: ["driverId", "platform"],
    });

    const activeMap = new Map<RidePlatform, Set<string>>();
    for (const p of COVERAGE_PLATFORMS) {
      activeMap.set(p, new Set());
    }
    for (const row of activeDriverIds) {
      activeMap.get(row.platform)?.add(row.driverId);
    }

    const byPlatform: PlatformDriverCoverage[] = COVERAGE_PLATFORMS.map((platform) => {
      const linkedDrivers = linkedByPlatform.get(platform)?.size ?? 0;
      const activeLast24h = activeMap.get(platform)?.size ?? 0;
      return {
        platform,
        linkedDrivers,
        activeLast24h,
        coveragePct: coveragePct(linkedDrivers, activeLast24h),
      };
    });

    const linkedDrivers = byPlatform.reduce((n, p) => n + p.linkedDrivers, 0);
    const activeDrivers = new Set(activeDriverIds.map((r) => r.driverId));
    const activeLast24h = activeDrivers.size;

    return {
      linkedDrivers,
      activeLast24h,
      coveragePct: coveragePct(linkedDrivers, activeLast24h),
      byPlatform,
    };
  });
}

export type TenantSyncHealthRow = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  coverage: TenantDriverCoverage;
  lastSuccessAt: Date | null;
  failedLast7d: number;
};

/** Super Admin: cobertura + último sync OK por tenant activo. */
export async function listTenantSyncHealth(): Promise<TenantSyncHealthRow[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return withoutTenant(async (tx) => {
    const [tenants, failedByTenant, lastSuccessRuns] = await Promise.all([
      tx.tenant.findMany({
        where: { commercialStatus: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, slug: true, name: true },
      }),
      tx.syncRun.groupBy({
        by: ["tenantId"],
        where: {
          status: { in: ["failed", "FAILED"] },
          startedAt: { gte: since7d },
        },
        _count: { _all: true },
      }),
      tx.syncRun.findMany({
        where: {
          platform: { in: [...COVERAGE_PLATFORMS] },
          status: { in: ["success", "SUCCESS"] },
          finishedAt: { not: null },
        },
        orderBy: { finishedAt: "desc" },
        distinct: ["tenantId"],
        select: { tenantId: true, finishedAt: true },
      }),
    ]);

    const failedMap = new Map(
      failedByTenant.map((r) => [r.tenantId, r._count._all] as const),
    );
    const lastSuccessMap = new Map(
      lastSuccessRuns.map((r) => [r.tenantId, r.finishedAt] as const),
    );

    const rows: TenantSyncHealthRow[] = [];
    for (const t of tenants) {
      const coverage = await getTenantDriverCoverage(t.id);
      rows.push({
        tenantId: t.id,
        tenantSlug: t.slug,
        tenantName: t.name,
        coverage,
        lastSuccessAt: lastSuccessMap.get(t.id) ?? null,
        failedLast7d: failedMap.get(t.id) ?? 0,
      });
    }
    return rows;
  });
}
