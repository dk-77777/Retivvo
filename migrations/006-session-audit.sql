-- Registra o ciclo da sessão, inclusive sessões intermediárias de um desafio MFA.
-- As credenciais do autenticador não dão acesso direto à tabela de auditoria.
CREATE FUNCTION public.audit_session_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm.audit(event,actor_id,status) VALUES ('session.created',NEW."userId",201);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO crm.audit(event,actor_id,status) VALUES ('session.revoked',OLD."userId",200);
  ELSIF NEW."mfaVerified" AND NOT OLD."mfaVerified" THEN
    INSERT INTO crm.audit(event,actor_id,status) VALUES ('session.mfa_confirmed',NEW."userId",200);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_session_event() FROM PUBLIC;
CREATE TRIGGER audit_session AFTER INSERT OR UPDATE OF "mfaVerified" OR DELETE ON public.session
FOR EACH ROW EXECUTE FUNCTION public.audit_session_event();
