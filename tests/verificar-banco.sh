#!/bin/sh
# Executar na raiz. A tabela temporária existe apenas nesta conexão.
set -eu
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -w -h 127.0.0.1 -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT current_database(), current_setting('server_version');
CREATE TEMP TABLE verificacao (id integer PRIMARY KEY);
BEGIN;
INSERT INTO verificacao VALUES (1);
COMMIT;
BEGIN;
DELETE FROM verificacao;
ROLLBACK;
DO $$
BEGIN
  IF (SELECT count(*) FROM verificacao WHERE id = 1) <> 1 THEN
    RAISE EXCEPTION 'Falha na verificação de commit e rollback';
  END IF;
END $$;
SQL
