-- Super Admin: platform_scope must allow INSERT/UPDATE/DELETE on tenants, not only SELECT.
DROP POLICY IF EXISTS platform_scope_read_tenants ON tenants;
DROP POLICY IF EXISTS platform_scope_tenants ON tenants;
CREATE POLICY platform_scope_tenants ON tenants
  FOR ALL
  USING (current_setting('app.platform_scope', true) = 'super_admin')
  WITH CHECK (current_setting('app.platform_scope', true) = 'super_admin');
