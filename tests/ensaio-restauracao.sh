#!/usr/bin/env bash
# Na raiz do projeto, com o serviço db de desenvolvimento disponível.
set -euo pipefail
umask 077
scratch=$(mktemp -d)
export GNUPGHOME="$scratch/gnupg"
mkdir -m 700 "$GNUPGHOME"
suffix=$(node -p "require('node:crypto').randomBytes(8).toString('hex')")
source_db=retivvo_dr_src_${suffix}
target_container=retivvo-dr-${suffix}
source_created=false
target_created=false
pg=(docker compose exec -T db)
cleanup() {
  if "$target_created"; then docker rm -f -v "$target_container" >/dev/null || true; fi
  if "$source_created"; then "${pg[@]}" dropdb -U retivvo_bootstrap "$source_db" || true; fi
  gpgconf --kill all
  rm -rf -- "$scratch"
}
trap cleanup EXIT
"${pg[@]}" createdb -U retivvo_bootstrap "$source_db"
source_created=true
# Também exercita a migração lógica da base existente para o runtime sem root.
docker compose -f compose.yaml -f compose.banco-novo.yaml build db
image=$(docker compose -f compose.yaml -f compose.banco-novo.yaml config --images db)
POSTGRES_PASSWORD=$(node -p "require('node:crypto').randomBytes(32).toString('hex')") \
  docker run --detach --network none --cap-drop ALL --security-opt no-new-privileges --name "$target_container" -e POSTGRES_PASSWORD \
  -e POSTGRES_USER=retivvo_bootstrap -e POSTGRES_DB=restore "$image" >/dev/null
target_created=true
target=(docker exec -i "$target_container")
ready=false
for attempt in {1..45}; do
  if "${target[@]}" pg_isready -h 127.0.0.1 -d restore -U retivvo_bootstrap >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
"$ready"
"${target[@]}" psql -X -v ON_ERROR_STOP=1 -U retivvo_bootstrap -d restore <<'SQL'
CREATE ROLE retivvo_auth NOLOGIN;
CREATE ROLE retivvo_app NOLOGIN;
SQL
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
gpg --batch --passphrase '' --quick-generate-key 'Retivvo DR Test' default default 1d
fingerprint=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" && !found++ {print $10}')
bash scripts/backup.sh "$scratch/archive.gpg" "$fingerprint" "${pg[@]}" pg_dump -Fc -U retivvo_bootstrap "$source_db"
head -c 64 "$scratch/archive.gpg" > "$scratch/corrupted.gpg"
if bash scripts/restore.sh "$scratch/corrupted.gpg" touch "$scratch/restore-invoked"; then
  echo 'Arquivo incompleto aceito' >&2
  exit 1
fi
test ! -e "$scratch/restore-invoked"
time bash scripts/restore.sh "$scratch/archive.gpg" "${target[@]}" pg_restore -U retivvo_bootstrap -d restore
"${target[@]}" psql -X -v ON_ERROR_STOP=1 -U retivvo_bootstrap -d restore <<'SQL'
BEGIN;
SET LOCAL ROLE retivvo_app;
DO $$
BEGIN
  IF EXISTS(SELECT FROM crm.proposals) THEN RAISE EXCEPTION 'Contexto ausente expôs dados'; END IF;
  PERFORM set_config('retivvo.actor','fixture',true), set_config('retivvo.mfa','true',true);
  IF EXISTS(SELECT FROM crm.proposals) THEN RAISE EXCEPTION 'Empresa sem seleção expôs dados'; END IF;
  PERFORM set_config('retivvo.org',(SELECT id::text FROM crm.organizations WHERE name='Ensaio'),true);
  IF (SELECT count(*) FROM crm.proposals JOIN crm.clients c ON c.id=client_id
      WHERE amount_cents=123456 AND c.name='Cliente sintético') <> 1 THEN
    RAISE EXCEPTION 'Registro ou autorização ausente';
  END IF;
END $$;
ROLLBACK;
SQL
printf 'Restauração e isolamento verificados. Arquivo criptografado de %s bytes.\n' "$(wc -c < "$scratch/archive.gpg")"
