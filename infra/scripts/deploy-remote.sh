#!/usr/bin/env bash
# Deploy no VPS — executado pelo deploy.yml via `ssh 'bash -s' < este-arquivo`.
# NÃO fica no servidor (é pipeado). Ordem OBRIGATÓRIA:
#   backup do banco → migrations → ativar release (symlink) → restart PM2 → healthcheck
# Se o healthcheck falhar: AUTO-ROLLBACK para a release anterior e sai != 0
# (falha o job visivelmente). O pacote já vem SÓ com build + deps de produção
# (montado no Actions com `pnpm deploy`); o servidor não builda nem instala.
set -euo pipefail

REL="${1:?uso: deploy-remote.sh <release-id>}"
ROOT=/opt/tamarcado
RELDIR="$ROOT/releases/$REL"
WEB=/var/www/tamarcado
ENVSRC=/etc/tamarcado/api.env

[ -d "$RELDIR" ] || { echo "ERRO: release $RELDIR não existe (rsync falhou?)"; exit 1; }
PREV="$(readlink -f "$ROOT/current" 2>/dev/null || true)"

echo "==> 1/6 backup do banco (ANTES de tudo)"
sudo -n /usr/local/bin/tamarcado-backup.sh

echo "==> 2/6 env de produção"
cp "$ENVSRC" "$RELDIR/.env"      # load-env lê dist/../.env = <release>/.env

echo "==> 3/6 migrations (compiladas, SEM ts-node)"
( cd "$RELDIR" && ./node_modules/.bin/typeorm migration:run -d dist/database/typeorm.config.js )

echo "==> 4/6 ativar release + PM2"
ln -sfn "$RELDIR" "$ROOT/current"
( cd "$ROOT/current" && pm2 startOrReload ecosystem.config.js --update-env && pm2 save )

echo "==> 5/6 publicar web no Nginx"
mkdir -p "$WEB"
rsync -a --delete "$RELDIR/web/" "$WEB/"

echo "==> 6/6 healthcheck"
sleep 3
if curl -fsS -m 8 http://127.0.0.1:3000/health | grep -q '"status":"ok"'; then
  echo "OK — release $REL no ar"
else
  echo "!! HEALTHCHECK FALHOU"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "!! AUTO-ROLLBACK para $(basename "$PREV")"
    ln -sfn "$PREV" "$ROOT/current"
    ( cd "$ROOT/current" && pm2 startOrReload ecosystem.config.js --update-env && pm2 save )
    rsync -a --delete "$PREV/web/" "$WEB/"
    echo "!! produção restaurada na versão anterior. Release $REL NÃO foi ativada."
  else
    echo "!! sem release anterior — produção pode estar fora. Investigar já."
  fi
  exit 1
fi

echo "==> limpeza: manter as 3 últimas releases"
( cd "$ROOT/releases" && ls -1dt */ 2>/dev/null | tail -n +4 | xargs -r rm -rf ) || true
echo "deploy $REL concluído"
