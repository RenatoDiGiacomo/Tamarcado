# Guia de manutenção (DEV)

Como subir o ambiente, fazer uma mudança pequena e ver funcionar — **sozinho**,
sem depender de rebuild manual a cada ajuste.

## Dois modos — qual usar

| | **Modo A — `pnpm dev` (híbrido)** | **Modo B — Docker completo** |
|---|---|---|
| **Para quê** | **Dia a dia**: editar e ver funcionar na hora | Validar a **imagem/paridade com produção** |
| **Hot-reload** | ✅ sim (API `--watch`, Web HMR) | ❌ não (rebuild a cada mudança) |
| **API / Web** | nativos no host | em containers |
| **MySQL** | container na porta **3307** | container na porta **3306** |
| **Comando** | `pnpm dev` | `docker compose -f infra/compose/docker-compose.yml up` |
| **Seed** | automático + `pnpm --filter api run seed:dev` | `docker compose -f infra/compose/docker-compose.yml exec api pnpm run seed:dev` |

> ⚠️ **Não rode os dois ao mesmo tempo.** Ambos publicam a API na **3000** e o
> Web na **5173** — sobem juntos e colidem. Antes de trocar de modo, derrube o
> outro (`pnpm dev:down` para a infra do Modo A; `docker compose -f
> infra/compose/docker-compose.yml down` para o Modo B). Os bancos são
> **separados** (3306 ≠ 3307): dados semeados num modo não aparecem no outro.

O resto deste guia é sobre o **Modo A** (o do dia a dia). Você **não** precisa de
`--build` para ver mudanças: a API recompila e reinicia sozinha ao salvar, e o
Web atualiza o navegador na hora (HMR). Rebuild só para o pacote de produção.

## Pré-requisitos (uma vez)

- **Node 20** (veja `.nvmrc`) e **pnpm 9** (`corepack enable pnpm`).
- **Docker Desktop** aberto (para a infra).
- `pnpm install` na raiz do projeto.

## O comando único

```bash
pnpm dev
```

Isso, em sequência:

1. cria `apps/api/.env` a partir de `apps/api/.env.example` (só na 1ª vez);
2. sobe a infra em Docker (MySQL na porta **3307**, Redis na 6379) e **espera**
   o MySQL ficar saudável;
3. aplica as migrations pendentes;
4. **libera as portas 3000 e 5173** de qualquer sobra de execução anterior (um
   `pnpm dev` que não morreu direito) — evita o `EADDRINUSE` recorrente;
5. liga a **API** em <http://localhost:3000> e o **Web** em <http://localhost:5173>,
   ambos com hot-reload.

> **Por que MySQL na 3307?** Para não colidir com outros MySQL locais na porta
> padrão 3306 (ex.: outro projeto). Dentro do container segue 3306; só a porta
> publicada no host é 3307 — e o `apps/api/.env` já aponta pra ela.
>
> **E o Evolution API (WhatsApp)?** Só é usado a partir do Épico 2 e fica atrás
> de um profile — **não** sobe no `pnpm dev`. Quando precisar:
> `docker compose -f infra/compose/docker-compose.infra.yml --profile whatsapp up -d`.

Deixe esse terminal aberto — ele mostra os logs da API e do Web juntos.
**`Ctrl+C`** encerra a API e o Web. A infra (banco) continua no ar.

> Primeira execução baixa as imagens Docker (~1 GB) e roda as migrations —
> pode levar alguns minutos. Depois, subir é questão de segundos.

## Fazer uma mudança pequena (o ciclo)

1. Com `pnpm dev` rodando, abra o arquivo (ex.: um componente em
   `apps/web/src/...` ou um controller em `apps/api/src/...`).
2. Edite e **salve**.
3. Veja acontecer:
   - **Web** → o navegador em `localhost:5173` atualiza sozinho.
   - **API** → o terminal mostra o Nest recompilando; a rota já responde novo.

Se algo não atualizar, veja [Solução de problemas](#solução-de-problemas).

## Dados para testar (login pronto)

O `pnpm dev` **já roda o seed automaticamente** (passo 4), então o ambiente
sobe logável. Credenciais do owner de teste:

| Campo | Valor |
|---|---|
| E-mail | `dono@tamarcado.dev` |
| Senha | `tamarcado123` |
| Salão (slug) | `salao-teste` |

Entre no painel em <http://localhost:5173> com esses dados. Se a tela pedir o
**salão/empresa**, use `salao-teste`.

O seed é **idempotente** — rodar de novo não duplica nada. Para rodá-lo à mão,
o comando depende do modo (cada um tem seu próprio banco):

```bash
# Modo A — pnpm dev (host → MySQL 3307). Lê o mesmo apps/api/.env que a API.
pnpm --filter api run seed:dev

# Modo B — Docker completo (dentro do container → MySQL 3306, env do compose).
docker compose -f infra/compose/docker-compose.yml exec api pnpm run seed:dev
```

> No Modo A o seed lê o **mesmo `apps/api/.env`** que a API (porta 3307), então
> nunca diverge. No Modo B ele roda **dentro do container** e usa as variáveis
> do compose (`mysql:3306`) — o `.env` local nem entra na imagem (`.dockerignore`).

## Comandos úteis

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe tudo (infra + API + Web com hot-reload). O do dia a dia. |
| `pnpm dev:infra` | Sobe só a infra em Docker (banco/redis/evolution), em segundo plano. |
| `pnpm dev:down` | Derruba a infra (o banco **persiste** — os dados ficam salvos). |
| `pnpm dev:reset` | Derruba a infra **e apaga o banco** (recomeça do zero). |
| `pnpm --filter api run seed:dev` | Popula o banco com dados de exemplo. |
| `pnpm --filter api run migration:run` | Aplica migrations manualmente. |
| `pnpm test` / `pnpm typecheck` / `pnpm lint` | Checagens de qualidade (mesma sequência do CI). |

## Solução de problemas

### Conflito na porta 3306 (ou "porta ocupada")

O MySQL de dev do Tamarcado usa a **3307** justamente para conviver com outros
MySQL na 3306. Se ainda aparecer conflito de porta:

1. **Descubra quem segura a porta** (PowerShell):
   ```powershell
   Get-NetTCPConnection -LocalPort 3307 -State Listen | Select-Object OwningProcess
   Get-Process -Id <PID>
   ```
   Se o processo for `com.docker.backend` ou `wslrelay`, **é o próprio Docker**
   fazendo proxy de um container — não um MySQL do Windows. Veja qual container:
   ```powershell
   docker ps -a --format '{{.Names}} | {{.Status}} | {{.Ports}}'
   ```

2. **Container órfão de outro projeto na mesma porta** — pare só ele, sem
   destruir nada: `docker stop <nome-do-container>`. Lembre que `docker compose
   down` só derruba o projeto **daquele** arquivo/nome; um `down` no diretório
   errado não libera o container de outro projeto.

3. **Precisa manter o que está na porta?** O dev do Tamarcado já está na 3307.
   Se precisar de outra porta ainda, mude o mapeamento em
   `infra/compose/docker-compose.infra.yml` (`"NOVA:3306"`) **e** o
   `DATABASE_PORT` em `apps/api/.env` — os dois têm que casar.

4. **Recriar do zero na porta certa**:
   ```bash
   pnpm dev:down    # ou dev:reset para apagar o banco também
   pnpm dev
   ```

### `EADDRINUSE` na 3000 ou 5173 (API/Web já em uso)

Acontece quando um `pnpm dev` anterior não encerrou de verdade (fechou o
terminal sem `Ctrl+C`, um crash, ou uma sobra de outra ferramenta na porta). O
`pnpm dev` **já libera 3000 e 5173 automaticamente** antes de subir (passo 4),
então normalmente basta rodar de novo. Se precisar liberar à mão:

```powershell
# Windows (PowerShell) — descobre e encerra quem escuta a porta
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

```bash
# macOS / Linux
lsof -ti tcp:3000 -sTCP:LISTEN | xargs -r kill -9
lsof -ti tcp:5173 -sTCP:LISTEN | xargs -r kill -9
```

> Isso encerra **só o listener daquela porta** — não mexe na infra (MySQL 3307)
> nem em outros processos. Se a porta continuar presa depois, veja se não há um
> segundo `pnpm dev`/`vite` órfão: `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vite*' }`.

- **"Falha ao subir a infra" / Docker fechado** — abra o Docker Desktop; confira
  que as portas `3307` e `6379` não estão em uso.
- **A API não conecta no banco** — confirme que a infra está de pé
  (`pnpm dev:infra`) e que `apps/api/.env` tem `DATABASE_HOST=127.0.0.1`.
- **Mudei um pacote em `packages/shared-*` e o app não pegou** — esses pacotes
  não estão em watch; rode `pnpm --filter @tamarcado/shared-types build` (ou
  `shared-utils`) e o watch da API/Web recompila em seguida.
- **Web não atualiza sozinho** — recarregue a página uma vez; se persistir,
  pare (`Ctrl+C`) e rode `pnpm dev` de novo.
- **Quero começar do zero** — `pnpm dev:reset` apaga o banco; o próximo
  `pnpm dev` recria o schema (migrations) e você roda o seed de novo.

## WhatsApp em desenvolvimento (Story 6.1)

O webhook é chamado **pela Meta**, pela internet — a `localhost:3000` não serve.
Para testar de verdade na sua máquina é preciso um **túnel HTTPS**:

```bash
# um dos dois; a URL muda a cada sessão
cloudflared tunnel --url http://localhost:3000
ngrok http 3000
```

Depois, no painel da Meta (aplicativo → WhatsApp → Configuração → Webhooks),
aponte a **URL de callback** para `https://<url-do-tunel>/api/whatsapp/webhook`,
com o *verify token* igual ao `WHATSAPP_WEBHOOK_VERIFY_TOKEN` do seu `.env`, e
assine o campo `messages`. **A URL muda a cada vez que o túnel sobe** — é preciso
recadastrar.

No `apps/api/.env` você precisa de (ver `apps/api/.env.example`):

| Variável | Para quê |
|---|---|
| `WHATSAPP_APP_SECRET` | confere a assinatura. **Sem ela, todo webhook é rejeitado** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | o handshake do cadastro da URL |
| `WHATSAPP_TOKEN_KEY` | `openssl rand -hex 32` — cifra o token de cada empresa |
| `WHATSAPP_ECHO_ENABLED=true` | liga o **eco temporário** (responde tudo). Só dev; sai na 6.2 |

Conectar um estabelecimento local é o mesmo `PUT` da produção (RUNBOOK §16),
contra `http://localhost:3000`. E lembre: **conectar não libera** — o direito é a
capability, pelo endpoint da 6.16.

Conferir a conexão e mandar uma mensagem real pelo mesmo caminho do bot:

```bash
pnpm --filter api run smoke:whatsapp -- salao-teste              # só confere
pnpm --filter api run smoke:whatsapp -- salao-teste 5511999990000 "oi"
```

## E o modo "tudo em Docker"?

O `infra/compose/docker-compose.yml` (que sobe API + Web também em container)
continua existindo para casos como validar a imagem de produção. Para o dia a
dia de manutenção, prefira `pnpm dev` — o hot-reload é mais rápido e direto.
Detalhes de staging/produção em [`infra/README.md`](infra/README.md).