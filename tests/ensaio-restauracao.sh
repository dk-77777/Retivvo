#!/usr/bin/env bash
# Na raiz do projeto, com o serviço db de desenvolvimento disponível.
set -euo pipefail
umask 077
scratch=$(mktemp -d)
suffix=$(node -p "require('node:crypto').randomBytes(8).toString('hex')")
source_db=retivvo_dr_src_${suffix}
target_db=retivvo_dr_dst_${suffix}
pg=(docker compose exec -T db)
created=()
cleanup() {
  for db in "${created[@]}"; do
    "${pg[@]}" dropdb -U retivvo_bootstrap "$db"
  done
  rm -f "$scratch/archive" "$scratch/archive.sha256"
  rmdir "$scratch"
}
trap cleanup EXIT
for db in "$source_db" "$target_db"; do
  "${pg[@]}" createdb -U retivvo_bootstrap "$db"
  created+=("$db")
done
node --input-type=module - "$source_db" <<'JS'
import {localConfig, prepare} from './scripts/prepare.mjs';
await prepare(process.argv[2], await localConfig());
JS
"${pg[@]}" psql -X -v ON_ERROR_STOP=1 -U retivvo_bootstrap -d "$source_db" <<'SQL'
INSERT INTO "user"(id,name,email,"emailVerified") VALUES ('fixture','Ensaio','fixture@example.test',true);
INSERT INTO crm.organizations(name,owner_id) VALUES ('Ensaio','fixture');
INSERT INTO crm.clients(org_id,name) SELECT id,'Cliente sintético' FROM crm.organizations;
INSERT INTO crm.proposals(org_id,client_id,title,amount_cents,sent_on)
 SELECT org_id,id,'Ensaio',123456,current_date FROM crm.clients;
SQL
"${pg[@]}" pg_dump -Fc -U retivvo_bootstrap "$source_db" > "$scratch/archive"
sha256sum "$scratch/archive" > "$scratch/archive.sha256"
sha256sum --status -c "$scratch/archive.sha256"
time "${pg[@]}" pg_restore --exit-on-error --single-transaction -U retivvo_bootstrap -d "$target_db" < "$scratch/archive"
"${pg[@]}" psql -X -v ON_ERROR_STOP=1 -U retivvo_bootstrap -d "$target_db" <<'SQL'
BEGIN;
SET LOCAL ROLE retivvo_app;
DO $$
BEGIN
  IF EXISTS(SELECT FROM crm.proposals) THEN RAISE EXCEPTION 'Contexto ausente expôs dados'; END IF;
  PERFORM set_config('retivvo.actor','fixture',true), set_config('retivvo.mfa','true',true);
  IF (SELECT count(*) FROM crm.proposals JOIN crm.clients c ON c.id=client_id
      WHERE amount_cents=123456 AND c.name='Cliente sintético') <> 1 THEN
    RAISE EXCEPTION 'Registro ou autorização ausente';
  END IF;
END $$;
ROLLBACK;
SQL
printf 'Restauração e isolamento verificados. Arquivo de %s bytes.\n' "$(wc -c < "$scratch/archive")"
