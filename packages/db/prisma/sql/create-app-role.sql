-- Application role that is NOT superuser so Row Level Security applies.
-- Docker Compose uses POSTGRES_USER=fleethub, which is a superuser and bypasses RLS.
-- Run as fleethub (or any superuser): npm run db:create-app-role -w @fleethub/db
-- Then point DATABASE_URL at fleethub_app for app + npm run test:tenant -w @fleethub/db
--
-- Change the password in production (and rotate grants after new tables).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fleethub_app') THEN
    CREATE ROLE fleethub_app WITH LOGIN PASSWORD 'fleethub_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END$$;

GRANT CONNECT ON DATABASE fleethub TO fleethub_app;
GRANT USAGE ON SCHEMA public TO fleethub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fleethub_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fleethub_app;

ALTER DEFAULT PRIVILEGES FOR ROLE fleethub IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fleethub_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fleethub IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fleethub_app;

-- Required after db:apply-rls (function must exist).
GRANT EXECUTE ON FUNCTION public.app_lookup_tenant_by_slug(text) TO fleethub_app;
