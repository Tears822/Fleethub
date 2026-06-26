ALTER TABLE "ingestion_hourly_rollups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_hourly_rollups" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ingestion_hourly_rollups ON ingestion_hourly_rollups;
CREATE POLICY tenant_isolation_ingestion_hourly_rollups ON ingestion_hourly_rollups
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS platform_scope_read_ingestion_hourly_rollups ON ingestion_hourly_rollups;
CREATE POLICY platform_scope_read_ingestion_hourly_rollups ON ingestion_hourly_rollups
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');
