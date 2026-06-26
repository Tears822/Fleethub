-- Phase 0 ingest monitoring: last channel that wrote each trip (webhook / poll_*).
ALTER TABLE "trips" ADD COLUMN "ingest_source" TEXT;
