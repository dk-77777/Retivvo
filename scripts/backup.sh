#!/usr/bin/env bash
set -euo pipefail
umask 077
if (( $# < 3 )) || [[ ! $2 =~ ^([[:xdigit:]]{40}|[[:xdigit:]]{64})$ ]]; then
  echo 'Uso: backup.sh arquivo.gpg fingerprint comando-pg_dump [argumentos...]' >&2
  exit 2
fi
destination=$1
recipient=$2
shift 2
scratch=$(mktemp -- "${destination}.partial.XXXXXXXX")
trap 'rm -f -- "$scratch"' EXIT
# A entrada é um pg_dump custom. Só disponibilizar o arquivo quando o pipeline inteiro terminar.
"$@" | gpg --batch --trust-model always --recipient "$recipient" --encrypt > "$scratch"
ln -T -- "$scratch" "$destination"
