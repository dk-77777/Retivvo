CREATE TABLE crm.beta_activity (
  org_id uuid NOT NULL REFERENCES crm.organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('active', 'followup_created')),
  PRIMARY KEY (org_id, day, kind)
);
ALTER TABLE crm.beta_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.beta_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY record_activity ON crm.beta_activity FOR INSERT TO retivvo_app
  WITH CHECK (org_id = crm.selected_org() AND EXISTS (
    SELECT FROM crm.organizations WHERE id = beta_activity.org_id
  ));
GRANT INSERT ON crm.beta_activity TO retivvo_app;

CREATE FUNCTION crm.record_beta_activity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  activity_day date := (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF current_setting('retivvo.beta_metrics', true) IS DISTINCT FROM 'true' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  INSERT INTO crm.beta_activity(org_id, day, kind)
    VALUES (NEW.org_id, activity_day, 'active') ON CONFLICT DO NOTHING;
  IF TG_TABLE_NAME = 'followups' AND TG_OP = 'INSERT' THEN
    INSERT INTO crm.beta_activity(org_id, day, kind)
      VALUES (NEW.org_id, activity_day, 'followup_created') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER beta_proposal_activity AFTER INSERT OR UPDATE ON crm.proposals
FOR EACH ROW EXECUTE FUNCTION crm.record_beta_activity();
CREATE TRIGGER beta_followup_activity AFTER INSERT OR UPDATE ON crm.followups
FOR EACH ROW EXECUTE FUNCTION crm.record_beta_activity();

CREATE FUNCTION crm.beta_summary(start_on date, end_before date)
RETURNS TABLE (active integer, activated integer, eligible integer, retained integer)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH first_followup AS (
    SELECT org_id, min(day) AS day FROM crm.beta_activity
    WHERE kind = 'followup_created' AND day < end_before GROUP BY org_id
  ), cohort AS (
    SELECT org_id, day FROM first_followup WHERE day >= start_on
  )
  SELECT
    (SELECT count(DISTINCT org_id)::int FROM crm.beta_activity
      WHERE kind = 'active' AND day >= start_on AND day < end_before),
    count(*)::int,
    count(*) FILTER (WHERE c.day + 14 <= end_before)::int,
    count(*) FILTER (WHERE c.day + 14 <= end_before AND EXISTS (
      SELECT FROM crm.beta_activity a WHERE a.org_id = c.org_id
        AND a.kind = 'active' AND a.day >= c.day + 7 AND a.day < c.day + 14
    ))::int
  FROM cohort c
$$;
REVOKE ALL ON FUNCTION crm.beta_summary(date, date) FROM PUBLIC;
