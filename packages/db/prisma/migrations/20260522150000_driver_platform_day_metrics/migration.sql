-- FRD §6 — driver platform day KPIs (horas activo, no atendidos, rechazados).
CREATE TABLE IF NOT EXISTS "driver_platform_day_metrics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "platform" "RidePlatform" NOT NULL,
    "day" DATE NOT NULL,
    "hours_online_minutes" INTEGER NOT NULL DEFAULT 0,
    "missed_offers" INTEGER NOT NULL DEFAULT 0,
    "rejected_trips" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_platform_day_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "driver_platform_day_metrics_tenant_id_driver_id_platform_day_key"
  ON "driver_platform_day_metrics"("tenant_id", "driver_id", "platform", "day");

CREATE INDEX IF NOT EXISTS "driver_platform_day_metrics_tenant_id_driver_id_day_idx"
  ON "driver_platform_day_metrics"("tenant_id", "driver_id", "day");

ALTER TABLE "driver_platform_day_metrics"
  ADD CONSTRAINT "driver_platform_day_metrics_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_platform_day_metrics"
  ADD CONSTRAINT "driver_platform_day_metrics_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
