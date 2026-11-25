#!/usr/bin/env bash
# Entrega ao scanner as fontes e o histórico sem montar o checkout ou a configuração privada do Git.
set -euo pipefail
scanner=(docker run --rm -i --network none --cap-drop ALL --security-opt no-new-privileges
  --entrypoint sh zricethezav/gitleaks@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055)
git ls-files -coz --exclude-standard |
  tar --null -T - -cf - |
  "${scanner[@]}" -ec 'mkdir /tmp/project && cd /tmp/project && tar -xf - && test -s server/auth.ts && gitleaks dir . --redact --no-banner --no-color'
git bundle create - --all |
  "${scanner[@]}" -ec 'cat > /tmp/history.bundle && git init -q /tmp/history && cd /tmp/history && git fetch --quiet /tmp/history.bundle "+refs/*:refs/scan/*" && gitleaks git . --log-opts=--all --redact --no-banner --no-color'
