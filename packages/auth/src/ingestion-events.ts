import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import type { Prisma, PrismaClient } from "@prisma/client";

type DbTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;
import type { TripIngestSource } from "./ingest-source";
import {
  previousTenantBucket,
  tenantBucketStart,
  type TenantBucketGranularity,
} from "./display-timezone";

export type IngestionOutcome = "created" | "updated" | "duplicate" | "ignored" | "error";

export type TripIngestContext = {
  webhookEventId?: string | null;
  syncRunId?: string | null;
  receivedAt?: Date | null;
};

export type IngestionKpiSummary = {
  since: Date;
  totalEvents: number;
  created: number;
  updated: number;
  duplicates: number;
  ignored: number;
  errors: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  webhookEvents: number;
  pollEvents: number;
  webhookSharePct: number;
  bySource: { source: string; count: number }[];
};

function ingestPipelineLatencyMs(receivedAt: Date, processedAt: Date): number {
  const ms = processedAt.getTime() - receivedAt.getTime();
  return Math.max(0, Math.round(ms));
}

/**
 * Latencia de ingesta: tiempo de procesamiento (recepción → BD).
 * En webhooks en tiempo real, si el viaje acaba de ocurrir, usa recepción − fin de viaje.
 */
export function computeIngestLatencyMs(input: {
  receivedAt: Date;
  processedAt: Date;
  platformEventAt?: Date | null;
  ingestSource?: string;
}): number | null {
  const pipeline = ingestPipelineLatencyMs(input.receivedAt, input.processedAt);
  if (input.ingestSource === "webhook" && input.platformEventAt) {
    const freshness = input.receivedAt.getTime() - input.platformEventAt.getTime();
    if (freshness >= 0 && freshness <= 48 * 3_600_000) {
      return Math.round(freshness);
    }
  }
  return pipeline;
}

/** Human-readable ingest latency (ms → s → min → h). */
export function formatIngestLatencyMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const n = Math.round(ms);
  if (n < 1000) return `${n} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`;
  if (n < 3_600_000) return `${(n / 60_000).toFixed(1)} min`;
  if (n < 86_400_000) return `${(n / 3_600_000).toFixed(1)} h`;
  return `${(n / 86_400_000).toFixed(1)} días`;
}

function platformEventAt(t: NormalizedTripUpsert): Date | null {
  if (t.endedAt) return new Date(t.endedAt);
  if (t.startedAt) return new Date(t.startedAt);
  return null;
}

function latencyFromTimestamps(
  receivedAt: Date,
  processedAt: Date,
  platformEventAt: Date | null,
  ingestSource: string,
): number | null {
  return computeIngestLatencyMs({ receivedAt, processedAt, platformEventAt, ingestSource });
}

function outcomeForTrip(
  existing: { ingestSource: string | null } | null,
  ingestSource: TripIngestSource,
): { outcome: IngestionOutcome; priorIngestSource: string | null } {
  if (!existing) {
    return { outcome: "created", priorIngestSource: null };
  }
  if (existing.ingestSource && existing.ingestSource !== ingestSource) {
    return { outcome: "duplicate", priorIngestSource: existing.ingestSource };
  }
  return { outcome: "updated", priorIngestSource: existing.ingestSource };
}

export function buildTripIngestionEventRows(
  tenantId: string,
  platform: RidePlatform,
  trips: NormalizedTripUpsert[],
  ingestSource: TripIngestSource,
  existingByExternalId: Map<string, { ingestSource: string | null } | null>,
  ctx?: TripIngestContext,
): Array<{
  tenantId: string;
  platform: RidePlatform;
  entityType: string;
  externalEntityId: string;
  ingestSource: string;
  platformEventAt: Date | null;
  receivedAt: Date;
  processedAt: Date;
  outcome: string;
  latencyMs: number | null;
  priorIngestSource: string | null;
  webhookEventId: string | null;
  syncRunId: string | null;
  errorMessage: string | null;
  metadata: Prisma.InputJsonValue;
}> {
  const receivedAt = ctx?.receivedAt ?? new Date();
  const processedAt = new Date();

  return trips.map((t) => {
    const existing = existingByExternalId.get(t.externalTripId) ?? null;
    const { outcome, priorIngestSource } = outcomeForTrip(existing, ingestSource);
    const platAt = platformEventAt(t);

    return {
      tenantId,
      platform,
      entityType: "trip",
      externalEntityId: t.externalTripId,
      ingestSource,
      platformEventAt: platAt,
      receivedAt,
      processedAt,
      outcome,
      latencyMs: latencyFromTimestamps(receivedAt, processedAt, platAt, ingestSource),
      priorIngestSource,
      webhookEventId: ctx?.webhookEventId ?? null,
      syncRunId: ctx?.syncRunId ?? null,
      errorMessage: null,
      metadata: {} as Prisma.InputJsonValue,
    };
  });
}

export async function recordIngestionEvent(input: {
  tenantId: string;
  platform: RidePlatform;
  entityType?: string;
  externalEntityId: string;
  ingestSource: TripIngestSource | string;
  outcome: IngestionOutcome;
  platformEventAt?: Date | null;
  receivedAt?: Date;
  webhookEventId?: string | null;
  syncRunId?: string | null;
  priorIngestSource?: string | null;
  errorMessage?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  const receivedAt = input.receivedAt ?? new Date();
  const processedAt = new Date();
  const platformEventAt = input.platformEventAt ?? null;

  await withTenant(input.tenantId, (tx) =>
    tx.ingestionEvent.create({
      data: {
        tenantId: input.tenantId,
        platform: input.platform,
        entityType: input.entityType ?? "trip",
        externalEntityId: input.externalEntityId,
        ingestSource: input.ingestSource,
        platformEventAt,
        receivedAt,
        processedAt,
        outcome: input.outcome,
        latencyMs: latencyFromTimestamps(
          receivedAt,
          processedAt,
          platformEventAt,
          input.ingestSource,
        ),
        priorIngestSource: input.priorIngestSource ?? null,
        webhookEventId: input.webhookEventId ?? null,
        syncRunId: input.syncRunId ?? null,
        errorMessage: input.errorMessage?.slice(0, 2000) ?? null,
        metadata: input.metadata ?? {},
      },
    }),
  );
}

const POLL_SOURCES = new Set(["poll_manual", "poll_fallback"]);

function summarizeIngestionRows(
  since: Date,
  rows: Array<{ outcome: string; ingestSource: string; latencyMs: number | null }>,
): IngestionKpiSummary {
  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let ignored = 0;
  let errors = 0;
  let webhookEvents = 0;
  let pollEvents = 0;
  const bySourceMap = new Map<string, number>();
  const latencies: number[] = [];

  for (const r of rows) {
    if (r.outcome === "created") created += 1;
    else if (r.outcome === "updated") updated += 1;
    else if (r.outcome === "duplicate") duplicates += 1;
    else if (r.outcome === "ignored") ignored += 1;
    else if (r.outcome === "error") errors += 1;

    bySourceMap.set(r.ingestSource, (bySourceMap.get(r.ingestSource) ?? 0) + 1);

    if (r.ingestSource === "webhook") webhookEvents += 1;
    if (POLL_SOURCES.has(r.ingestSource)) pollEvents += 1;
    if (r.latencyMs != null && r.latencyMs >= 0) latencies.push(r.latencyMs);
  }

  const pollOrWebhook = webhookEvents + pollEvents;
  const webhookSharePct =
    pollOrWebhook > 0 ? Math.round((webhookEvents / pollOrWebhook) * 100) : 0;

  const bySource = [...bySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  let p95LatencyMs: number | null = null;
  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    p95LatencyMs = sorted[idx] ?? null;
  }

  return {
    since,
    totalEvents: rows.length,
    created,
    updated,
    duplicates,
    ignored,
    errors,
    avgLatencyMs,
    p95LatencyMs,
    webhookEvents,
    pollEvents,
    webhookSharePct,
    bySource,
  };
}

export async function getTenantIngestionKpis(
  tenantId: string,
  hours = 24,
): Promise<IngestionKpiSummary> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await withTenant(tenantId, (tx) =>
    tx.ingestionEvent.findMany({
      where: { tenantId, receivedAt: { gte: since } },
      select: {
        outcome: true,
        ingestSource: true,
        receivedAt: true,
        processedAt: true,
        platformEventAt: true,
      },
    }),
  );
  return summarizeIngestionRows(
    since,
    rows.map((r) => ({
      outcome: r.outcome,
      ingestSource: r.ingestSource,
      latencyMs: computeIngestLatencyMs({
        receivedAt: r.receivedAt,
        processedAt: r.processedAt,
        platformEventAt: r.platformEventAt,
        ingestSource: r.ingestSource,
      }),
    })),
  );
}

export async function listGlobalIngestionKpis(hours = 24): Promise<IngestionKpiSummary> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await withoutTenant((tx) =>
    tx.ingestionEvent.findMany({
      where: { receivedAt: { gte: since } },
      select: {
        outcome: true,
        ingestSource: true,
        receivedAt: true,
        processedAt: true,
        platformEventAt: true,
      },
    }),
  );
  return summarizeIngestionRows(
    since,
    rows.map((r) => ({
      outcome: r.outcome,
      ingestSource: r.ingestSource,
      latencyMs: computeIngestLatencyMs({
        receivedAt: r.receivedAt,
        processedAt: r.processedAt,
        platformEventAt: r.platformEventAt,
        ingestSource: r.ingestSource,
      }),
    })),
  );
}

export type IngestionTimeBucket = {
  bucketStart: string;
  totalEvents: number;
  duplicates: number;
  webhookEvents: number;
  pollEvents: number;
  errors: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

type IngestionBucketGranularity = TenantBucketGranularity;

type RawIngestionBucketRow = {
  bucket_start: Date;
  total_events: bigint | number;
  duplicates: bigint | number;
  webhook_events: bigint | number;
  poll_events: bigint | number;
  errors: bigint | number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
};

function toNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

function emptyTimeBucket(bucketStart: Date): IngestionTimeBucket {
  return {
    bucketStart: bucketStart.toISOString(),
    totalEvents: 0,
    duplicates: 0,
    webhookEvents: 0,
    pollEvents: 0,
    errors: 0,
    avgLatencyMs: null,
    p95LatencyMs: null,
  };
}

function mapRawIngestionBucket(
  row: RawIngestionBucketRow,
  granularity: IngestionBucketGranularity,
): IngestionTimeBucket {
  const avg = row.avg_latency_ms;
  const p95 = row.p95_latency_ms;
  return {
    bucketStart: tenantBucketStart(row.bucket_start, granularity).toISOString(),
    totalEvents: toNum(row.total_events),
    duplicates: toNum(row.duplicates),
    webhookEvents: toNum(row.webhook_events),
    pollEvents: toNum(row.poll_events),
    errors: toNum(row.errors),
    avgLatencyMs: avg != null && Number.isFinite(avg) ? Math.round(avg) : null,
    p95LatencyMs: p95 != null && Number.isFinite(p95) ? Math.round(p95) : null,
  };
}

function fillIngestionTimeSeries(
  rows: IngestionTimeBucket[],
  granularity: IngestionBucketGranularity,
  count: number,
): IngestionTimeBucket[] {
  const byKey = new Map(
    rows.map((r) => [tenantBucketStart(new Date(r.bucketStart), granularity).toISOString(), r]),
  );

  const slots: Date[] = [];
  let cursor = tenantBucketStart(new Date(), granularity);
  for (let i = 0; i < count; i++) {
    slots.unshift(cursor);
    cursor = previousTenantBucket(cursor, granularity);
  }

  return slots.map((start) => byKey.get(start.toISOString()) ?? emptyTimeBucket(start));
}

async function queryIngestionBucketsFromRollups(
  granularity: IngestionBucketGranularity,
  since: Date,
  tenantId: string | null,
): Promise<IngestionTimeBucket[]> {
  const run = async (tx: DbTx) => {
    if (granularity === "hour") {
      if (tenantId) {
        return tx.$queryRaw<RawIngestionBucketRow[]>`
          SELECT
            bucket_start,
            total_events,
            duplicates,
            webhook_events,
            poll_events,
            errors,
            CASE
              WHEN latency_count > 0 THEN (latency_sum_ms::float / latency_count)
              ELSE NULL
            END AS avg_latency_ms,
            p95_latency_ms::float AS p95_latency_ms
          FROM ingestion_hourly_rollups
          WHERE bucket_start >= ${since}
            AND tenant_id = ${tenantId}::uuid
          ORDER BY bucket_start ASC
        `;
      }
      return tx.$queryRaw<RawIngestionBucketRow[]>`
        SELECT
          bucket_start,
          SUM(total_events)::int AS total_events,
          SUM(duplicates)::int AS duplicates,
          SUM(webhook_events)::int AS webhook_events,
          SUM(poll_events)::int AS poll_events,
          SUM(errors)::int AS errors,
          CASE
            WHEN SUM(latency_count) > 0 THEN (SUM(latency_sum_ms)::float / SUM(latency_count))
            ELSE NULL
          END AS avg_latency_ms,
          MAX(p95_latency_ms)::float AS p95_latency_ms
        FROM ingestion_hourly_rollups
        WHERE bucket_start >= ${since}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `;
    }
    if (tenantId) {
      return tx.$queryRaw<RawIngestionBucketRow[]>`
        SELECT
          date_trunc('day', timezone('Europe/Madrid', bucket_start)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
          SUM(total_events)::int AS total_events,
          SUM(duplicates)::int AS duplicates,
          SUM(webhook_events)::int AS webhook_events,
          SUM(poll_events)::int AS poll_events,
          SUM(errors)::int AS errors,
          CASE
            WHEN SUM(latency_count) > 0 THEN (SUM(latency_sum_ms)::float / SUM(latency_count))
            ELSE NULL
          END AS avg_latency_ms,
          MAX(p95_latency_ms)::float AS p95_latency_ms
        FROM ingestion_hourly_rollups
        WHERE bucket_start >= ${since}
          AND tenant_id = ${tenantId}::uuid
        GROUP BY date_trunc('day', timezone('Europe/Madrid', bucket_start)) AT TIME ZONE 'Europe/Madrid'
        ORDER BY bucket_start ASC
      `;
    }
    return tx.$queryRaw<RawIngestionBucketRow[]>`
      SELECT
        date_trunc('day', timezone('Europe/Madrid', bucket_start)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
        SUM(total_events)::int AS total_events,
        SUM(duplicates)::int AS duplicates,
        SUM(webhook_events)::int AS webhook_events,
        SUM(poll_events)::int AS poll_events,
        SUM(errors)::int AS errors,
        CASE
          WHEN SUM(latency_count) > 0 THEN (SUM(latency_sum_ms)::float / SUM(latency_count))
          ELSE NULL
        END AS avg_latency_ms,
        MAX(p95_latency_ms)::float AS p95_latency_ms
      FROM ingestion_hourly_rollups
      WHERE bucket_start >= ${since}
      GROUP BY date_trunc('day', timezone('Europe/Madrid', bucket_start)) AT TIME ZONE 'Europe/Madrid'
      ORDER BY bucket_start ASC
    `;
  };

  const rows = tenantId ? await withTenant(tenantId, run) : await withoutTenant(run);
  return rows.map((row) => mapRawIngestionBucket(row, granularity));
}

/** Fallback when rollups are empty (fresh deploy before first worker refresh). */
async function queryIngestionBucketsFromEvents(
  granularity: IngestionBucketGranularity,
  since: Date,
  tenantId: string | null,
): Promise<IngestionTimeBucket[]> {
  const run = async (tx: DbTx) => {
    if (granularity === "hour") {
      if (tenantId) {
        return tx.$queryRaw<RawIngestionBucketRow[]>`
          SELECT
            date_trunc('hour', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
            COUNT(*)::int AS total_events,
            COUNT(*) FILTER (WHERE outcome = 'duplicate')::int AS duplicates,
            COUNT(*) FILTER (WHERE ingest_source = 'webhook')::int AS webhook_events,
            COUNT(*) FILTER (WHERE ingest_source IN ('poll_manual', 'poll_fallback'))::int AS poll_events,
            COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors,
            AVG(GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)))
              FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS avg_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (
              ORDER BY GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))
            ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS p95_latency_ms
          FROM ingestion_events
          WHERE received_at >= ${since}
            AND tenant_id = ${tenantId}::uuid
          GROUP BY bucket_start
          ORDER BY bucket_start ASC
        `;
      }
      return tx.$queryRaw<RawIngestionBucketRow[]>`
        SELECT
          date_trunc('hour', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE outcome = 'duplicate')::int AS duplicates,
          COUNT(*) FILTER (WHERE ingest_source = 'webhook')::int AS webhook_events,
          COUNT(*) FILTER (WHERE ingest_source IN ('poll_manual', 'poll_fallback'))::int AS poll_events,
          COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors,
          AVG(GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)))
            FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS avg_latency_ms,
          percentile_cont(0.95) WITHIN GROUP (
            ORDER BY GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))
          ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS p95_latency_ms
        FROM ingestion_events
        WHERE received_at >= ${since}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `;
    }
    if (tenantId) {
      return tx.$queryRaw<RawIngestionBucketRow[]>`
        SELECT
          date_trunc('day', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE outcome = 'duplicate')::int AS duplicates,
          COUNT(*) FILTER (WHERE ingest_source = 'webhook')::int AS webhook_events,
          COUNT(*) FILTER (WHERE ingest_source IN ('poll_manual', 'poll_fallback'))::int AS poll_events,
          COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors,
          AVG(GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)))
            FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS avg_latency_ms,
          percentile_cont(0.95) WITHIN GROUP (
            ORDER BY GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))
          ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS p95_latency_ms
        FROM ingestion_events
        WHERE received_at >= ${since}
          AND tenant_id = ${tenantId}::uuid
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `;
    }
    return tx.$queryRaw<RawIngestionBucketRow[]>`
      SELECT
        date_trunc('day', timezone('Europe/Madrid', received_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE outcome = 'duplicate')::int AS duplicates,
        COUNT(*) FILTER (WHERE ingest_source = 'webhook')::int AS webhook_events,
        COUNT(*) FILTER (WHERE ingest_source IN ('poll_manual', 'poll_fallback'))::int AS poll_events,
        COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors,
        AVG(GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)))
          FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS avg_latency_ms,
        percentile_cont(0.95) WITHIN GROUP (
          ORDER BY GREATEST(0, (EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000))
        ) FILTER (WHERE processed_at IS NOT NULL AND received_at IS NOT NULL) AS p95_latency_ms
      FROM ingestion_events
      WHERE received_at >= ${since}
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
    `;
  };

  const rows = tenantId ? await withTenant(tenantId, run) : await withoutTenant(run);
  return rows.map((row) => mapRawIngestionBucket(row, granularity));
}

async function queryIngestionBuckets(
  granularity: IngestionBucketGranularity,
  since: Date,
  tenantId: string | null,
): Promise<IngestionTimeBucket[]> {
  const fromRollups = await queryIngestionBucketsFromRollups(granularity, since, tenantId);
  if (fromRollups.length > 0) return fromRollups;
  return queryIngestionBucketsFromEvents(granularity, since, tenantId);
}

/** Hourly buckets for the last 24 hours (PROPUESTA §7 — gráfica 24 h). */
export async function listGlobalIngestionHourly24h(): Promise<IngestionTimeBucket[]> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await queryIngestionBuckets("hour", since, null);
  return fillIngestionTimeSeries(rows, "hour", 24);
}

/** Daily buckets for the last 7 days. */
export async function listGlobalIngestionDaily7d(): Promise<IngestionTimeBucket[]> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await queryIngestionBuckets("day", since, null);
  return fillIngestionTimeSeries(rows, "day", 7);
}

export async function listTenantIngestionHourly24h(
  tenantId: string,
): Promise<IngestionTimeBucket[]> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await queryIngestionBuckets("hour", since, tenantId);
  return fillIngestionTimeSeries(rows, "hour", 24);
}

export async function listTenantIngestionDaily7d(tenantId: string): Promise<IngestionTimeBucket[]> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await queryIngestionBuckets("day", since, tenantId);
  return fillIngestionTimeSeries(rows, "day", 7);
}

export type SyncFailureTimeBucket = {
  bucketStart: string;
  failedRuns: number;
  successRuns: number;
};

type RawSyncBucketRow = {
  bucket_start: Date;
  failed_runs: bigint | number;
  success_runs: bigint | number;
};

async function querySyncRunBuckets(
  granularity: IngestionBucketGranularity,
  since: Date,
  tenantId: string | null,
): Promise<SyncFailureTimeBucket[]> {
  const run = async (tx: DbTx) => {
    if (granularity === "hour") {
      if (tenantId) {
        return tx.$queryRaw<RawSyncBucketRow[]>`
          SELECT
            date_trunc('hour', timezone('Europe/Madrid', started_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
            COUNT(*) FILTER (WHERE UPPER(status) = 'FAILED')::int AS failed_runs,
            COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS success_runs
          FROM sync_runs
          WHERE started_at >= ${since}
            AND tenant_id = ${tenantId}::uuid
          GROUP BY bucket_start
          ORDER BY bucket_start ASC
        `;
      }
      return tx.$queryRaw<RawSyncBucketRow[]>`
        SELECT
          date_trunc('hour', timezone('Europe/Madrid', started_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
          COUNT(*) FILTER (WHERE UPPER(status) = 'FAILED')::int AS failed_runs,
          COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS success_runs
        FROM sync_runs
        WHERE started_at >= ${since}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `;
    }
    if (tenantId) {
      return tx.$queryRaw<RawSyncBucketRow[]>`
        SELECT
          date_trunc('day', timezone('Europe/Madrid', started_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
          COUNT(*) FILTER (WHERE UPPER(status) = 'FAILED')::int AS failed_runs,
          COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS success_runs
        FROM sync_runs
        WHERE started_at >= ${since}
          AND tenant_id = ${tenantId}::uuid
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `;
    }
    return tx.$queryRaw<RawSyncBucketRow[]>`
      SELECT
        date_trunc('day', timezone('Europe/Madrid', started_at)) AT TIME ZONE 'Europe/Madrid' AS bucket_start,
        COUNT(*) FILTER (WHERE UPPER(status) = 'FAILED')::int AS failed_runs,
        COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::int AS success_runs
      FROM sync_runs
      WHERE started_at >= ${since}
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
    `;
  };

  const rows = tenantId ? await withTenant(tenantId, run) : await withoutTenant(run);
  return rows.map((row) => ({
    bucketStart: tenantBucketStart(row.bucket_start, granularity).toISOString(),
    failedRuns: toNum(row.failed_runs),
    successRuns: toNum(row.success_runs),
  }));
}

function fillSyncFailureSeries(
  rows: SyncFailureTimeBucket[],
  granularity: IngestionBucketGranularity,
  count: number,
): SyncFailureTimeBucket[] {
  const byKey = new Map(
    rows.map((r) => [tenantBucketStart(new Date(r.bucketStart), granularity).toISOString(), r]),
  );

  const slots: Date[] = [];
  let cursor = tenantBucketStart(new Date(), granularity);
  for (let i = 0; i < count; i++) {
    slots.unshift(cursor);
    cursor = previousTenantBucket(cursor, granularity);
  }

  return slots.map((start) => {
    const key = start.toISOString();
    return byKey.get(key) ?? { bucketStart: key, failedRuns: 0, successRuns: 0 };
  });
}

export async function listGlobalSyncFailuresHourly24h(): Promise<SyncFailureTimeBucket[]> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await querySyncRunBuckets("hour", since, null);
  return fillSyncFailureSeries(rows, "hour", 24);
}

export async function listTenantSyncFailuresHourly24h(
  tenantId: string,
): Promise<SyncFailureTimeBucket[]> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await querySyncRunBuckets("hour", since, tenantId);
  return fillSyncFailureSeries(rows, "hour", 24);
}

export type TenantIngestionTimeSeries = {
  hourly24h: IngestionTimeBucket[];
  daily7d: IngestionTimeBucket[];
  syncFailures24h: SyncFailureTimeBucket[];
};

export async function getTenantIngestionTimeSeries(
  tenantId: string,
): Promise<TenantIngestionTimeSeries> {
  const [hourly24h, daily7d, syncFailures24h] = await Promise.all([
    listTenantIngestionHourly24h(tenantId),
    listTenantIngestionDaily7d(tenantId),
    listTenantSyncFailuresHourly24h(tenantId),
  ]);
  return { hourly24h, daily7d, syncFailures24h };
}
