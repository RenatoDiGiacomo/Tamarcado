# Infra & Deploy — Tamarcado

Referência: architecture.md §8 (Ambientes), §9 (CI/CD), ADR-009, ADR-010.

## Ambientes

### Dev (local, R$0)

```bash
docker compose -f infra/compose/docker-compose.yml up
```

Sobe `api`, `web`, `mysql`, `redis`, `evolution-api`. Hot-reload via volumes/targets `development`.

### Staging (local, R$0 — ADR-010)

```bash
docker compose -f infra/compose/docker-compose.staging.yml up --build
```

Builda as imagens com o **target `production`** e roda localmente — smoke test do build de produção antes do push para `main`. **Não** é um ambiente em nuvem.

### Produção (VPS brasileiro — ADR-009)

VPS Hostinger (preferencial) ou HostGator, datacenter São Paulo, ~2 vCPU / 8GB RAM.
Stack: PM2 (`tamarcado-api`) + Nginx + Certbot (TLS).
Custo estimado R$45–96/mês — dentro do teto NFR-O1 (≤ R$130/mês).

**Endereços (DL-069):** três server blocks, um por nome — as confs vivem em
`infra/nginx/` e são copiadas à mão para `/etc/nginx/sites-available/`
(o pacote de deploy não leva `infra/`).

| Nome | Serve | Conf |
|---|---|---|
| `tamarcado.tec.br` | landing page estática | `tamarcado.tec.br.conf` |
| `app.tamarcado.tec.br` | painel + `/agendar/{slug}` | `app.tamarcado.tec.br.conf` |
| `api.tamarcado.tec.br` | API (proxy) + `deny` do `/api/platform/` | `api.tamarcado.tec.br.conf` |

Layout no servidor (detalhe completo no RUNBOOK §3):

```
/opt/tamarcado/          # releases + symlink current
  current/dist/          # build NestJS rodando no PM2
  current/web/           # build do painel  (copiado para /var/www/tamarcado)
  current/landing/       # landing page     (copiada para /var/www/tamarcado-lp)
/var/www/tamarcado/      # painel servido pelo Nginx
/var/www/tamarcado-lp/   # landing page servida pelo Nginx
```

> **Migração de endereços (DL-069):** DNS do `app.`, certificado, env e a
> reinstalação do PWA estão no **RUNBOOK §12**, passo a passo.

## CI/CD

- **`ci.yml`** — push em qualquer branch + PR para `main`/`staging`. Roda lint → typecheck → test → build de todos os pacotes. Provisiona services MySQL 8 e Redis 7 para os testes e2e da API.
- **`deploy.yml`** — push em `main`. Build + deploy SSH (migrations, `pm2 restart`, cópia do `web/dist` para o Nginx).

## Passos manuais do Renato (não automatizáveis pelo código)

Estes passos precisam ser feitos uma vez, fora deste repositório:

1. **Criar o repositório no GitHub** e adicionar o remote:
   ```bash
   git remote add origin git@github.com:<seu-usuario>/tamarcado.git
   git push -u origin main
   ```
2. **Cadastrar os secrets** em *Settings → Secrets and variables → Actions*:
   - `PROD_VPS_HOST` — IP do VPS
   - `PROD_SSH_KEY` — chave privada SSH do usuário `deploy`
   - (`PROD_DATABASE_URL` fica no `.env.production` do VPS, **não** no Actions)
3. **Branch protection** em `main`: exigir o check `validate` (do `ci.yml`) verde antes do merge — garante "deploy só com CI verde" (architecture.md §9.2).
4. **Provisionar o VPS**: instalar Docker/Node 20/pnpm 9, PM2, Nginx, Certbot; criar usuário `deploy`; clonar o repo em `/opt/tamarcado`; copiar `infra/nginx/tamarcado.conf` para `/etc/nginx/sites-enabled/`; criar `/opt/tamarcado/.env.production`.

## Scripts

- `infra/scripts/deploy.sh` — passos de deploy idempotentes (versão script do `deploy.yml`).
- `infra/scripts/seed-dev.sh` — aplica migrations em dev (dados de exemplo entram nas próximas stories).
