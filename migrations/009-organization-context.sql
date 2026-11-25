-- O vínculo autoriza o acesso. A seleção limita os dados comerciais à empresa em uso.
CREATE FUNCTION crm.selected_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('retivvo.org', true), '')::uuid
$$;

CREATE POLICY selected_org ON crm.clients AS RESTRICTIVE TO retivvo_app
  USING (org_id = crm.selected_org()) WITH CHECK (org_id = crm.selected_org());
CREATE POLICY selected_org ON crm.proposals AS RESTRICTIVE TO retivvo_app
  USING (org_id = crm.selected_org()) WITH CHECK (org_id = crm.selected_org());
CREATE POLICY selected_org ON crm.followups AS RESTRICTIVE TO retivvo_app
  USING (org_id = crm.selected_org()) WITH CHECK (org_id = crm.selected_org());
