# Tamarcado

SaaS de agendamento WhatsApp-first para profissionais de beleza no Brasil.
Monorepo (pnpm + Turborepo) com API NestJS, painel web React e app mobile.

## Estrutura

```
apps/
  api/      # NestJS — monolito modular (porta 3000)
  web/      # React + Vite — painel web (porta 5173)
  mobile/   # React Native + Expo — placeholder (Épico 5)
packages/
  shared-types/   # types/DTOs compartilhados
  shared-utils/   # utilitários puros
infra/
  docker/   # Dockerfiles (api, web, evolution-api)
  compose/  # docker-compose dev e staging
  nginx/    # config do Nginx de produção
  scripts/  # deploy, seed
.github/workflows/  # ci.yml e deploy.yml
```

## Pré-requisitos

- Node 20 (ver `.nvmrc`)
- pnpm 9 (`corepack enable pnpm` ou `npm i -g pnpm@9`)
- Docker + Docker Compose

## Desenvolvimento (Dev — custo R$0)

```bash
pnpm install
docker compose -f infra/compose/docker-compose.yml up
```

- API: <http://localhost:3000/health> → `{ "status": "ok" }`
- Painel web: <http://localhost:5173>
- MySQL em `localhost:3306`, Redis em `localhost:6379`, Evolution API em `localhost:8080`

Migrations: `pnpm --filter api run migration:run`

## Qualidade (mesma sequência do CI)

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test     # e2e da API exigem MySQL acessível (suba o compose antes)
pnpm -r build
```

## Ambientes

| Ambiente | Onde | Custo | Como |
|---|---|---|---|
| **Dev** | Local (Docker Compose) | R$0 | `docker-compose.yml` |
| **Staging** | **Local**, build de produção (ADR-010) | R$0 | `docker compose -f infra/compose/docker-compose.staging.yml up --build` |
| **Produção** | VPS brasileiro (Hostinger/HostGator, São Paulo — ADR-009) | R$45–96/mês ≤ R$130 (NFR-O1) | `deploy.yml` via SSH (PM2 + Nginx + Certbot) |

> Staging é **local**, não um clone em nuvem (ADR-010). Detalhes de provisionamento e deploy em [`infra/README.md`](infra/README.md).

## CI/CD

- `ci.yml`: roda em todo push/PR — lint, typecheck, test e build de todos os pacotes.
- `deploy.yml`: roda em push para `main` — deploy SSH para o VPS de produção.
