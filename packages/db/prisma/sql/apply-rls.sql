-- Tenants: each session only sees its own tenant row (Super Admin Hito 6 = rol distinto / BYPASSRLS).

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY tenant_isolation_tenants ON tenants
  FOR ALL
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies FORCE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_platform_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE shift_liquidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_liquidations FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_platform_day_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_platform_day_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_user_companies ON user_companies;
CREATE POLICY tenant_isolation_user_companies ON user_companies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_companies.user_id
        AND u.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_companies.user_id
        AND u.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = user_companies.company_id
        AND c.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS tenant_isolation_companies ON companies;
CREATE POLICY tenant_isolation_companies ON companies
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_drivers ON drivers;
CREATE POLICY tenant_isolation_drivers ON drivers
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_dpa ON driver_platform_accounts;
CREATE POLICY tenant_isolation_dpa ON driver_platform_accounts
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_trips ON trips;
CREATE POLICY tenant_isolation_trips ON trips
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_sync ON sync_runs;
CREATE POLICY tenant_isolation_sync ON sync_runs
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS platform_scope_read_sync_runs ON sync_runs;
CREATE POLICY platform_scope_read_sync_runs ON sync_runs
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS tenant_isolation_ingestion_events ON ingestion_events;
CREATE POLICY tenant_isolation_ingestion_events ON ingestion_events
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS platform_scope_read_ingestion_events ON ingestion_events;
CREATE POLICY platform_scope_read_ingestion_events ON ingestion_events
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

ALTER TABLE ingestion_hourly_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_hourly_rollups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ingestion_hourly_rollups ON ingestion_hourly_rollups;
CREATE POLICY tenant_isolation_ingestion_hourly_rollups ON ingestion_hourly_rollups
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS platform_scope_read_ingestion_hourly_rollups ON ingestion_hourly_rollups;
CREATE POLICY platform_scope_read_ingestion_hourly_rollups ON ingestion_hourly_rollups
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
CREATE POLICY tenant_isolation_audit ON audit_logs
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_shift_liquidations ON shift_liquidations;
CREATE POLICY tenant_isolation_shift_liquidations ON shift_liquidations
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_driver_platform_day_metrics ON driver_platform_day_metrics;
CREATE POLICY tenant_isolation_driver_platform_day_metrics ON driver_platform_day_metrics
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Login / bootstrap: the app role has no app.tenant_id yet, so plain SELECT on tenants returns
-- nothing under RLS. This helper runs as table owner and only resolves slug → id.
CREATE OR REPLACE FUNCTION public.app_lookup_tenant_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants WHERE slug = lower(trim(p_slug)) LIMIT 1;
$$;

ALTER FUNCTION public.app_lookup_tenant_by_slug(text) OWNER TO fleethub;
REVOKE ALL ON FUNCTION public.app_lookup_tenant_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lookup_tenant_by_slug(text) TO fleethub;

-- Super Admin panel: `withoutTenant()` sets app.platform_scope = super_admin for the transaction.
DROP POLICY IF EXISTS platform_scope_read_tenants ON tenants;
DROP POLICY IF EXISTS platform_scope_tenants ON tenants;
CREATE POLICY platform_scope_tenants ON tenants
  FOR ALL
  USING (current_setting('app.platform_scope', true) = 'super_admin')
  WITH CHECK (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS platform_scope_read_companies ON companies;
CREATE POLICY platform_scope_read_companies ON companies
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS platform_scope_read_users ON users;
CREATE POLICY platform_scope_read_users ON users
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS platform_scope_read_drivers ON drivers;
CREATE POLICY platform_scope_read_drivers ON drivers
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');

DROP POLICY IF EXISTS platform_scope_read_user_companies ON user_companies;
CREATE POLICY platform_scope_read_user_companies ON user_companies
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');
