import { RidePlatform, withoutTenant } from "@fleethub/db";

const AUTO_POLL_PLATFORMS = [RidePlatform.UBER, RidePlatform.FREENOW] as const;

export type AutoPollPlatformHealth = {
  platform: RidePlatform;
  lastAutoSuccessAt: Date | null;
  stale: boolean;
};

export type GlobalAutoPollHealth = {
  /** Last successful automatic poll (poll_fallback) across all tenants. */
  lastAutoSuccessAt: Date | null;
  /** Minutes since last auto success, null if never. */
  minutesSinceAutoSuccess: number | null;
  /** Default alert threshold (minutes). */
  alertThresholdMinutes: number;
  stale: boolean;
  activeTenantCount: number;
  tenantsMissingRecentAutoPoll: number;
  byPlatform: AutoPollPlatformHealth[];
};

/** Poll automático que terminó (viajes sincronizados; incluye importes pendientes). */
export function autoPollHealthWhere() {
  return {
    finishedAt: { not: null },
    status: { in: ["SUCCESS", "success", "PARTIAL", "partial"] as string[] },
    OR: [
      { cursorHint: { path: ["trigger"], equals: "poll" } },
      { cursorHint: { path: ["ingestSource"], equals: "poll_fallback" } },
    ],
  };
}

/** Poll automático con importes Uber completos (métricas estrictas). */
export function autoPollSuccessWhere() {
  return {
    finishedAt: { not: null },
    status: { in: ["SUCCESS", "success"] as string[] },
    OR: [
      { cursorHint: { path: ["trigger"], equals: "poll" } },
      { cursorHint: { path: ["ingestSource"], equals: "poll_fallback" } },
    ],
    NOT: {
      cursorHint: { path: ["paymentsComplete"], equals: false },
    },
  };
}

export function autoPollAlertThresholdMinutes(): number {
  const n = Number(process.env.FLEET_AUTO_POLL_ALERT_MINUTES);
  return Number.isFinite(n) && n >= 15 ? Math.round(n) : 45;
}

/** Super Admin / watchdog: detect global automatic polling outage. */
export async function getGlobalAutoPollHealth(): Promise<GlobalAutoPollHealth> {
  const thresholdMin = autoPollAlertThresholdMinutes();
  const thresholdMs = thresholdMin * 60_000;
  const now = Date.now();

  const [lastGlobal, activeTenants, perPlatform] = await withoutTenant(async (tx) => {
    const last = await tx.syncRun.findFirst({
      where: autoPollHealthWhere(),
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });

    const tenants = await tx.tenant.findMany({
      where: { commercialStatus: "ACTIVE" },
      select: { id: true },
    });

    const platformLast = await Promise.all(
      AUTO_POLL_PLATFORMS.map(async (platform) => {
        const row = await tx.syncRun.findFirst({
          where: { platform, ...autoPollHealthWhere() },
          orderBy: { finishedAt: "desc" },
          select: { finishedAt: true },
        });
        return { platform, finishedAt: row?.finishedAt ?? null };
      }),
    );

    return [last, tenants, platformLast] as const;
  });

  const lastAutoSuccessAt = lastGlobal?.finishedAt ?? null;
  const minutesSinceAutoSuccess =
    lastAutoSuccessAt != null
      ? Math.round((now - lastAutoSuccessAt.getTime()) / 60_000)
      : null;

  const stale =
    lastAutoSuccessAt == null ||
    now - lastAutoSuccessAt.getTime() > thresholdMs;

  let tenantsMissingRecentAutoPoll = 0;
  if (activeTenants.length > 0) {
    const since = new Date(now - thresholdMs);
    for (const tenant of activeTenants) {
      const recent = await withoutTenant((tx) =>
        tx.syncRun.findFirst({
          where: {
            tenantId: tenant.id,
            ...autoPollHealthWhere(),
            finishedAt: { gte: since },
          },
          select: { id: true },
        }),
      );
      if (!recent) tenantsMissingRecentAutoPoll += 1;
    }
  }

  const byPlatform: AutoPollPlatformHealth[] = perPlatform.map((p) => ({
    platform: p.platform,
    lastAutoSuccessAt: p.finishedAt,
    stale:
      p.finishedAt == null || now - p.finishedAt.getTime() > thresholdMs,
  }));

  return {
    lastAutoSuccessAt,
    minutesSinceAutoSuccess,
    alertThresholdMinutes: thresholdMin,
    stale,
    activeTenantCount: activeTenants.length,
    tenantsMissingRecentAutoPoll,
    byPlatform,
  };
}
