#!/usr/bin/env bash
set -euo pipefail
umask 077
if (( $# < 2 )); then
  echo 'Uso: restore.sh arquivo.gpg comando-pg_restore [argumentos...]' >&2
  exit 2
fi
archive=$1
shift
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
# GPG precisa aprovar o arquivo inteiro antes de iniciar a restauração.
gpg --batch --status-fd 3 --decrypt -- "$archive" 3>"$scratch/status" > "$scratch/archive"
if [[ ! -s "$scratch/archive" ]] || ! grep -qx '\[GNUPG:\] DECRYPTION_OKAY' "$scratch/status"; then
  echo 'Descriptografia íntegra não confirmada.' >&2
  exit 1
fi
"$@" --exit-on-error --single-transaction < "$scratch/archive"
