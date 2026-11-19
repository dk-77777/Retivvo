REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO retivvo_auth, retivvo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, "twoFactor", "rateLimit" TO retivvo_auth;

-- A sessão anterior à inscrição no MFA perde a validade inclusive em outros dispositivos.
CREATE FUNCTION revoke_sessions_on_factor_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM public.session WHERE "userId" = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER factor_change AFTER UPDATE OF "twoFactorEnabled" ON "user"
FOR EACH ROW WHEN (OLD."twoFactorEnabled" IS DISTINCT FROM NEW."twoFactorEnabled")
EXECUTE FUNCTION revoke_sessions_on_factor_change();

CREATE SCHEMA crm;
GRANT USAGE ON SCHEMA crm TO retivvo_app;
CREATE FUNCTION crm.actor() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('retivvo.actor', true), '')
$$;
CREATE FUNCTION crm.has_mfa() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('retivvo.mfa', true) = 'true'
$$;
CREATE TABLE crm.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  owner_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE RESTRICT
);
CREATE TABLE crm.members (
  org_id uuid NOT NULL REFERENCES crm.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX members_by_user ON crm.members(user_id, org_id);
CREATE TABLE crm.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES crm.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  UNIQUE (org_id, id)
);
CREATE INDEX clients_list ON crm.clients(org_id, name, id);

ALTER TABLE crm.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.members FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.clients FORCE ROW LEVEL SECURITY;

CREATE POLICY read_organization ON crm.organizations FOR SELECT TO retivvo_app USING (
  (owner_id = crm.actor() AND crm.has_mfa()) OR
  (owner_id <> crm.actor() AND EXISTS (SELECT 1 FROM crm.members WHERE org_id = id AND user_id = crm.actor()))
);
CREATE POLICY create_organization ON crm.organizations FOR INSERT TO retivvo_app
  WITH CHECK (owner_id = crm.actor() AND crm.has_mfa());
CREATE POLICY own_membership ON crm.members FOR SELECT TO retivvo_app USING (user_id = crm.actor());
CREATE POLICY add_member ON crm.members FOR INSERT TO retivvo_app WITH CHECK (
  user_id <> crm.actor() AND EXISTS (
    SELECT 1 FROM crm.organizations WHERE id = org_id AND owner_id = crm.actor() AND crm.has_mfa()
  )
);
CREATE POLICY visible_clients ON crm.clients TO retivvo_app USING (
  EXISTS (SELECT 1 FROM crm.organizations WHERE id = org_id)
) WITH CHECK (EXISTS (SELECT 1 FROM crm.organizations WHERE id = org_id));

GRANT SELECT, INSERT ON crm.organizations, crm.members TO retivvo_app;
GRANT SELECT, INSERT, DELETE, UPDATE(name) ON crm.clients TO retivvo_app;

CREATE TABLE crm.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (length(event) BETWEEN 1 AND 100),
  actor_id text,
  org_id uuid,
  status integer NOT NULL
);
GRANT INSERT (event, actor_id, org_id, status) ON crm.audit TO retivvo_app;
