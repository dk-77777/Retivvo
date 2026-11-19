-- Uma pessoa pode administrar empresas distintas. Repetir o mesmo cadastro é um conflito.
ALTER TABLE crm.organizations DROP CONSTRAINT organizations_owner_id_key,
  ADD UNIQUE (owner_id, name);
