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

**Estado do DNS em 2026-08-26** (consultado, não suposto):

| Registro | Valor hoje |
|---|---|
| SPF (TXT na raiz) | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| DMARC (TXT em `_dmarc`) | `v=DMARC1; p=reject;` |
| MX | `route1/2/3.mx.cloudflare.net` (Email Routing) |

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

## 12. Landing page e separação de endereços (DL-069) — PROCEDIMENTO

Migração da raiz: `tamarcado.tec.br` passa a servir a **landing page** e o
painel vai para **`app.tamarcado.tec.br`**. Feita **antes de existir cliente com
link divulgado** — depois, mudar quebraria link em bio de Instagram e material
impresso de terceiros.

**Estado em 2026-08-25:** o código e as configs estão no repositório; os passos
abaixo **ainda não foram executados** (`app.tamarcado.tec.br` responde
`NXDOMAIN` — o registro DNS nunca chegou a ser criado, apesar de a fase 2 tê-lo
dado como reservado). Nada aqui roda pelo CD: exige DNS, `sudo` e Certbot.

### 12.1 Ordem de execução (não pular etapa)

1. **DNS na Cloudflare** — criar `A  app  →  179.198.123.87`, **DNS only**
   (nuvem cinza). Proxied quebra o Certbot. Conferir antes de seguir:
   ```bash
   dig +short app.tamarcado.tec.br      # tem de devolver 179.198.123.87
   ```

2. **Nginx — publicar os dois server blocks** (como `deploy`, sudo pede senha):
   ```bash
   sudo cp /caminho/do/repo/infra/nginx/app.tamarcado.tec.br.conf /etc/nginx/sites-available/
   sudo cp /caminho/do/repo/infra/nginx/tamarcado.tec.br.conf     /etc/nginx/sites-available/
   sudo ln -sfn /etc/nginx/sites-available/app.tamarcado.tec.br.conf /etc/nginx/sites-enabled/
   sudo mkdir -p /var/www/tamarcado-lp        # LP ainda vazia neste ponto
   sudo nginx -t && sudo systemctl reload nginx
   ```
   > As confs vivem no repo, mas **não** são copiadas pelo CD (o pacote de
   > deploy não leva `infra/`). Copiar à mão é o esperado — igual à fase 2.

3. **Certificado do `app.`** (a raiz e a `api.` já têm):
   ```bash
   sudo certbot --nginx -d app.tamarcado.tec.br
   sudo certbot renew --dry-run          # confirmar a renovação automática
   ```
   O Certbot adiciona o bloco 443 e o redirect 80→443 no arquivo do `app.`.

4. **Env de produção** — em `/etc/tamarcado/api.env` (§5):
   ```
   CORS_ORIGIN=https://app.tamarcado.tec.br
   WEB_BASE_URL=https://app.tamarcado.tec.br
   ```
   Depois: `pm2 restart tamarcado-api --update-env` (o env é lido do `.env` da
   release; o CD recopia a cada deploy, então **mudar o arquivo canônico basta**).

5. **Deploy** (`workflow_dispatch` do `deploy.yml`) — publica o painel em
   `/var/www/tamarcado` (como sempre) **e** a landing page em
   `/var/www/tamarcado-lp`. Só depois deste deploy a raiz para de servir o
   painel: até aqui, `/var/www/tamarcado-lp` está vazio e a raiz devolve 404.

6. **Validar** (nesta ordem):
   ```bash
   curl -I https://app.tamarcado.tec.br/login     # 200, cert válido
   curl -I https://tamarcado.tec.br/              # 200, landing page
   curl -I https://tamarcado.tec.br/login         # 301 -> app.tamarcado.tec.br/login
   curl -I https://tamarcado.tec.br/sw.js         # 404 (proposital, §12.2)
   ```
   Pela UI: entrar no painel por `app.`, e provisionar/consultar uma empresa
   para conferir que `painelUrl` e `publicUrl` saem com `app.` (§5.1, túnel SSH).

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
