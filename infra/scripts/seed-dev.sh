#!/usr/bin/env bash
# Seed de desenvolvimento. No walking skeleton (Story 1.1) apenas aplica as
# migrations; dados de exemplo (instalação, serviços, clientes) entram nas
# stories seguintes do Épico 1.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> Aplicando migrations (dev)"
pnpm --filter api run migration:run

echo "==> Seed de dev (company + owner de teste)"
pnpm --filter api run seed:dev

echo "==> Seed concluído"
