-- O recibo fica na mesma transação do registro e não duplica seu conteúdo.
CREATE TABLE crm.creation_requests (
  org_id uuid NOT NULL REFERENCES crm.organizations(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN ('clients','proposals','followups')),
  request_id uuid NOT NULL,
  content_hash text NOT NULL,
  record_id uuid NOT NULL,
  PRIMARY KEY (org_id, actor_id, resource, request_id)
);
CREATE INDEX creation_requests_actor ON crm.creation_requests(actor_id);
ALTER TABLE crm.creation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.creation_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY own_requests ON crm.creation_requests TO retivvo_app USING (
  org_id = crm.selected_org() AND actor_id = crm.actor()
  AND EXISTS (SELECT FROM crm.organizations WHERE id = creation_requests.org_id)
);
GRANT SELECT, INSERT ON crm.creation_requests TO retivvo_app;
