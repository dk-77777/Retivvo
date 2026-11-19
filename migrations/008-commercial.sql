CREATE TABLE crm.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES crm.organizations(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 0 AND 99999999999),
  sent_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  UNIQUE (org_id,id),
  FOREIGN KEY (org_id,client_id) REFERENCES crm.clients(org_id,id) ON DELETE RESTRICT
);
CREATE INDEX proposals_listing ON crm.proposals(org_id,sent_on DESC,id);
CREATE INDEX proposals_client ON crm.proposals(org_id,client_id);

CREATE TABLE crm.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  action text NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 200),
  due_on date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT '' CHECK (length(outcome) <= 2000),
  CHECK (NOT done OR length(trim(outcome)) > 0),
  FOREIGN KEY (org_id,proposal_id) REFERENCES crm.proposals(org_id,id) ON DELETE RESTRICT
);
CREATE INDEX followups_proposal ON crm.followups(org_id,proposal_id);
CREATE INDEX followups_listing ON crm.followups(org_id,done,due_on,id);

ALTER TABLE crm.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.followups FORCE ROW LEVEL SECURITY;
CREATE POLICY visible_proposals ON crm.proposals TO retivvo_app
  USING (EXISTS (SELECT 1 FROM crm.organizations WHERE id = proposals.org_id))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.organizations WHERE id = proposals.org_id));
CREATE POLICY visible_followups ON crm.followups TO retivvo_app
  USING (EXISTS (SELECT 1 FROM crm.organizations WHERE id = followups.org_id))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.organizations WHERE id = followups.org_id));
GRANT SELECT,INSERT,DELETE,UPDATE(client_id,title,amount_cents,sent_on,status,notes) ON crm.proposals TO retivvo_app;
GRANT SELECT,INSERT,DELETE,UPDATE(action,due_on,done,outcome) ON crm.followups TO retivvo_app;
