#!/usr/bin/env bash
# Rollback MANUAL para a release anterior. Instalado no servidor como
# /usr/local/bin/tamarcado-rollback (fora de /opt/tamarcado). Uso: rodar como
# `deploy`:  tamarcado-rollback
#
# "Quebrou às 20h de sexta com salão aberto" → um comando volta pra versão boa.
set -euo pipefail
ROOT=/opt/tamarcado
WEB=/var/www/tamarcado
LP=/var/www/tamarcado-lp          # landing page (DL-069)

CUR="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
[ -n "$CUR" ] || { echo "sem release ativa (current)"; exit 1; }

# A "anterior" = release mais recente em releases/ que NÃO é a current.
PREV=""
for d in $(ls -1dt "$ROOT"/releases/*/ 2>/dev/null); do
  [ "$(readlink -f "$d")" != "$CUR" ] && { PREV="${d%/}"; break; }
done
[ -n "$PREV" ] || { echo "não há release anterior para voltar"; exit 1; }

echo "current: $(basename "$CUR")  ->  rollback para: $(basename "$PREV")"
ln -sfn "$PREV" "$ROOT/current"
( cd "$ROOT/current" && pm2 startOrReload ecosystem.config.js --update-env && pm2 save )
rsync -a --delete "$PREV/web/" "$WEB/"
[ -d "$PREV/landing" ] && rsync -a --delete "$PREV/landing/" "$LP/"
sleep 2
curl -fsS -m 8 http://127.0.0.1:3000/health && echo "  <- OK (rollback aplicado)"

cat <<'AVISO'

ATENÇÃO: se a release ruim rodou uma MIGRATION, o rollback acima só voltou o
CÓDIGO. As migrations do projeto são ADITIVAS (nova coluna/tabela não quebra o
código antigo), então normalmente o código anterior roda sobre o schema novo.
Se ainda assim o banco precisar voltar, restaure o backup tirado ANTES do deploy
(ver RUNBOOK §6). Nunca reverta migration em produção sem backup na mão.
AVISO
