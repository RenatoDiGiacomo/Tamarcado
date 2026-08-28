# Runbook — Produção (VPS)

Documento operacional do servidor de produção do Tamarcado. Objetivo: **recriar o
servidor do zero sem depender de memória**. Referência de arquitetura: ADR-009,
`architecture.md §8/§9`, e as decisões DL-054 a DL-060.

> **NENHUM segredo neste arquivo.** Só nomes de variáveis e onde vivem. Os valores
> (senhas, chaves JWT, `PLATFORM_KEY`, senha de sudo do `deploy`) foram gerados **no
> servidor** e ficam com o Renato (gerenciador de senhas) ou apenas no servidor.

---

## 1. Fatos do servidor

| Item | Valor |
|---|---|
| Provedor | Hostinger KVM 2 |
| SO | Ubuntu 24.04 LTS (datacenter Brasil) |
| IP | `179.198.123.87` |
| Domínio | `tamarcado.tec.br` — registrado no registro.br, **DNS gerido na Cloudflare** (NS `arturo`/`melina.ns.cloudflare.com`). Cloudflare **Email Routing** grátis (`contato@tamarcado.tec.br` → caixa do Renato). |
| Stack | Nginx + PM2 + MySQL 8 + Certbot (**sem Docker, sem Redis** — DL-056) |
| Usuário de app | `deploy` (não-root, sudo) |
| App (API) | PM2 `tamarcado-api`, porta interna `3000` |

**Endereços (revisto em 2026-08-25 — DL-069; o "se um dia houver site institucional na raiz" aconteceu):**

| Nome | Uso | Raiz no servidor |
|---|---|---|
| `tamarcado.tec.br` | **landing page** (site institucional, estático) | `/var/www/tamarcado-lp` |
| `app.tamarcado.tec.br` | painel (`/login`) **e** link público (`/agendar/{slug}`) — mesmo SPA | `/var/www/tamarcado` |
| `api.tamarcado.tec.br` | API (proxy para `127.0.0.1:3000`) | — (PM2) |

> Até 2026-08-25 o painel respondia na **raiz**. A migração (DNS, certificado,
> env, PWA) está no **§12** — enquanto ela não for executada, `app.` não existe.

---

## 2. Acesso SSH

Login **só por chave** (senha e root desabilitados). Duas chaves autorizadas no
usuário `deploy`:

- **`id_ed25519`** (`renato_di_giacomo@hotmail.com`) — acesso **interativo** do Renato.
- **`tamarcado_deploy`** (`deploy-tamarcado`) — usada pelo **CD** (GitHub Actions).

```bash
ssh -i ~/.ssh/id_ed25519 deploy@179.198.123.87      # interativo (Renato)
# sudo do deploy pede SENHA (só para admin: nginx/certbot/apt/systemctl).
# A senha de sudo do deploy está com o Renato (gerenciador de senhas) — NÃO está no repo.
```

- Root por SSH: **negado** (`PermitRootLogin no`).
- Autenticação por senha: **negada** (`PasswordAuthentication no`).
- Config do hardening: `/etc/ssh/sshd_config.d/00-tamarcado-hardening.conf` (prefixo `00-`
  para ser parseado **primeiro** e vencer o `50-cloud-init.conf`, que reabria senha).
- Firewall (UFW): só **22, 80, 443**. Fail2ban ativo na jail `sshd`.

**Recuperação se ficar trancado fora:** console/VNC do painel Hostinger (acesso root
local), remover/ajustar o drop-in de hardening, `sudo systemctl reload ssh`.

---

## 3. Layout no servidor (estado final — modelo de RELEASES)

Após a limpeza (2026-08-12), **`/opt/tamarcado` contém SÓ o mecanismo de releases** —
nada de fonte, `_bmad`, `docs`, `infra`, devDeps ou Docker. Cada deploy do CD cria uma
release nova (pacote de inclusão do §7.1) e move o symlink `current`.

```
/opt/tamarcado/
  releases/<id>/           # uma por deploy (id = AAAAMMDD-HHMMSS-<sha>). Mantém as 3 últimas.
    dist/                  #   API compilada (PM2 roda current/dist/main.js)
    node_modules/          #   SÓ deps de PRODUÇÃO (@tamarcado/shared-* injetados)
    package.json
    ecosystem.config.js    #   PM2 (name=tamarcado-api, cwd=/opt/tamarcado/current, PORT=3000)
    web/                   #   estático do front (copiado para /var/www a cada deploy)
    .env                   #   cópia de /etc/tamarcado/api.env (a API lê ../.env do dist)
  current -> releases/<id> # symlink para a release ATIVA. Rollback = apontar para outra.
/var/www/tamarcado/        # painel: estático servido pelo Nginx (cópia de current/web)
/var/www/tamarcado-lp/     # landing page: estática (cópia de current/landing) — DL-069
/etc/tamarcado/api.env     # ENV DE PRODUÇÃO canônico (root:deploy, 640) — fonte da verdade
/var/backups/tamarcado/    # dumps diários do MySQL (700)
/usr/local/bin/tamarcado-backup.sh    # backup (cron 03:30 + CD via sudo NOPASSWD)
/usr/local/bin/tamarcado-rollback     # rollback manual (1 comando; §7.3)
```

- **Fora de `/opt/tamarcado`** (preservados, nunca removidos na limpeza): `/etc/tamarcado/api.env`,
  banco em `/var/lib/mysql`, backups em `/var/backups/tamarcado`, Nginx em `/etc/nginx`.
- **Env de runtime:** o app lê `current/.env` (via `load-env`: `dist/../.env`). O deploy copia
  `/etc/tamarcado/api.env → <release>/.env`.
- **Invariante:** depois da limpeza, `ls /opt/tamarcado` deve mostrar **só** `releases` e `current`.
  Qualquer outra coisa na raiz (`src`, `node_modules`, `_bmad`, `apps`…) é resíduo e pode sair.
- **PM2 roda da release via o symlink** (`cwd=/opt/tamarcado/current`): `pm_exec_path` fica
  `/opt/tamarcado/current/dist/main.js`, então trocar o `current` + `pm2 startOrReload` já passa a
  rodar a release nova. *(Na transição do 1º deploy o PM2 estava preso ao layout antigo; corrigido
  re-apontando para `current`. Daqui pra frente o CD re-aponta sozinho — validado no 2º deploy.)*

---

## 4. Fase 1 — provisionamento (feito em 2026-08-11)

Tudo abaixo foi executado como root (via chave `tamarcado_deploy`, antes do hardening).
Ordem importa: **o hardening do SSH foi o ÚLTIMO passo**, só depois de confirmar que o
`deploy` entra pelas duas chaves e tem sudo.

### 4.1 Usuário `deploy` + chaves + sudo
```bash
useradd -m -s /bin/bash deploy && usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# authorized_keys com as 2 chaves públicas (id_ed25519.pub + tamarcado_deploy.pub)
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy:<senha-forte>" | chpasswd    # senha só para sudo; guardada pelo Renato
```
Verificação (obrigatória antes do hardening): `ssh deploy@IP` pelas **duas** chaves +
`sudo whoami` → `root`.

### 4.2 Firewall + fail2ban
```bash
apt-get install -y ufw fail2ban
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw --force enable
# /etc/fail2ban/jail.local -> [sshd] enabled=true maxretry=5 bantime=1h findtime=10m
systemctl enable --now fail2ban
```

### 4.3 Runtime
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs   # Node 20
corepack enable && corepack prepare pnpm@9.15.9 --activate                                # pnpm
npm i -g pm2 && pm2 startup systemd -u deploy --hp /home/deploy                           # PM2 (boot como deploy)
```
Instalados: Node v20.20.2, pnpm 9.15.9, PM2 7.0.3. Serviço de boot: `pm2-deploy.service`.

### 4.4 MySQL 8 (localhost) + db/usuário dedicados
```bash
apt-get install -y mysql-server
# /etc/mysql/mysql.conf.d/mysqld.cnf -> bind-address = 127.0.0.1 ; mysqlx-bind-address = 127.0.0.1
systemctl restart mysql
# root do MySQL usa auth_socket (sudo mysql, sem senha).
mysql <<'SQL'
CREATE DATABASE tamarcado_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tamarcado'@'localhost' IDENTIFIED BY '<senha-forte-gerada>';
GRANT ALL PRIVILEGES ON tamarcado_prod.* TO 'tamarcado'@'localhost';
FLUSH PRIVILEGES;
SQL
```
MySQL 8.0.46, escutando **só em `127.0.0.1:3306`** (confirmado com `ss -ltnp`). Nunca exposto.

### 4.5 Hardening SSH (ÚLTIMO passo)
```bash
cat > /etc/ssh/sshd_config.d/00-tamarcado-hardening.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
CONF
sshd -t && systemctl reload ssh
sshd -T | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication'   # confirmar
```

---

## 5. Variáveis de ambiente de produção

Arquivo: **`/etc/tamarcado/api.env`** (root:deploy, 640). **Nada reaproveitado de dev.**
Segredos gerados no servidor com `openssl rand -hex 32`. Nomes (valores NÃO estão aqui):

| Variável | Observação |
|---|---|
| `NODE_ENV` | `production` (CORS estrito, Swagger off) |
| `PORT` | `3000` |
| `DATABASE_HOST` / `DATABASE_PORT` | `127.0.0.1` / `3306` |
| `DATABASE_USER` / `DATABASE_NAME` | `tamarcado` / `tamarcado_prod` |
| `DATABASE_PASSWORD` | gerada no servidor (só no `.env` + usuário MySQL) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | **novos**, ≠ dev |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `900` / `604800` |
| `CORS_ORIGIN` | **`https://app.tamarcado.tec.br`** (DL-069 — quem chama a API é o painel; a landing page é estática e não fala com a API) |
| `WEB_BASE_URL` | **`https://app.tamarcado.tec.br`** (DL-069 — monta `painelUrl`, `publicUrl` e os links de convite/senha por e-mail; apontar para a raiz mandaria a pessoa para o site institucional) |
| `PLATFORM_KEY` | **nova**, gerada no servidor (`x-platform-key` do `/api/platform/*`) |

**Aposentadas (não usar):** `AUTH_ALLOW_SINGLE_TENANT` (revogada por DL-052; confirmado que
o código não a lê mais), `REDIS_URL` (DL-056), `WHATSAPP_*`/`EVOLUTION_*` (entram no Épico 6).

> **Build do painel (Fase 2):** o front chama a API cross-origin, então o build precisa de
> `VITE_API_URL=https://api.tamarcado.tec.br` (baked no build do web). Sem isso ele tenta
> mesma-origem e quebra.

### 5.1 Usar `/api/platform/*` (provisionar empresa / reset de senha) — só por TÚNEL SSH

Em produção o Nginx **bloqueia `/api/platform/*` para toda a internet** (`deny all` → 403),
**sem exceção de IP** (não há IP fixo residencial — restringir por IP trancaria o Renato fora
quando o IP mudasse). O acesso legítimo é por **túnel SSH** direto na API em `127.0.0.1:3000`,
que **não passa pelo Nginx** (por isso o `deny` não se aplica ao túnel):

1. Abrir o túnel (deixa o terminal rodando):
   ```bash
   ssh -N -L 9443:127.0.0.1:3000 -i ~/.ssh/id_ed25519 deploy@179.198.123.87
   ```
   Encaminha `localhost:9443` do seu PC → `127.0.0.1:3000` do servidor.

2. No **Insomnia** (ou curl), base = `http://localhost:9443` (HTTP puro — o SSH já cifra o túnel):
   ```
   POST http://localhost:9443/api/platform/companies        # provisionar estabelecimento
   POST http://localhost:9443/api/platform/password-reset    # reset de senha por link
   Header em ambos:  x-platform-key: <valor de PLATFORM_KEY do servidor>
   ```
   O `PLATFORM_KEY` está em `/etc/tamarcado/api.env` (ler com `sudo cat`).

3. Fechar o túnel ao terminar (Ctrl-C).

Pela internet (`https://api.tamarcado.tec.br/api/platform/...`) → **403 sempre**. Tentativas
ficam logadas em `/var/log/nginx/platform-denied.log`.

---

## 6. Banco: backup e restauração

- **Backup diário:** cron `/etc/cron.d/tamarcado-backup` → `03:30` roda
  `/usr/local/bin/tamarcado-backup.sh` (mysqldump `--single-transaction`, gzip, em
  `/var/backups/tamarcado/`). **Retenção 14 dias** (`find -mtime +14 -delete`). Roda como
  root via auth_socket (sem senha no script).
- **Restauração testada em 2026-08-11:** dump → banco scratch → dado conferido → drop. ✅
  (o pipeline backup→restore funciona; refazer com dados reais após o 1º deploy).

**Restaurar um backup:**
```bash
sudo su -                                   # ou rodar via sudo
LATEST=$(ls -t /var/backups/tamarcado/*.sql.gz | head -1)
# inspecionar num banco scratch antes de sobrescrever produção:
mysql -e "CREATE DATABASE tamarcado_restore_test"
gunzip < "$LATEST" | sed 's/`tamarcado_prod`/`tamarcado_restore_test`/g' | mysql tamarcado_restore_test
# restaurar EM PRODUÇÃO (cuidado — sobrescreve):
gunzip < "$LATEST" | mysql
```

---

## 7. Deploy (CD) e rollback

**Disparo:** GitHub Actions → workflow **Deploy Production** (`workflow_dispatch`, **manual**,
acionado pelo Renato — DL-060). Build **no Actions**; o servidor **não builda nem tem `.git`**.

### 7.1 O que compõe o pacote de produção — LISTA DE INCLUSÃO (não de exclusão)

**REGRA: no VPS vai SOMENTE o build.** O pacote é montado no Actions com
`pnpm --filter api deploy --prod` (respeita `"files": ["dist"]` de cada package). Contém **só**:

| Inclui | O quê |
|---|---|
| `dist/` | API **compilada** (JS). Nada de `.ts` de fonte (só `.d.ts`, que é saída de build). |
| `node_modules/` | **Apenas deps de PRODUÇÃO**, com `@tamarcado/shared-*` (compilados) injetados. Sem `ts-node`/`typescript`/devDeps. |
| `package.json` | manifesto da API. |
| `ecosystem.config.js` | PM2. |
| `web/` | **estático do front** (build do web) — copiado para `/var/www/tamarcado`. |

**NUNCA vai:** `_bmad`/`_bmad-output` (specs, decision-log, roadmap), `docs`, `DEV.md`, `README`,
testes, `eslint.config`/`tsconfig`, **código-fonte `.ts`**, **devDependencies**, `.git`/histórico,
`infra/` e **qualquer arquivo Docker/compose** (produção é PM2+Nginx; Compose é ferramenta de dev).
A config do Nginx vive em `/etc/nginx`, não em `/opt/tamarcado`.

### 7.2 Fluxo do deploy (ordem OBRIGATÓRIA)

No Actions: `pnpm install` → **build** (web com `VITE_API_URL=https://api.tamarcado.tec.br`) →
`pnpm deploy` (pacote) → rsync para `/opt/tamarcado/releases/<id>/`. No servidor
(`infra/scripts/deploy-remote.sh`, **pipeado por SSH — não fica no servidor**):

1. **Backup do banco** (`sudo -n tamarcado-backup.sh`) — ANTES de tudo.
2. **Migrations** — `typeorm migration:run -d dist/database/typeorm.config.js` (**compilada, sem
   ts-node**; o `migration:run` de dev usa ts-node+`src`, que não existem em produção).
3. **Ativar release** — `ln -sfn releases/<id> current`.
4. **Restart PM2** — `pm2 startOrReload ecosystem.config.js` (cwd = `current`).
5. **Publicar web** — `rsync` de `current/web/` para `/var/www/tamarcado`.
6. **Healthcheck** — `GET :3000/health`. **Se falhar, o job FALHA (sai != 0) e faz AUTO-ROLLBACK**
   para a release anterior (symlink + PM2 + web). Nunca "passa batido".

> **Migration é passo EXPLÍCITO** (mergear PR não roda migration). Já quebrou o login em dev
> (coluna `token_version` ausente → 500). Em produção seria o sistema fora do ar.

### 7.3 Releases e rollback

- Ficam em `/opt/tamarcado/releases/<id>/`; **mantém as 3 últimas**; `current` → a ativa.
- **Rollback manual (1 comando):** `tamarcado-rollback` (instalado em `/usr/local/bin`, fora do
  `/opt/tamarcado`). Aponta `current` para a release anterior, reinicia o PM2 e republica o web.
- Migrations do projeto são **aditivas** → o código anterior roda sobre o schema novo. Se ainda
  assim precisar, **restaure o backup** tirado antes do deploy (§6).

### 7.4 Se o deploy falhar — o que fazer em CADA etapa

| Etapa falhou | Sintoma / onde ver | O que fazer |
|---|---|---|
| **Build (Actions)** | job vermelho em *Build* | erro de compilação/lint — corrigir no código; nada tocou o servidor ainda. |
| **rsync / SSH** | job vermelho em *Enviar/Deploy* | ver `secrets.PROD_SSH_KEY`/`PROD_VPS_HOST`; testar `ssh deploy@IP`; disco cheio? (`df -h`). Produção **intacta** (symlink não trocou). |
| **Backup** | falha em *deploy-remote 1/6* | `sudo -n` sem NOPASSWD? (`/etc/sudoers.d/tamarcado-deploy`); disco cheio? Deploy **aborta antes** de mexer na app. |
| **Migrations** | falha em *3/6* | ver o erro do typeorm; a release **não foi ativada** (symlink não trocou) — produção segue na versão anterior. Corrigir a migration e redisparar. |
| **PM2 não sobe** | *4/6*; `pm2 logs tamarcado-api` | env presente? (`current/.env`); porta 3000 ocupada? (`ss -ltnp`). O healthcheck seguinte falha → **auto-rollback**. |
| **Healthcheck** | *6/6* "HEALTHCHECK FALHOU" | **auto-rollback já rodou** (produção voltou à versão anterior). Investigar a release nova com calma; não está no ar. |
| **Rollback também falhou** | sem release anterior (1ª vez) | último recurso: `pm2 logs`, restaurar backup (§6), e/ou redeploy de uma ref boa. |

---

## 8. Onde ficam os logs

| Serviço | Log |
|---|---|
| API (PM2) | `pm2 logs tamarcado-api` · arquivos em `~deploy/.pm2/logs/` |
| Nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| MySQL | `/var/log/mysql/error.log` |
| SSH/login | `/var/log/auth.log` |
| Fail2ban | `/var/log/fail2ban.log` · `sudo fail2ban-client status sshd` |

---

## 9. Se a API não subir

1. `pm2 status` e `pm2 logs tamarcado-api --lines 100` — ler o erro real.
2. Env presente? `ls -l /opt/tamarcado/apps/api/.env` (deve existir; copiar de `/etc/tamarcado/api.env`).
3. Banco de pé? `systemctl status mysql`; testar login: `mysql -u tamarcado -p tamarcado_prod`.
4. Migrations aplicadas? `pnpm --filter api run migration:run` (idempotente).
5. Porta 3000 ocupada/livre? `ss -ltnp | grep 3000`.
6. Build existe? `ls /opt/tamarcado/apps/api/dist/main.js`.
7. Última opção: **rollback** (§7) para a versão anterior e restaurar o backup pré-deploy.

---

## 10. Pendências / próximas fases

- **Fase 2 — ✅ CONCLUÍDA (2026-08-11):**
  - DNS (registro.br respondendo; delegação p/ Cloudflare vem depois, não invalida o cert já emitido):
    `tamarcado.tec.br` e `api.tamarcado.tec.br` → `179.198.123.87`. **A records na Cloudflare precisam
    ficar "DNS only" (nuvem cinza)** — proxied quebra o Certbot.
  - **Nginx** com os **2 server blocks** (`infra/nginx/`), default removido, `nginx -t` ok.
  - **`/api/platform/*` = `deny all`** — confirmado **403** via HTTPS. Acesso só por túnel SSH (§5.1).
  - **Certbot** emitiu para os 2 nomes (expira ~2026-11-09), redirect HTTP→HTTPS (301), e o
    **`renew --dry-run` passou** ("all simulated renewals succeeded") — renovação automática confirmada.
  - **1º deploy** (11 migrations em `tamarcado_prod`, PM2 online + `pm2 save`, web publicado).
    **Smoke test HTTPS OK:** provisionar → aceitar convite → login por e-mail → `/users/me` →
    `GET /public/{slug}/installation` (200); dado de teste **removido** (prod limpo).
  - ⏳ **PENDENTE (ação do Renato — precisa do aparelho):** **instalar o PWA no celular** por
    `https://tamarcado.tec.br` e validar (tela cheia, ícone, offline mínimo) — pendente desde a 7.1,
    agora possível com HTTPS. E, quando quiser, exercitar o happy-path completo pela UI
    (criar agendamento + confirmar pendente — já coberto pelos e2e no CI).
  - ⏳ **Rotacionar a senha de sudo do `deploy`** (a de setup circulou no chat): `ssh` como deploy e
    `sudo passwd deploy`.
- **Fase 3 (CD) — ✅ CONCLUÍDA (no `main` e no `dev`; CD validado ponta a ponta em 2026-08-12):**
  `ci.yml` (PRs em `[main, dev]`, redis/AUTH_ALLOW_SINGLE_TENANT removidos), `deploy.yml`
  (`workflow_dispatch` **amarrado ao main**, build no Actions + `pnpm deploy` + rsync +
  `deploy-remote.sh`), `rollback.sh`, `ecosystem.config.js` → `current`, e o **pacote de inclusão**
  (§7.1). Secrets `PROD_VPS_HOST`/`PROD_SSH_KEY` configurados. **2 deploys via workflow_dispatch
  rodaram verdes**; o 2º confirmou que a estrutura limpa re-aponta o `current` e o PM2 e mantém a
  release anterior para rollback.
  - ✅ **Preparo do servidor feito:** `rsync` instalado; `/etc/sudoers.d/tamarcado-deploy`
    (`deploy ALL=(root) NOPASSWD: /usr/local/bin/tamarcado-backup.sh`, 440) — testado (backup sem
    senha OK, resto pede senha); `tamarcado-rollback` em `/usr/local/bin` (750).
  - ✅ **LIMPEZA do `/opt/tamarcado` feita (2026-08-12):** removido todo o layout antigo do 1º deploy
    (fonte, `_bmad`/`_bmad-output`, `docs`, `infra`, `node_modules` com devDeps, configs, Docker) —
    **~601 MB liberados** (746M → 145M). Restou **só** `releases/` + `current` (§3). Validado após:
    healthcheck + login real (HTTPS) + link público 200.

---

## 11. E-mail transacional (Brevo) — DNS e configuração

O canal de e-mail entrega **recuperação de senha** e **convite de equipe**
(DL-070). Envio pela **API HTTP** do Brevo — não SMTP (o porquê está no
`mail.service.ts`; em resumo: sem dependência nova, sem depender de porta de
saída, erro legível).

> **✅ NO AR desde 2026-08-26.** Testado em produção de ponta a ponta: pedido
> pela tela de login → e-mail recebido (remetente `contato@tamarcado.tec.br`) →
> link aberto → senha redefinida. **Fecha a pendência "recuperação de senha por
> e-mail" que era bloqueador antes de vender** (epics.md, Story 1.2.03).

**Configuração de DNS APLICADA** (consultada, não suposta):

| Registro | Estado |
|---|---|
| TXT raiz (verificação Brevo) | `brevo-code:5f47b5821f6a1da8886cbef0850f4f54` ✅ |
| CNAME `brevo1._domainkey` | → `b1.tamarcado-tec-br.dkim.brevo.com` ✅ |
| CNAME `brevo2._domainkey` | → `b2.tamarcado-tec-br.dkim.brevo.com` ✅ |
| SPF (TXT raiz) | `v=spf1 include:_spf.mx.cloudflare.net ~all` — **NÃO alterado** |
| DMARC (TXT `_dmarc`) | `v=DMARC1; p=reject;` — **NÃO alterado** |
| MX | `route1/2/3.mx.cloudflare.net` (Email Routing) |

Todos em **DNS only** (nuvem cinza).

> **Por que não mexer no SPF nem no DMARC foi o certo:** o Brevo não pediu SPF
> porque o envelope-from das mensagens é de um domínio **dele** — o nosso SPF
> nem entra na avaliação. E o `p=none` que o Brevo sugere é **mais permissivo**
> que o nosso `p=reject`: baixar a política seria piorar a proteção do domínio
> sem ganho nenhum. **Quem sustenta a entrega é o DKIM alinhado** (§11.3), que
> os dois CNAME acima habilitam.

### 11.1 O que fazer no painel do Brevo

1. **Criar a conta** em brevo.com (o plano gratuito envia 300 e-mails/dia — bem
   acima do nosso volume: reset de senha e convite são eventos raros).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain** e informar
   `tamarcado.tec.br`. Escolher **"I own this domain"** e autenticar.
3. O Brevo mostra os registros DKIM/Brevo-code. **Copiar os valores exatos** —
   os nomes abaixo são os padrões dele, mas confirme na tela, porque o seletor
   DKIM muda de conta para conta.
4. **Senders → Add a sender**: `contato@tamarcado.tec.br`, nome `Tamarcado`.
   Como o domínio está autenticado, não é preciso confirmar por e-mail.
5. **SMTP & API → API Keys → Generate a new API key**. Guardar no gerenciador de
   senhas e colocar em `/etc/tamarcado/api.env` como `BREVO_API_KEY`.
   Depois: `pm2 restart tamarcado-api --update-env`.
6. ⚠️ **AUTORIZAR OS IPs DO SERVIDOR** — passo obrigatório, e o que mais custou
   tempo no primeiro setup. Ver **§11.5**.

### 11.2 Registros para colar na Cloudflare

⚠️ **Todos com a nuvem CINZA (DNS only).** Registro de e-mail proxied não
funciona.

**1. SPF — EDITAR o registro existente, NUNCA criar um segundo.**

```
Tipo: TXT   Nome: @   (ou tamarcado.tec.br)
Valor: v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
```

> **Dois registros SPF separados INVALIDAM os dois** (RFC 7208) — e aí cai em
> spam até o e-mail que hoje funciona. É **um** TXT com os dois `include:`.
> Confirme o domínio do include na tela do Brevo (costuma ser `spf.brevo.com`;
> contas antigas usam `spf.sendinblue.com`).

**2. DKIM — registros PRÓPRIOS, sem conflito com nada.** Os valores saem da tela
do Brevo; a forma é esta:

```
Tipo: TXT   Nome: mail._domainkey     Valor: k=rsa; p=<chave pública do Brevo>
Tipo: TXT   Nome: <código>._domainkey Valor: <valor que o Brevo mostrar>
```

**3. Verificação do domínio** — o Brevo pede um TXT `brevo-code`:

```
Tipo: TXT   Nome: @   Valor: brevo-code:<código da sua conta>
```

> Este é um TXT normal e **não** conflita com o SPF: a regra de registro único
> vale só para valores que começam com `v=spf1`.

### 11.3 DMARC em `p=reject` — por que passa mesmo assim

A política do domínio é a mais rígida que existe: e-mail que falha na validação
é **rejeitado no destino**, não vai para spam. O que faz o envio pelo Brevo
passar é o **DKIM alinhado**.

- O Brevo assina cada mensagem com DKIM usando **`d=tamarcado.tec.br`** (é o que
  a autenticação de domínio do §11.1 configura). DKIM alinhado com o `From:` já
  **satisfaz o DMARC sozinho** — a especificação exige SPF **ou** DKIM, não os dois.
- O SPF provavelmente **não** vai alinhar, e isso é normal: o envelope-from (o
  `Return-Path`, usado para bounce) é de um domínio do Brevo, não do nosso. Por
  isso o `include:spf.brevo.com` ajuda na reputação, mas **quem carrega o DMARC
  aqui é o DKIM**.
- **Consequência prática:** se a autenticação de domínio no Brevo não for
  concluída (DKIM ausente ou não verificado), com `p=reject` o e-mail **não
  chega** — nem para o spam. Concluir o §11.1 é obrigatório antes de contar com
  o canal.

**Conferir depois de configurar** (antes de confiar no fluxo real):

```bash
dig +short TXT tamarcado.tec.br        # UM registro v=spf1, com os dois include
dig +short TXT _dmarc.tamarcado.tec.br
dig +short TXT mail._domainkey.tamarcado.tec.br
```

Na mensagem recebida, abrir "mostrar original" (Gmail) e conferir:
`DKIM: 'PASS' with domain tamarcado.tec.br` e `DMARC: 'PASS'`.

**Melhoria opcional:** hoje o DMARC não tem `rua`, então não recebemos relatório
de quem está falhando. Vale acrescentar
`v=DMARC1; p=reject; rua=mailto:contato@tamarcado.tec.br;` para enxergar
problemas antes de o cliente reclamar.

### 11.4 ⚠️ A chave da API do Brevo EXPIRA — inclusive por falta de uso

Duas validades, e a segunda é a perigosa:

| Prazo | O que acontece |
|---|---|
| **1 ano** | validade normal da chave |
| **90 dias sem NENHUMA chamada** | a chave é **desativada por inatividade** |

**Por que isso é risco real aqui:** recuperação de senha e convite de equipe são
eventos **raros** — no começo, podem passar meses sem um único envio. A chave
morre sozinha, ninguém percebe, e o próximo pedido de senha falha em silêncio
para quem está do outro lado.

**A prevenção e a detecção são a mesma coisa: tocar a API de vez em quando.**
Uma chamada qualquer conta como uso. O endpoint `/v3/account` serve: é leve,
**não envia e-mail** e responde 200 quando a chave está viva.

Instalar como cron **mensal** no servidor (como `deploy`):

```bash
sudo tee /usr/local/bin/tamarcado-brevo-keepalive.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
# Mantém a chave do Brevo viva (expira com 90 dias de inatividade) E avisa se
# ela já morreu. NÃO envia e-mail: só consulta a conta.
set -uo pipefail
KEY="$(grep -E '^BREVO_API_KEY=' /etc/tamarcado/api.env | cut -d= -f2-)"
[ -n "$KEY" ] || { logger -t tamarcado-brevo "SEM BREVO_API_KEY no api.env"; exit 1; }
STATUS="$(curl -s -o /dev/null -w '%{http_code}' -m 15   -H "api-key: $KEY" -H 'accept: application/json'   https://api.brevo.com/v3/account)"
if [ "$STATUS" = "200" ]; then
  logger -t tamarcado-brevo "chave OK (200)"
else
  logger -t tamarcado-brevo "ATENÇÃO: chave do Brevo respondeu $STATUS — envio de e-mail provavelmente PARADO"
fi
EOF
sudo chmod 750 /usr/local/bin/tamarcado-brevo-keepalive.sh
# dia 1 de cada mês, 04:10
( sudo crontab -l 2>/dev/null; echo "10 4 1 * * /usr/local/bin/tamarcado-brevo-keepalive.sh" ) | sudo crontab -
```

Conferir depois:

```bash
sudo /usr/local/bin/tamarcado-brevo-keepalive.sh   # rodar na mão uma vez
journalctl -t tamarcado-brevo -n 5                 # ver o resultado
```

**A falha nunca é silenciosa no app.** O `MailService` registra o motivo com o
destinatário sempre que o envio não sai (ver `mail.service.ts`). Chave morta
aparece assim no log da API:

```
Brevo recusou o envio: status=401 to=... corpo={"code":"unauthorized",...}
  -> a chave expirou, foi revogada ou está errada: gerar outra no painel do
     Brevo, atualizar /etc/tamarcado/api.env e `pm2 restart tamarcado-api --update-env`
```

Para procurar depois de uma reclamação de "não recebi o e-mail":

```bash
pm2 logs tamarcado-api --lines 500 --nostream | grep -iE "Brevo recusou|falha ao enviar|e-mail NÃO enviado"
```

> **Não confie no aviso do provedor.** O Brevo pode ou não avisar antes de
> desativar por inatividade, e o e-mail dele cairia na caixa do Renato entre
> outros — o cron acima não depende disso.

### 11.5 ⚠️ IPs autorizados no Brevo — o 401 que parece chave errada

O Brevo **bloqueia chamadas de IP não autorizado**. Isso apareceu no primeiro
setup como um **401** — o mesmo código de chave inválida — com a mensagem:

```
"unrecognised IP address"
```

E o endereço reclamado era o **IPv6** do servidor (`2a02:4780:6e:7be8::1`), não
o IPv4. **Cadastrar só o IPv4 não resolve:** o Node escolhe a família do
endereço na resolução DNS e, num servidor com IPv6 ativo, a saída para
`api.brevo.com` costuma ir por IPv6.

**Autorizar OS DOIS**, em `app.brevo.com/security/authorised_ips`:

| Família | Endereço |
|---|---|
| IPv4 | `179.198.123.87` |
| IPv6 | `2a02:4780:6e:7be8::1` |

**Como descobrir os endereços de saída num servidor novo** (é o que o Brevo vê,
não o que está na interface de rede):

```bash
curl -4 -s https://api.ipify.org   ; echo    # IPv4 de saída
curl -6 -s https://api64.ipify.org ; echo    # IPv6 de saída
```

**Como o sintoma aparece no log da API:**

```
Brevo recusou o envio: status=401 to=... corpo={"message":"unrecognised IP address","code":"unauthorized"}
```

> **Cuidado com o diagnóstico:** 401 aqui tem **duas causas possíveis** — chave
> expirada/errada (§11.4) e IP não autorizado (esta seção). **Leia o `corpo=` do
> log**: `"unrecognised IP address"` é IP; qualquer outra coisa é a chave. Sem
> ler o corpo, é fácil gerar chave nova atrás de chave nova sem resolver nada.
>
> Vale revisar a lista de IPs autorizados **sempre que o servidor mudar de IP**
> (troca de VPS, migração, IPv6 dinâmico do provedor) — o envio para no mesmo
> instante, com o mesmo 401.

## 12. Landing page e separação de endereços (DL-069) — PROCEDIMENTO

Migração da raiz: `tamarcado.tec.br` passa a servir a **landing page** e o
painel vai para **`app.tamarcado.tec.br`**. Feita **antes de existir cliente com
link divulgado** — depois, mudar quebraria link em bio de Instagram e material
impresso de terceiros.

**Estado: ✅ NO AR (2026-08-25).** `tamarcado.tec.br` serve a landing page,
`app.tamarcado.tec.br` serve o painel, ambos com HTTPS. A ordem abaixo é a que
funcionou — **três passos não estavam previstos na primeira versão deste
runbook e quebraram o deploy**; estão marcados com ⚠️.

### 12.1 Ordem de execução em servidor NOVO (não pular etapa)

1. **DNS na Cloudflare** — `A  app  →  179.198.123.87`, **DNS only** (nuvem
   cinza; proxied quebra o Certbot). Confirmar antes de seguir:
   ```bash
   dig +short app.tamarcado.tec.br      # tem de devolver 179.198.123.87
   ```

2. ⚠️ **Criar os diretórios do Nginx COM DONO, antes do deploy.** `/var/www`
   pertence ao root: sem isto o deploy morre no passo "publicar web" com
   `mkdir: cannot create directory '/var/www/tamarcado-lp': Permission denied`
   — e já depois de ter rodado backup e migrations.
   ```bash
   sudo mkdir -p /var/www/tamarcado /var/www/tamarcado-lp
   sudo chown -R deploy:deploy /var/www/tamarcado /var/www/tamarcado-lp
   ```
   > O `deploy-remote.sh` hoje **checa isso no começo** e falha com esta
   > instrução na tela, antes de tocar no banco. A preparação continua manual.

3. **Deploy** (`workflow_dispatch` do `deploy.yml`) — publica o painel em
   `/var/www/tamarcado` e a landing page em `/var/www/tamarcado-lp`. Fazer
   **antes** de trocar as confs: assim, quando o Nginx passar a apontar para a
   LP, o conteúdo já está lá (senão a raiz responde 404).

4. ⚠️ **Copiar as DUAS confs — a do `app` E a da RAIZ.** Copiar só a do `app`
   deixa a raiz com a conf antiga (de 11/08), que ainda serve o **painel**: o
   site não aparece e `tamarcado.tec.br/login` não redireciona.
   ```bash
   # do seu PC, com a branch que tem as confs:
   scp -i ~/.ssh/id_ed25519 infra/nginx/app.tamarcado.tec.br.conf        infra/nginx/tamarcado.tec.br.conf deploy@179.198.123.87:/tmp/

   # no servidor:
   sudo cp /tmp/app.tamarcado.tec.br.conf /tmp/tamarcado.tec.br.conf /etc/nginx/sites-available/
   sudo ln -sfn /etc/nginx/sites-available/app.tamarcado.tec.br.conf /etc/nginx/sites-enabled/
   sudo ln -sfn /etc/nginx/sites-available/tamarcado.tec.br.conf     /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   > As confs vivem no repo mas **não** são copiadas pelo CD: o pacote de deploy
   > é uma lista de inclusão e **não leva `infra/`** (§7.1). Cópia manual é o
   > esperado — e é fácil esquecer metade.

5. ⚠️ **Certbot para os DOIS nomes, com `--redirect`.** As confs do repo têm só
   `listen 80`; o bloco 443 é o Certbot que escreve. Sem isso, o HTTPS do nome
   cai no `default_server` — foi assim que `https://tamarcado.tec.br` chegou a
   responder `{"message":"Cannot GET /"}`, que é a **API** atendendo por engano.
   ```bash
   sudo certbot --nginx -d app.tamarcado.tec.br --redirect
   sudo certbot --nginx -d tamarcado.tec.br     --redirect
   sudo certbot renew --dry-run
   ```
   **Se o certificado já existe** (emitido antes, instalação falhou), use
   `install` em vez de emitir de novo — não gasta rate limit:
   ```bash
   sudo certbot install --nginx --cert-name app.tamarcado.tec.br
   ```

6. **Env de produção** — em `/etc/tamarcado/api.env` (§5):
   ```
   CORS_ORIGIN=https://app.tamarcado.tec.br
   WEB_BASE_URL=https://app.tamarcado.tec.br
   ```
   Depois: `pm2 restart tamarcado-api --update-env`.

7. **Validar:**
   ```bash
   curl -I https://app.tamarcado.tec.br/login     # 200, cert válido
   curl -I https://tamarcado.tec.br/              # 200, landing page
   curl -I https://tamarcado.tec.br/login         # 301 -> app.tamarcado.tec.br/login
   curl -I https://tamarcado.tec.br/sw.js         # 404 (proposital, §12.2)
   curl -sI https://tamarcado.tec.br/README.md    # 403 — nota interna não vai para a web
   curl -s  https://tamarcado.tec.br/google<hash>.html   # verificação do Search Console
   ```
   Pela UI: entrar no painel por `app.`, e provisionar/consultar uma empresa para
   conferir que `painelUrl` e `publicUrl` saem com `app.` (§5.1, túnel SSH).

### 12.1.1 Certificados duplicados — atenção na renovação

Rodar `certbot --nginx -d tamarcado.tec.br` quando **já existia** um certificado
para esse nome faz o Certbot criar um **segundo** lineage,
`tamarcado.tec.br-0001`, em vez de reaproveitar o primeiro. Foi o que aconteceu
em 2026-08-25. Funciona, mas os dois passam a renovar sozinhos, dobrando as
chamadas à Let's Encrypt para o mesmo domínio.

```bash
sudo certbot certificates      # ver os lineages, os DOMÍNIOS de cada um e qual está instalado
```

⚠️ **Antes de apagar qualquer um, confira a lista de domínios.** O certificado
original da fase 2 pode ser um **SAN cobrindo `tamarcado.tec.br` E
`api.tamarcado.tec.br`** — apagá-lo derrubaria o HTTPS da API. Só remova o
lineage que (a) não está referenciado por nenhum `ssl_certificate` em
`/etc/nginx` e (b) não cobre nenhum outro nome em uso:

```bash
grep -rn "ssl_certificate" /etc/nginx/sites-enabled/     # quem usa o quê
sudo certbot delete --cert-name <lineage-orfão>
sudo certbot renew --dry-run
```

**Para não repetir:** emitir com `--cert-name` explícito, ou usar
`certbot install` quando o certificado já existe.

### 12.2 PWA — quem já instalou precisa reinstalar

**Origem diferente é outro aplicativo para o navegador. Não existe migração
automática.** O PWA instalado hoje aponta para `tamarcado.tec.br`: depois da
mudança, abrir pelo ícone cai na **landing page**, não no sistema.

O que o código já faz por conta própria:

- **A landing page desregistra o service worker antigo** da origem raiz e limpa
  os caches (script inline no `<head>` do `index.html`) — senão o SW velho pode
  interceptar requisições e servir pedaços do app por cima do site.
- **O Nginx devolve 404** em `/sw.js`, `/registerSW.js` e `/manifest.webmanifest`
  na raiz. O 404 é proposital: é o que faz o navegador **descartar** o registro
  na próxima verificação.
- **`start_url` e `scope` do manifest são relativos** (`/`), então o manifest, o
  escopo do SW e os ícones passam a viver em `app.` sem alteração de build.

O que **precisa ser feito à mão** (hoje só afeta o Renato — nenhum cliente tem o
app instalado):

1. **Desinstalar** o PWA antigo (Android: manter pressionado o ícone →
   Desinstalar; iOS: manter pressionado → Remover app).
2. Abrir **`https://app.tamarcado.tec.br`** no navegador do celular e instalar
   de novo (Android/Chrome: menu → *Adicionar à tela inicial*; iOS/Safari:
   Compartilhar → *Adicionar à Tela de Início*).
3. **Conferir:** abrir pelo ícone e ver o **painel** (a tela de login), em modo
   **standalone** — tela cheia, sem a barra de endereço do navegador.

> Se o ícone antigo abrir a landing page, é porque o PWA velho continua
> instalado: desinstale e repita. Se o ícone novo abrir **com** barra de
> endereço, o manifest não foi lido — confira `https://app.tamarcado.tec.br/manifest.webmanifest`
> (deve responder 200) antes de investigar qualquer outra coisa.

---

## 14. Deploy MANUAL (contingência) — quando o Actions não roda

Use quando o **CD estiver indisponível** — cota de minutos estourada (§13),
incidente do GitHub, ou qualquer motivo que impeça o `Deploy Production`.

O procedimento **reproduz exatamente o que o CD faz**: o build acontece **na sua
máquina** (o servidor não builda — §3) e o passo remoto é o **mesmo
`deploy-remote.sh`** do CD, com backup → migrations → symlink → PM2 →
healthcheck → **auto-rollback** se o healthcheck falhar.

> **Este pacote pode ser montado no Windows** — mas **só com
> `--node-linker=hoisted`** no `pnpm deploy` (§14.1). Sem essa flag o deploy
> falha no passo 3/6; o porquê está no §14.7, e vale ler antes de "consertar"
> por conta própria.
>
> Nenhuma dependência de produção da API tem binário nativo (`.node`) — são
> todas JS puro, inclusive `bcryptjs` e `mysql2` — então o pacote montado no
> Windows roda no Linux.

### 14.0 Antes: o código precisa estar no `main`

Produção sai **só do `main`** (DL-059). Merge do PR de trabalho em `dev`, depois
o PR `dev → main`.

> ⚠️ **Não há branch protection no `main`** (§15 explica por quê): nada no
> GitHub barra o merge com o CI vermelho ou cortado. A conferência é sua — rode
> a suíte local antes (`pnpm run lint && pnpm run typecheck && pnpm run test`),
> que é o mesmo que o job `checks` faria.

### 14.1 Build e empacotamento (na sua máquina)

```bash
cd /c/Users/renat/Documents/AgendamentosServicos
git checkout main && git pull

# a suíte que o CI rodaria
pnpm install --frozen-lockfile
pnpm run lint && pnpm run typecheck && pnpm run test

# build com a API pública embutida (o front chama api.tamarcado.tec.br)
VITE_API_URL=https://api.tamarcado.tec.br pnpm -r build

# pacote de produção — MESMA lista de inclusão do CD (§7.1)
PKG=../tamarcado-pkg          # caminho RELATIVO: o pnpm no Windows resolve
rm -rf "$PKG"                 # caminho absoluto estilo /c/... de forma errada

# --node-linker=hoisted é OBRIGATÓRIO aqui (§14.7): monta node_modules sem
# symlink, do jeito clássico. Sem ele, o pacote sai com links e wrappers
# apontando para caminhos DA SUA MÁQUINA, e o deploy morre no passo 3/6.
pnpm --filter api deploy --prod --node-linker=hoisted "$PKG"

cp ecosystem.config.js "$PKG/"
mkdir -p "$PKG/web"     && cp -r apps/web/dist/. "$PKG/web/"
mkdir -p "$PKG/landing" && cp -r apps/landing/. "$PKG/landing/"
find "$PKG/landing" -name "*.md" -delete     # nota interna não vai para a web

ls -1 "$PKG"     # deve listar: dist ecosystem.config.js landing node_modules package.json web
ls "$PKG/dist/main.js"                        # a API compilada tem de estar aqui
```

**Conferência que evita descobrir o problema no meio do deploy** — as duas
devem sair **vazias**:

```bash
# nenhum symlink no pacote
find "$PKG" -type l | head

# nenhum caminho da sua máquina dentro dos wrappers de linha de comando
grep -rlE '/mnt/c/|/tmp/|[A-Za-z]:\' "$PKG/node_modules/.bin/" | head
```

*(Os dois comandos foram testados contra um pacote montado **sem** a flag: eles
apontam o problema. Contra o pacote correto, não imprimem nada.)*

> Avisos do pnpm sobre `Failed to create bin ... .EXE` no Windows são **normais**
> e não afetam o pacote: são atalhos de linha de comando que produção não usa.

### 14.2 Enviar para o servidor

O CD usa `rsync`, que **não existe no Git Bash**. Aqui vai por `tar` + `ssh`, que
já está instalado (o pacote comprime para ~21 MB):

```bash
REL="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short=7 HEAD)"
HOST=179.198.123.87
echo "release: $REL"

ssh -i ~/.ssh/id_ed25519 deploy@$HOST "mkdir -p /opt/tamarcado/releases/$REL"
tar -czf - -C "$PKG" . \
  | ssh -i ~/.ssh/id_ed25519 deploy@$HOST "tar -xzf - -C /opt/tamarcado/releases/$REL"

# conferir que chegou inteiro
ssh -i ~/.ssh/id_ed25519 deploy@$HOST "ls -1 /opt/tamarcado/releases/$REL"
```

### 14.3 Ativar a release (é o script do CD, sem alteração)

```bash
ssh -i ~/.ssh/id_ed25519 deploy@$HOST "bash -s -- $REL" < infra/scripts/deploy-remote.sh
```

O script faz, nesta ordem: **backup do banco** → copia o env de produção →
**migrations** → troca o symlink `current` → `pm2 startOrReload` → **healthcheck**.
Se o healthcheck falhar, ele **volta sozinho** para a release anterior e sai com
erro. A saída mostra cada passo (`==> 1/6`, `2/6`, …).

> O backup é o **mesmo** do CD (`tamarcado-backup.sh`, via `sudo` sem senha) e
> roda **antes** de qualquer migration. Não pule este passo executando os
> comandos à mão: a ordem é o que protege o banco.

### 14.4 Validar

```bash
curl -fsS https://api.tamarcado.tec.br/health          # {"status":"ok"}
curl -I  https://app.tamarcado.tec.br/login            # 200
curl -I  https://tamarcado.tec.br/                     # 200 (landing page)
```

E a mudança em si, pela UI.

### 14.5 Se algo falhar

| Sintoma | O que fazer |
|---|---|
| Healthcheck falhou | O script **já reverteu** — leia a saída, corrija e repita o 14.1–14.3 |
| Deu certo, mas a versão está ruim | `ssh deploy@$HOST tamarcado-rollback` (volta a release anterior num comando) |
| Migration corrompeu dado | Restaurar o backup pré-deploy — §6. As migrations do projeto são **aditivas**, então o código anterior costuma rodar sobre o schema novo |
| `Permission denied` em `/var/www` | §12.1 passo 2 — `sudo chown -R deploy:deploy` nos dois diretórios |

### 14.6 Depois

```bash
rm -rf ../tamarcado-pkg     # o pacote local não serve para mais nada
```

O servidor mantém as **3 últimas releases** (o próprio script limpa), então o
rollback continua disponível.

### 14.7 Por que `--node-linker=hoisted` — e por que `--dereference` NÃO resolve

Aconteceu de verdade no primeiro uso: o deploy parou no **passo 3/6
(migrations)** com `MODULE_NOT_FOUND`. Produção continuou na versão anterior —
o script para antes de trocar o symlink `current`.

**Duas coisas vinham contaminadas com caminhos da máquina local**, e é preciso
resolver **as duas**:

1. **O symlink era ABSOLUTO.** O pnpm no Git Bash gerou:

   ```
   node_modules/typeorm -> /tmp/claude/…/pkg/node_modules/.pnpm/typeorm@0.3.30…/node_modules/typeorm
   ```

   O alvo **estava** dentro do pacote, mas o link apontava para o caminho
   absoluto local, que no servidor não existe.

2. **O wrapper `node_modules/.bin/typeorm` trazia `NODE_PATH` absoluto:**

   ```sh
   export NODE_PATH="/mnt/c/Users/renat/…/pkg/node_modules/.pnpm/typeorm@…/node_modules:…"
   ```

   Caminho de WSL, escrito **dentro** do script.

> **Por isso `tar --dereference` não resolveria.** Ele copiaria o conteúdo no
> lugar do link (item 1), mas o wrapper do item 2 continuaria com o `NODE_PATH`
> apontando para `/mnt/c/Users/renat/…`. O deploy quebraria de novo, e de forma
> mais confusa — com um pacote bem maior.

**`--node-linker=hoisted`** resolve os dois: instala `node_modules` do jeito
clássico, sem `.pnpm` e sem links. Verificado no pacote gerado:

| | sem a flag | com `--node-linker=hoisted` |
|---|---|---|
| `node_modules/typeorm` | symlink absoluto | **diretório de verdade** |
| symlinks no pacote | vários | **0** |
| `.bin/typeorm` | 1.754 B, com `/mnt/c/Users/…` | **280 B, tudo relativo** |
| pacote comprimido | 21 MB | **20 MB** |

E testado do jeito que importa: extraindo o `.tar.gz` em outro diretório
(simulando o servidor) e rodando `./node_modules/.bin/typeorm --help` de lá — o
CLI responde, que é exatamente o que o passo 3/6 precisa.

> **No CD isso nunca apareceu** porque o pacote é montado no **Ubuntu** do
> runner, onde o pnpm gera links relativos e wrappers sem `NODE_PATH` absoluto.
> É um problema de **montar no Windows**, não do projeto.

### O que este procedimento NÃO cobre

- **Não valida o que o CI validaria** além do que você rodar à mão no 14.1. O
  `e2e` exige MySQL: se quiser rodá-lo local, `pnpm --filter api run test:e2e`
  com a infra de dev no ar.
- **Não substitui o CD.** Assim que o Actions voltar, use o `Deploy Production`
  (`workflow_dispatch`): ele carimba a release com o SHA, guarda o log e não
  depende da sua máquina estar do jeito certo.
## 13. CI — cota de minutos do GitHub Actions

**O repositório é privado**, e repositório privado **consome minutos** da cota
mensal da conta em cada job que roda. Quando a cota acaba — ou quando um
pagamento falha, ou o *spending limit* está em zero — o GitHub **para de iniciar
os jobs**.

### Como o sintoma aparece

Não é teste quebrado. É isto:

- **todos** os jobs falham em **3 a 5 segundos**;
- nenhum passo aparece no job (`steps: []`);
- falha também em branches sem relação com a mudança — inclusive um push direto
  em `dev`;
- a anotação do run diz:

```
The job was not started because recent account payments have failed or your
spending limit needs to be increased. Please check the 'Billing & plans'
section in your settings
```

Para confirmar em um comando:

```bash
gh run view <run-id>          # a anotação aparece em ANNOTATIONS
gh run list --limit 10        # se TUDO falhou a partir de um horário, é cota
```

> **Regra de bolso:** suíte que falha em segundos, sem log de teste nenhum, e em
> mais de uma branch ao mesmo tempo, é **cota** — não código. Procurar bug aí é
> perder a tarde.

### Onde resolver

*Settings → Billing & plans* da conta dona do repositório: conferir se há
pagamento recusado e se o limite de gastos de Actions comporta o mês.

### O que o projeto faz para gastar menos

- **Gatilho sem duplicar** (2026-08-26): antes, `push` em `"**"` **mais**
  `pull_request` faziam cada commit de uma branch com PR aberto rodar a suíte
  **duas vezes**. Agora `pull_request` cobre o trabalho (é o check que vale antes
  do merge) e `push` roda só em `main` e `dev`, para cobrir o resultado do merge.
- **`concurrency` com `cancel-in-progress`**: três commits seguidos na mesma
  branch não rodam três suítes até o fim — só a do commit mais novo.
- **Trade-off consciente do e2e:** o e2e roda em **3 shards paralelos**. Isso
  derruba o tempo de parede (~4,5 min → ~1,5 min), mas **cada shard é um job** e
  os minutos contam por job. Se a cota voltar a apertar, reduzir os shards é o
  primeiro lugar a mexer — custa tempo de espera, não cobertura.

---

## 15. Proteção do `main` — o que existe e o que não

`main` é produção: é dela que sai o deploy (DL-059), e ela deve receber **só** o
PR de implantação vindo de `dev`. O que garante isso, hoje, é um hook local —
não o GitHub.

### O que NÃO temos: branch protection

O repositório é **privado**, e no **plano gratuito** as regras de proteção de
branch (exigir PR, exigir check verde, impedir push direto) **não estão
disponíveis** para repositório privado. Consequências práticas:

- **nada no servidor do GitHub impede um `git push origin main`**;
- **nada exige o CI verde** para mergear — o §14.0 depende de disciplina, não de
  trava;
- as duas coisas só mudam tornando o repositório público ou assinando um plano
  pago. Enquanto isso, a proteção é a de baixo, e ela vale **só nesta máquina**.

### O que temos: hook de `pre-push` (2026-08-27)

Instalado em `.git/hooks/pre-push`, bloqueia o push antes de ele sair da
máquina:

```
BLOQUEADO: push direto no main. Use branch + PR.
```

> Se aparecer isso, **não é credencial nem rede.** É o hook. Saia para uma
> branch a partir de `dev`, empurre ela, e abra o PR.

**Por que o hook existe.** O repositório volta para o `main` depois de cada
merge de PR, e o commit seguinte cai lá sem ninguém perceber — aconteceu duas
vezes no mesmo dia (27/08/2026). Uma delas virou push, e a correção foi um
`git revert` na `main` (nunca `--force`: é a branch de onde sai o deploy).

**Hooks não são versionados.** `.git/hooks/` não vai no clone. Em máquina nova,
ou depois de um clone limpo, o hook **não existe** — recrie:

```bash
cat > .git/hooks/pre-push <<'HOOK'
#!/bin/sh
# Bloqueia por DESTINO: pega tanto o push estando no main quanto
# `git push origin <branch>:main` a partir de outra branch.
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "BLOQUEADO: push direto no main. Use branch + PR."
    exit 1
  fi
done
exit 0
HOOK
chmod +x .git/hooks/pre-push
```

**Lacuna do hook instalado hoje:** ele decide pela **branch atual**
(`git rev-parse --abbrev-ref HEAD`), não pelo destino. Isso cobre o caso que
motivou sua criação — estar no `main` e empurrar —, mas deixa passar
`git push origin minha-branch:main` feito de outra branch. A versão acima, por
destino, cobre os dois; é o mesmo critério do `pre-push.off` que já estava na
máquina.

**Para desligar temporariamente** (só com motivo, e religue depois):

```bash
mv .git/hooks/pre-push .git/hooks/pre-push.off    # desliga
mv .git/hooks/pre-push.off .git/hooks/pre-push    # religa
```

`git push --no-verify` também pula o hook — o que significa que ele é uma rede
de proteção contra descuido, não uma trava de segurança.
