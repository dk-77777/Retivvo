-- A consulta de titularidade evita recursão entre as políticas de organizações e membros.
CREATE FUNCTION crm.manages(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT crm.has_mfa() AND EXISTS (
    SELECT 1 FROM crm.organizations WHERE id = target AND owner_id = crm.actor()
  )
$$;
REVOKE ALL ON FUNCTION crm.manages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.manages(uuid) TO retivvo_app;
CREATE POLICY admin_reads_members ON crm.members FOR SELECT TO retivvo_app USING (crm.manages(org_id));
CREATE POLICY admin_removes_members ON crm.members FOR DELETE TO retivvo_app USING (crm.manages(org_id));
GRANT DELETE ON crm.members TO retivvo_app;
