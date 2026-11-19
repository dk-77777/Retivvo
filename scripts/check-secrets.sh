#!/usr/bin/env bash
# Verifica os arquivos do projeto que o Git pode incluir, sem montar o checkout ou credenciais.
set -euo pipefail
git ls-files -coz --exclude-standard |
  tar --null -T - -cf - |
  docker run --rm -i --network none --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint sh zricethezav/gitleaks@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055 \
    -ec 'mkdir /tmp/project && cd /tmp/project && tar -xf - && test -s server/auth.ts && gitleaks dir . --redact --no-banner --no-color'
