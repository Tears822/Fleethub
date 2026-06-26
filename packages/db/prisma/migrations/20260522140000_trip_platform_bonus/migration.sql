-- Primas enviadas por la plataforma con el servicio (Pantalla 3 spec).
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "platform_bonus_cents" BIGINT;
