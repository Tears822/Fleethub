-- Pre-aggregated hourly ingestion metrics (PROPUESTA §7 — charts without scanning raw events)
CREATE TABLE "ingestion_hourly_rollups" (
    "tenant_id" UUID NOT NULL,
    "bucket_start" TIMESTAMPTZ NOT NULL,
    "total_events" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "webhook_events" INTEGER NOT NULL DEFAULT 0,
    "poll_events" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "latency_sum_ms" BIGINT NOT NULL DEFAULT 0,
    "latency_count" INTEGER NOT NULL DEFAULT 0,
    "p95_latency_ms" INTEGER,
    "refreshed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_hourly_rollups_pkey" PRIMARY KEY ("tenant_id", "bucket_start")
);

CREATE INDEX "ingestion_hourly_rollups_bucket_start_idx"
    ON "ingestion_hourly_rollups"("bucket_start" DESC);

ALTER TABLE "ingestion_hourly_rollups"
    ADD CONSTRAINT "ingestion_hourly_rollups_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
