-- Reparto efectivo / tarjeta / app por viaje (pago mixto en cierre)
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "cash_payment_cents" BIGINT;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "card_payment_cents" BIGINT;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "app_payment_cents" BIGINT;
