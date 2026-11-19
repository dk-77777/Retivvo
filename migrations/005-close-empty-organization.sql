-- Restrição no banco também protege contra inserções concorrentes ao encerramento.
ALTER TABLE crm.members DROP CONSTRAINT members_org_id_fkey,
  ADD FOREIGN KEY (org_id) REFERENCES crm.organizations(id) ON DELETE RESTRICT;
ALTER TABLE crm.clients DROP CONSTRAINT clients_org_id_fkey,
  ADD FOREIGN KEY (org_id) REFERENCES crm.organizations(id) ON DELETE RESTRICT;
CREATE POLICY close_organization ON crm.organizations FOR DELETE TO retivvo_app
  USING (owner_id=crm.actor() AND crm.has_mfa());
GRANT DELETE ON crm.organizations TO retivvo_app;

CREATE FUNCTION public.owns_organization(actor text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM crm.organizations WHERE owner_id=actor)
$$;
REVOKE ALL ON FUNCTION public.owns_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_organization(text) TO retivvo_auth;
