#!/usr/bin/env bash
# SUPERSEDIDO (Fase 3 / DL-060). Este script fazia `git pull` no servidor
# (modelo antigo). O deploy agora é:
#   - build NO GitHub Actions (.github/workflows/deploy.yml, workflow_dispatch)
#   - pacote de produção via `pnpm deploy` (SÓ dist + deps de produção)
#   - rsync do pacote para /opt/tamarcado/releases/<id> + symlink `current`
#   - passos no servidor: infra/scripts/deploy-remote.sh
#   - rollback: infra/scripts/rollback.sh
# O servidor NÃO tem `.git` nem código-fonte. Ver RUNBOOK-producao.md §7.
echo "OBSOLETO — use o workflow Deploy Production (Actions). Ver RUNBOOK §7." >&2
exit 1
