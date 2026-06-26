import { refreshTodayMetricsForRecentlyActiveTenants } from "@fleethub/auth";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export async function runDriverDayMetricsRefresh(): Promise<{
  tenants: number;
  buckets: number;
}> {
  return refreshTodayMetricsForRecentlyActiveTenants(60 * 60 * 1000);
}

/** Keeps Apps `/apps` day metrics aligned with webhook/poll ingesta (FRD §6). */
export function scheduleDriverDayMetricsRefresh(): void {
  const run = async () => {
    try {
      const result = await runDriverDayMetricsRefresh();
      if (result.tenants > 0) {
        console.log(
          `[worker] driver_platform_day_metrics: ${result.buckets} bucket(s) en ${result.tenants} tenant(s).`,
        );
      }
    } catch (err) {
      console.error("[worker] Error refrescando driver_platform_day_metrics:", err);
    }
  };

  void run();
  setInterval(() => void run(), REFRESH_INTERVAL_MS);
}
