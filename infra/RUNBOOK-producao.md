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

**Endereços (quando o DNS resolver — decisão de 2026-08-11, só 2 nomes):**

| Nome | Uso |
|---|---|
| `tamarcado.tec.br` | painel (`/login`) **e** link público (`/agendar/{slug}`) — mesmo SPA |
| `api.tamarcado.tec.br` | API (proxy para `127.0.0.1:3000`) |
| `app.tamarcado.tec.br` | **reservado, sem uso** (DNS criado; painel migra pra cá se um dia houver site institucional na raiz) |

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

## 3. Layout no servidor

```
/opt/tamarcado/            # repositório da aplicação (dono: deploy)
  apps/api/dist/           # build da API (PM2 roda dist/main.js)
  apps/api/.env            # cópia do env de produção (ver §5) — gitignored
  apps/web/dist/           # build do painel (copiado para /var/www)
  ecosystem.config.js      # PM2 (name=tamarcado-api, cwd=/opt/tamarcado/apps/api, PORT=3000)
/var/www/tamarcado/        # estático servido pelo Nginx (dono: deploy)
/etc/tamarcado/api.env     # ENV DE PRODUÇÃO canônico (root:deploy, 640) — fonte da verdade
/var/backups/tamarcado/    # dumps diários do MySQL (700)
```

O `.env` de runtime da API é `/opt/tamarcado/apps/api/.env`. A **fonte** é
`/etc/tamarcado/api.env` (fora do repo, sobrevive a re-clones). O deploy **copia**
`/etc/tamarcado/api.env → /opt/tamarcado/apps/api/.env` (a API lê `../​.env` relativo
ao `dist`, via `load-env.ts`).

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
| `CORS_ORIGIN` | `https://tamarcado.tec.br` (painel+público chamam a API cross-origin em `api.`) |
| `WEB_BASE_URL` | `https://tamarcado.tec.br` (monta `painelUrl` e `publicUrl` — DL: base única, decisão 2026-08-11) |
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

## 7. Deploy e rollback (Fase 3 — CD)

> A ser finalizado na Fase 3 (reescrita do `deploy.yml` para `workflow_dispatch`, DL-060).
> Ordem obrigatória do deploy: **backup do banco → build → envio → migrations → restart PM2
> → healthcheck**, com **rollback**. Rascunho em `infra/scripts/deploy.sh`.

**Deploy manual (enquanto o CD da Fase 3 não está pronto).** O servidor **NÃO tem `.git`**
(repo privado, sem credencial de GitHub no servidor — modelo (a)). O código é enviado como
**snapshot** (`git archive`) e **buildado no servidor**:

```bash
# --- NO SEU PC (na raiz do repo) ---
git fetch origin
git archive --format=tar.gz -o /tmp/tamarcado-main.tgz origin/main     # snapshot de produção
scp -i ~/.ssh/id_ed25519 /tmp/tamarcado-main.tgz deploy@179.198.123.87:/tmp/

# --- NO SERVIDOR (ssh deploy@179.198.123.87) ---
sudo /usr/local/bin/tamarcado-backup.sh                                 # 1) backup ANTES
cd /opt/tamarcado && tar -xzf /tmp/tamarcado-main.tgz -C /opt/tamarcado # 2) extrair fonte
cp /etc/tamarcado/api.env apps/api/.env                                 # 3) env de produção
pnpm install --frozen-lockfile                                          # 4) deps
VITE_API_URL=https://api.tamarcado.tec.br pnpm -r build                 # 5) build (web precisa do VITE_API_URL)
pnpm --filter api run migration:run                                     # 6) migrations
pm2 restart tamarcado-api || pm2 start ecosystem.config.js ; pm2 save   # 7) PM2
cp -r apps/web/dist/. /var/www/tamarcado/                               # 8) publicar web
curl -fsS http://127.0.0.1:3000/health && echo " OK"                    # 9) healthcheck
```
Na **Fase 3** o GitHub Actions passa a **buildar** e **rsync** dos artefatos (`workflow_dispatch`),
eliminando o build no servidor.

**Rollback (desenho — detalhar na Fase 3):** manter a versão anterior no servidor
(release anterior ou commit anterior), e um comando que volta: `git checkout <sha-anterior>`
+ rebuild + `pm2 restart` + (se necessário) restaurar o backup do banco tirado antes do deploy.

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
- **Fase 3 (CD) — modelo (a): build no GitHub Actions + rsync (servidor SEM credencial de GitHub):**
  `ci.yml` incluir `dev` no `pull_request`; `deploy.yml` → `workflow_dispatch` (não automático em
  push no `main`, DL-060); Actions builda `apps/web` (com `VITE_API_URL=https://api.tamarcado.tec.br`)
  e `apps/api`, e **rsync** dos artefatos para o servidor; ordem
  **backup→envio→migrations→restart PM2→healthcheck** com **rollback** (release anterior + reverter);
  chave `tamarcado_deploy` como secret no GitHub.

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

