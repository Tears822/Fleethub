import {
  INGESTION_ROLLUP_REFRESH_HOURS,
  refreshIngestionHourlyRollups,
} from "@fleethub/db";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export async function runIngestionHourlyRollupRefresh(): Promise<number> {
  return refreshIngestionHourlyRollups(INGESTION_ROLLUP_REFRESH_HOURS);
}

/** Refresh hourly rollups on startup and every 15 minutes. */
export function scheduleIngestionHourlyRollupRefresh(): void {
  const run = async () => {
    try {
      const upserted = await runIngestionHourlyRollupRefresh();
      if (upserted > 0) {
        console.log(
          `[worker] ingestion_hourly_rollups: ${upserted} fila(s) actualizada(s) (últimas ${INGESTION_ROLLUP_REFRESH_HOURS} h).`,
        );
      }
    } catch (err) {
      console.error("[worker] Error refrescando ingestion_hourly_rollups:", err);
    }
  };

  void run();
  setInterval(() => void run(), REFRESH_INTERVAL_MS);
}
