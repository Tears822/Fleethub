-- Per-event ingest telemetry (PROPUESTA monitorización sync — Phase 2)
CREATE TABLE "ingestion_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" "RidePlatform" NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'trip',
    "external_entity_id" TEXT NOT NULL,
    "ingest_source" TEXT NOT NULL,
    "platform_event_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "prior_ingest_source" TEXT,
    "webhook_event_id" TEXT,
    "sync_run_id" UUID,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ingestion_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingestion_events_tenant_platform_received_idx"
    ON "ingestion_events"("tenant_id", "platform", "received_at" DESC);

CREATE INDEX "ingestion_events_tenant_outcome_received_idx"
    ON "ingestion_events"("tenant_id", "outcome", "received_at" DESC);

CREATE INDEX "ingestion_events_tenant_entity_idx"
    ON "ingestion_events"("tenant_id", "platform", "external_entity_id");

ALTER TABLE "ingestion_events"
    ADD CONSTRAINT "ingestion_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
