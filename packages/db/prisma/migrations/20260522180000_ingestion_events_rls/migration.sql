-- RLS for ingestion_events (tenant isolation + Super Admin read via platform_scope)
ALTER TABLE "ingestion_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ingestion_events ON ingestion_events;
CREATE POLICY tenant_isolation_ingestion_events ON ingestion_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS platform_scope_read_ingestion_events ON ingestion_events;
CREATE POLICY platform_scope_read_ingestion_events ON ingestion_events
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

-- Super Admin global sync monitor (fleethub_app without BYPASSRLS)
DROP POLICY IF EXISTS platform_scope_read_sync_runs ON sync_runs;
CREATE POLICY platform_scope_read_sync_runs ON sync_runs
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');
