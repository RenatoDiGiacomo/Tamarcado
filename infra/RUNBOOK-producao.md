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

## 11. DNS / e-mail — SPF ÚNICO (atenção na fase de e-mail transacional)

DNS gerido na **Cloudflare**. O **Email Routing** (grátis, `contato@` → caixa do Renato) publica
um registro **SPF** próprio (`include:_spf.mx.cloudflare.net`).

⚠️ **Quando entrar o e-mail transacional (Brevo ou Resend — roadmap item 2, DL-060):** o SPF do
provedor **NÃO** pode virar um segundo registro TXT. Um domínio com **dois registros SPF separados
INVALIDA os dois** (RFC 7208). É preciso **um único registro TXT** `v=spf1 …` combinando os dois
`include:`. Exemplo (ajustar ao provedor escolhido):

```
tamarcado.tec.br  TXT  "v=spf1 include:_spf.mx.cloudflare.net include:<spf-do-brevo-ou-resend> ~all"
```

- **Brevo:** `include:spf.sendinbrevo.com` (confirmar no painel do Brevo na hora).
- **Resend:** usa domínio/subdomínio próprio + `include:` indicado pelo painel (confirmar).
- Além do SPF, o provedor exige **DKIM** (registros CNAME/TXT próprios — esses SIM são separados,
  sem conflito) e opcionalmente **DMARC**. Só o **SPF** é que precisa ser registro único.
- Registros de e-mail (MX/TXT do Email Routing, DKIM) ficam **DNS only**; não afetam o Certbot.


---

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
