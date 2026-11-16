-- Tenant isolation with Postgres row-level security (RLS).
--
-- How it works:
--   * Every tenant-scoped request runs inside a transaction that executes
--       SET LOCAL ROLE app_tenant;
--       SELECT set_config('app.current_org_id', '<org uuid>', true);
--     (see src/common/db.ts -> dbContext.tenant).
--   * app_tenant is not a superuser, not the table owner and has NOBYPASSRLS,
--     so the policies below always apply to it.
--   * The connecting user owns the tables and is not subject to RLS. It is used only for
--     global tables and the one documented cross-tenant read (GET /orgs).
--   * If app.current_org_id is not set, NULLIF(...) yields NULL, the comparison is never
--     true, and queries return no rows (fail closed).

-- Roles are cluster-wide, so guard against re-creating it (e.g. dev and test databases).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Allow the application's database user to switch into app_tenant.
GRANT app_tenant TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON organisations, memberships, invites, subscriptions, usage_records
  TO app_tenant;
-- Global tables read inside tenant transactions (member listing, plan lookups).
GRANT SELECT ON users, plans TO app_tenant;
-- Webhook idempotency rows are written in the same transaction as the subscription update.
GRANT SELECT, INSERT ON processed_webhook_events TO app_tenant;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations
  USING (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invites
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_records
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
