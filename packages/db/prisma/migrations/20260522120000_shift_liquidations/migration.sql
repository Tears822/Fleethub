-- CreateTable
CREATE TABLE "shift_liquidations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "trip_ids" UUID[] NOT NULL,
    "platform" "RidePlatform",
    "note" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "closed_by_user_id" UUID,
    "reverted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_liquidations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_liquidations_tenant_id_closed_at_idx" ON "shift_liquidations"("tenant_id", "closed_at" DESC);

-- CreateIndex
CREATE INDEX "shift_liquidations_tenant_id_driver_id_closed_at_idx" ON "shift_liquidations"("tenant_id", "driver_id", "closed_at" DESC);

-- CreateIndex
CREATE INDEX "shift_liquidations_tenant_id_status_idx" ON "shift_liquidations"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "shift_liquidations" ADD CONSTRAINT "shift_liquidations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_liquidations" ADD CONSTRAINT "shift_liquidations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
