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
pnpm dev
```

`pnpm dev` sobe a infra (MySQL/Redis) em Docker e liga a **API** e o **Web**
nativos no host, com **hot-reload** — edite o código e veja atualizar sem
`--build`. `Ctrl+C` encerra; a infra segue no ar.

- API: <http://localhost:3000/health> → `{ "status": "ok" }`
- Painel web: <http://localhost:5173>
- MySQL em `localhost:3307` (evita colisão com outros MySQL na 3306), Redis em `localhost:6379`
- Evolution API (WhatsApp) só entra no Épico 2 — sobe sob demanda com `--profile whatsapp`

Guia completo de manutenção (ciclo editar → ver funcionar, seed, troubleshooting)
em [`DEV.md`](DEV.md).

> Alternativa — **tudo em container** (valida a imagem, sem hot-reload nativo):
> `docker compose -f infra/compose/docker-compose.yml up`.
> Migrations manuais: `pnpm --filter api run migration:run`.

### Documentação da API (Swagger)

Com o compose de dev no ar, a documentação interativa (OpenAPI) da API fica em:

- **<http://localhost:3000/api/docs>** (JSON em `/api/docs-json`)

UI com todos os endpoints (auth, users, services). Para testar rotas protegidas:

1. `POST /api/auth/login` com e-mail, senha e `companySlug` → copie o `accessToken`.
2. Clique em **Authorize** (topo da página), cole o token e confirme.
3. Dispare as chamadas direto pelo navegador.

> Disponível **somente fora de produção** (`NODE_ENV !== 'production'`) — Swagger aberto exporia a API inteira, então **não** sobe em produção (DL-031).

## Qualidade (mesma sequência do CI)

Use os scripts raiz (Turbo) — eles respeitam o `^build`, garantindo que os
pacotes `@tamarcado/*` sejam buildados antes do typecheck/test que dependem do
`dist/` deles. Não use `pnpm -r <script>` direto: ignora essa ordem e quebra num
checkout limpo (sem `dist/`).

```bash
pnpm run build      # builda tudo (e os shared-* primeiro)
pnpm run lint
pnpm run typecheck
pnpm run test       # e2e da API exigem MySQL acessível (suba o compose antes)
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
