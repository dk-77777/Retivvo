#!/usr/bin/env bash
set -euo pipefail
endpoint=${1:?Informe a origem HTTP ou HTTPS}
failures=${2:-3}
interval=${3:-60}
for (( attempt=1; attempt<=failures; attempt++ )); do
  if curl --fail --silent --max-time 8 "${endpoint%/}/api/health" |
      node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{if(JSON.parse(s).status==="ok")return;}catch{} process.exitCode=1;});'; then
    exit 0
  fi
  if (( attempt < failures )); then sleep "$interval"; fi
done
printf 'Retivvo indisponível após %s sondas.\n' "$failures" >&2
exit 1
