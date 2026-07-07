-- Sector benchmark (Analítica): cross-tenant read of closed trips for opted-in tenants.
-- `withoutTenant()` sets app.platform_scope = super_admin; trips lacked a permissive SELECT policy.

DROP POLICY IF EXISTS platform_scope_read_trips ON trips;
CREATE POLICY platform_scope_read_trips ON trips
  FOR SELECT
  USING (current_setting('app.platform_scope', true) = 'super_admin');
