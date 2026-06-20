#!/usr/bin/env bash
# Passos de deploy executados no VPS de produção (architecture.md §8.3, §9.2).
# Idempotente; chamado pelo deploy.yml via SSH ou manualmente no servidor.
set -euo pipefail

APP_DIR="/opt/tamarcado"
WEB_SERVE_DIR="/var/www/tamarcado"

cd "$APP_DIR"

echo "==> Atualizando código (main)"
git pull origin main

echo "==> Instalando dependências de produção"
pnpm install --frozen-lockfile

echo "==> Build de todos os pacotes"
pnpm -r build

echo "==> Aplicando migrations de banco"
pnpm --filter api run migration:run

echo "==> Reiniciando API (PM2)"
pm2 restart tamarcado-api || pm2 start "$APP_DIR/ecosystem.config.js"

echo "==> Publicando build do painel web no Nginx"
mkdir -p "$WEB_SERVE_DIR"
cp -r "$APP_DIR/apps/web/dist/." "$WEB_SERVE_DIR/"

echo "==> Deploy concluído"
