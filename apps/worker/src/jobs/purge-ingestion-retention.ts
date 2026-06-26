import {
  INGESTION_EVENT_RETENTION_DAYS,
  purgeExpiredIngestionEvents,
  purgeExpiredIngestionHourlyRollups,
} from "@fleethub/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runIngestionEventRetentionPurge(): Promise<number> {
  return purgeExpiredIngestionEvents();
}

/** Purga global al arranque y cada 24 h. */
export function scheduleIngestionEventRetention(): void {
  const run = async () => {
    try {
      const removed = await runIngestionEventRetentionPurge();
      const rollupsRemoved = await purgeExpiredIngestionHourlyRollups();
      if (removed > 0) {
        console.log(
          `[worker] ingestion_events: ${removed} fila(s) eliminada(s) (>${INGESTION_EVENT_RETENTION_DAYS} días).`,
        );
      }
      if (rollupsRemoved > 0) {
        console.log(
          `[worker] ingestion_hourly_rollups: ${rollupsRemoved} fila(s) eliminada(s) (>${INGESTION_EVENT_RETENTION_DAYS} días).`,
        );
      }
    } catch (err) {
      console.error("[worker] Error en purga de ingestion_events:", err);
    }
  };

  void run();
  setInterval(() => void run(), DAY_MS);
}
