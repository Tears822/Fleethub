import { prisma } from "./client";
import { ingestionEventRetentionCutoff } from "./ingestion-retention";

/** Hours of raw events re-aggregated on each refresh (late webhooks / sync). */
export const INGESTION_ROLLUP_REFRESH_HOURS = 168;

/**
 * Rebuild hourly rollups from `ingestion_events` for the last N hours.
 * Safe to run repeatedly (upsert per tenant + hour).
 */
export async function refreshIngestionHourlyRollups(
  hoursBack = INGESTION_ROLLUP_REFRESH_HOURS,
): Promise<number> {
  const since = new Date(Date.now() - hoursBack * 3_600_000);

  const rows = await prisma.$executeRaw`
    INSERT INTO ingestion_hourly_rollups (
      tenant_id,
      bucket_start,
      total_events,
      duplicates,
      webhook_events,
      poll_events,
      errors,
      latency_sum_ms,
      latency_count,
      p95_latency_ms,
      refreshed_at
    )
    SELECT
      tenant_id,
      date_trunc('hour', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE outcome = 'duplicate')::int AS duplicates,
      COUNT(*) FILTER (WHERE ingest_source = 'webhook')::int AS webhook_events,
      COUNT(*) FILTER (WHERE ingest_source IN ('poll_manual', 'poll_fallback'))::int AS poll_events,
      COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors,
      COALESCE(
        SUM(
          GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))::bigint
        ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL),
        0
      )::bigint AS latency_sum_ms,
      COUNT(*) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL)::int AS latency_count,
      ROUND(
        percentile_cont(0.95) WITHIN GROUP (
          ORDER BY GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))
        ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL)
      )::int AS p95_latency_ms,
      NOW() AS refreshed_at
    FROM ingestion_events
    WHERE received_at >= ${since}
    GROUP BY tenant_id, date_trunc('hour', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid'
    ON CONFLICT (tenant_id, bucket_start) DO UPDATE SET
      total_events = EXCLUDED.total_events,
      duplicates = EXCLUDED.duplicates,
      webhook_events = EXCLUDED.webhook_events,
      poll_events = EXCLUDED.poll_events,
      errors = EXCLUDED.errors,
      latency_sum_ms = EXCLUDED.latency_sum_ms,
      latency_count = EXCLUDED.latency_count,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      refreshed_at = EXCLUDED.refreshed_at
  `;

  return typeof rows === "number" ? rows : Number(rows);
}

export async function purgeExpiredIngestionHourlyRollups(): Promise<number> {
  const cutoff = ingestionEventRetentionCutoff();
  const result = await prisma.ingestionHourlyRollup.deleteMany({
    where: { bucketStart: { lt: cutoff } },
  });
  return result.count;
}
