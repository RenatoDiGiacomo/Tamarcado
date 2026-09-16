# Story 6.1: Abstração `WhatsAppProvider` e integração com a Cloud API oficial (Meta)

Status: **implementada** — PR aberto para `dev` (Amelia, 2026-09-16). DL-054, DL-073, DL-080,
DL-081 e o novo **DL-084**, sobre a base de capabilities da Story 6.11 (DL-072) e a ativação
manual da 6.16 (DL-076).

> **É a primeira story do Épico 6 em que o WhatsApp deixa de ser papel.** O que ela derruba é o
> **maior risco técnico do épico** (ordem interna, linha 4): provar o ciclo
> **recebe → processa → envia** contra a Meta de verdade, **antes** de existir máquina de conversa
> para proteger.

## Story

As a operador da plataforma,
I want enviar e receber mensagens de WhatsApp por uma interface abstrata, sobre a Cloud API oficial,
so that o bot opere sobre um provider oficial sem acoplar a lógica de negócio a ele e sem risco de
banimento do número do cliente.

---

## ⭐ Ponto A — A diferença entre "conectado à mão" e "pelo Embedded Signup" é só a ORIGEM

O DL-073 é a decisão que destravou o épico: o CNPJ inapto bloqueia a **6.12**, não o canal. A
implementação levou isso a sério — **não existe caminho "manual" no código**.

| | hoje (6.1) | quando o CNPJ regularizar (6.12) |
|---|---|---|
| Quem preenche | nós, por `PUT /api/platform/companies/{slug}/whatsapp` | o dono, pelo Embedded Signup |
| **Campos preenchidos** | `provider`, `phone_number_id`, `waba_id`, `display_phone_number`, `access_token` | **os mesmos** |
| `connected_by` | `manual:plataforma` | `embedded_signup` |
| Factory por tenant, roteamento do webhook, isolamento, gate | idênticos | idênticos |

Não há campo "manual", não há flag de provisório e a WABA de desenvolvimento entra como **um tenant
qualquer** — sem caminho especial. A 6.12 vai chamar `WhatsAppConnectionService#upsert` com outro
`connectedBy` e acabou.

---

## ⭐ Ponto B — Onde o token mora (diverge do AC-2 — **DL-084**)

O AC-2 dizia *"`companies` ganha `whatsapp_provider` e os campos de credencial"*. **Divergimos, com
aval do Renato antes de escrever código**, e o motivo é concreto:

`companies` é carregada em **quase todo request** — `TenantMiddleware` para resolver o tenant,
página pública para o branding, painel para a identidade visual. Um token como coluna dela faz
**todo objeto `Company` em memória carregar o segredo**, e a partir daí a regra *"o token nunca
transita para o front"* passa a depender de **ninguém, em nenhuma story futura, esquecer de filtrar
um campo**.

**Decisão:** tabela `company_whatsapp_connections`, 1:1 com a empresa. O conteúdo do AC é mantido
inteiro (provider **sem default**, identificação do número, por tenant); muda **onde** fica.

O reforço que isso permitiu: o tipo que sai do serviço para qualquer resposta
(`WhatsAppConnectionView`) **não tem campo de token**. Não é "lembrar de remover" — é *nunca ter
tido*. Expor o token passa a exigir mudar uma interface, o que é decisão visível no diff.

### Duas unicidades, dois trabalhos diferentes

| índice | impede |
|---|---|
| `uq_company_whatsapp_company` | dois números para o mesmo salão virarem acidente de dado (se for desejado, é migration consciente) |
| `uq_company_whatsapp_phone_number_id` (**global**) | dois tenants reivindicarem o mesmo número — é por este campo que o webhook descobre de quem é a mensagem |

A segunda é a mesma lógica da unicidade global do evento no DL-080. Violá-la responde **409 com
explicação** (*"já está vinculado a outro estabelecimento"*), não 500 com erro de banco: quem está
do outro lado é o operador preenchendo à mão.

### O token é cifrado em repouso

AES-256-GCM, chave em `WHATSAPP_TOKEN_KEY`, **fail-closed** — sem a chave não grava **nem lê**.

Não é contra quem já está dentro do servidor. É contra o **dump de banco**, que sai da máquina para
backup por desenho, enquanto o `/etc/tamarcado/api.env` não sai. Quem tem este token **envia
WhatsApp como o salão**, para as clientes dele.

E é agora ou é caro: cifrar coluna que já tem dado é migration que **converte dado**, com teste
contra base populada (DL-064).

⚠️ **Consequência que está no RUNBOOK §16:** trocar a `WHATSAPP_TOKEN_KEY` torna **todas** as
conexões ilegíveis e obriga a reconectar cada estabelecimento à mão.

---

## ⭐ Ponto C — O webhook tem regras próprias, e elas moldaram o desenho

Ele é chamado **pela Meta**, sem login. Três consequências, três respostas.

### 1. A assinatura é a única prova — e a rejeição em massa é um ALARME

HMAC-SHA256 do **corpo cru** com o *App Secret*, comparado em tempo constante. Corpo cru, e não o
JSON reserializado pelo Nest: reserializar muda espaços e ordem de chave, e a conferência passaria a
falhar sempre. Daí o `rawBody: true` no `main.ts` **e** no `e2e-app.ts`.

O alarme não dispara por quantidade. O sinal que separa **ataque/ruído** de **configuração nossa
quebrada** é a **ausência de acerto na mesma janela**: ataque convive com tráfego legítimo, segredo
errado depois de uma implantação não convive. Por isso a condição é *muitas rejeições **e** zero
aceitas*, e o texto do alarme diz qual variável conferir.

### 2. Responder mal custa o canal de TODOS

A Meta desativa o webhook do **aplicativo inteiro** por qualquer resposta ruim. Um tenant com
problema derrubaria o bot de todos os estabelecimentos. Portanto:

- `@HttpCode(200)` explícito (o padrão do Nest para `@Post` é 201, e a Meta trata ≠ 200 como falha);
- o processamento **nunca lança** — isolamento por evento, e o retorno é um resumo, não um veredito;
- o endpoint faz **três coisas e só três**: confere a assinatura, entrega o payload, responde 200.

**A costura para a 6.20 está pronta e é uma linha.** `await this.webhook.processar(req.body)` é o
único ponto de trabalho do endpoint; lá ele vira *grava o evento + responde 200 + processa fora do
ciclo*. Nada do `WhatsAppWebhookService` precisa mudar para aquilo acontecer — que era exatamente o
pedido de "não escreva nada que dificulte pôr a fila no meio depois".

### 3. Nem todo evento é mensagem

Um POST traz `entry[] × changes[] × (messages[] + statuses[])`. Tratar só `entry[0].changes[0]`
perderia mensagem **em pico**, que é quando a Meta agrupa.

| o que chega | o que fazemos |
|---|---|
| mensagem de texto | roteia, checa capability, despacha |
| mensagem de áudio/figurinha | despacha **com o `tipo`** e texto vazio — quem trata pode dizer "ainda não sei ler" |
| status de entrega | registra (é daqui que sai a contagem da 6.17 — **DL-085**) |
| evento de conta, eco da coexistência, campo novo da Meta | registra como `desconhecido` |
| número que não é de nenhum tenant | registra como **não roteado**, nunca erro |
| payload irreconhecível | um `desconhecido`, e 200 |

O parser é **função pura, sem injeção e sem banco**, e é escrito para **não lançar nunca**: um
`parse` que quebra diante de um campo novo transforma uma novidade da Meta numa queda do canal de
todos.

---

## ⭐ Ponto D — A camada 3 do DL-072 ganhou o primeiro consumidor real

A Story 6.11 entregou o mecanismo **sem ter onde pousar** — `CAPABILITY_GATED_ENTRYPOINTS` nascia
vazia, e havia um teste documentando isso. Agora:

| classe | decide |
|---|---|
| `WhatsAppWebhookService` | mensagem de empresa sem `whatsapp_bot` é **descartada** (e a Meta ainda recebe 200) |
| `WhatsAppService` | envio de empresa sem o direito **não sai** |

`sendMessage` exige a capability como **parâmetro obrigatório, sem default**. `whatsapp_bot` e
`lembrete_automatico` se vendem sozinhas (DL-072); um default faria o lembrete sair para quem
comprou só o bot — **cobrado no cartão de um cliente que não pediu aquilo**.

### O guard-rail precisou de uma exceção — e a exceção tem invariante

A **camada 2** varre o `AppModule` e exige `@RequireCapability` + `CapabilityGuard` em todo
controller que alcance um provider marcado `@GatedByCapability`. Dois controllers desta story
alcançam e **não têm como ter guard**:

| controller | por quê |
|---|---|
| `WhatsAppController` (webhook) | quem chama é a **Meta**, sem login. O gate dele é a camada 3 |
| `PlatformWhatsAppController` | **conectar não é usar** (DL-082): exigir a capability impediria o caso normal — preencher a conexão **antes** de liberar, ou conferir a conexão de quem foi cortado |

Em vez de afrouxar a marca no domínio, criei `CAPABILITY_UNGUARDED_CONTROLLERS` — mesmo espírito do
`PRE_TENANT_CONTROLLERS` (DL-027): lista curta, com justificativa escrita por entrada. **E com um
invariante verificável:** um teste falha se qualquer entrada tiver `JwtAuthGuard` na pilha. Sem essa
regra, a lista viraria o lugar onde se despeja o controller que deu trabalho de gatear — que é como
uma exceção consciente apodrece virando buraco.

---

## ⭐ Ponto E — "Produção é exclusivamente Cloud API" é código, não comentário

A abstração existe para tornar a troca barata (NFR-O3), **não** para usar outra coisa em produção. A
factory recusa provider não oficial fora de desenvolvimento — com erro, não com aviso nem fallback.

A checagem usa o mesmo `isDevEnv()` do CORS, que é **fail-closed**: `NODE_ENV` ausente ou
desconhecido conta como **produção**. Um VPS que suba sem a variável não cai no modo permissivo, e
aqui o preço do engano é **o número do cliente banido**.

`EvolutionApiProvider` existe por duas razões, e nenhuma é "caso a Meta não dê certo": prova que a
abstração é real (interface com uma implementação só é interface por acidente) e permite
desenvolver o bot com número descartável, sem queimar mensagem real a cada teste manual.

---

## O que foi entregue

### Banco

`company_whatsapp_connections` — migration aditiva pura, `companies` **não é tocada**. Provada
contra base populada (DL-064) em `test/migration-company-whatsapp-connections.e2e-spec.ts`,
inclusive as duas unicidades, a ausência de default em `provider` e o `ON DELETE CASCADE`.

### API

| arquivo | papel |
|---|---|
| `whatsapp.provider.ts` | a abstração (`sendMessage`, `getConnectionStatus`) + os tipos |
| `providers/cloud-api.provider.ts` | a implementação oficial + classificação de erro da Graph API |
| `providers/cloud-api.payload.ts` | tradução do webhook em eventos — puro, e nunca lança |
| `providers/evolution-api.provider.ts` | alternativo, **só dev** |
| `whatsapp-provider.factory.ts` | escolhe por tenant e **recusa o não oficial fora de dev** |
| `whatsapp-connection.service.ts` | credenciais por tenant; **único lugar que lê o token** |
| `whatsapp-token.cipher.ts` | AES-256-GCM + comparação de segredo em tempo constante |
| `whatsapp.service.ts` | fachada: envia (com gate), estado, registra o handler |
| `whatsapp-webhook.service.ts` | processa: roteia, checa capability, despacha — **nunca lança** |
| `whatsapp.controller.ts` | o webhook: `GET` handshake + `POST` com assinatura |
| `webhook-signature.ts` | validação + **alarme de rejeição em massa** |
| `whatsapp-echo.handler.ts` | eco **temporário** do smoke test (sai na 6.2) |
| `platform/platform-whatsapp.controller.ts` | `PUT`/`GET`/`DELETE` da conexão, por `x-platform-key` |

### Onde `registerIncomingMessageHandler` ficou

O AC pede três capacidades na abstração: enviar, estado da conexão, registrar quem trata o recebido.
As três existem — as duas primeiras na **instância ligada ao tenant**, a terceira na **fachada**.

Pendurar o registro de handler num objeto ligado a um tenant sugeriria que existe **um handler por
empresa**, que não existe e não deve existir: quem trata mensagem é **um só para a aplicação**
(a máquina de conversa da 6.2). A instância por tenant, por sua vez, é o que torna impossível **por
construção** enviar pela empresa A com o token da B.

---

## Testes

**Unit (`src/**/*.spec.ts`) — 84 casos novos, em 7 arquivos**

- parser: múltiplos eventos, status, áudio, payload torto em seis formas, evento sem `phone_number_id`;
- cifra: ida e volta, chave ausente/errada/trocada, linha adulterada, e o guardado **não conter** o token;
- assinatura: segredo errado, corpo alterado num byte, algoritmo diferente, e o alarme **só** com zero aceitas;
- factory: Cloud API sempre; Evolution só em dev; **recusado com `NODE_ENV` ausente**; isolamento por tenant;
- envio: gate por capability, `lembrete_automatico` não libera o bot, isolamento entre empresas;
- webhook: roteamento, descarte por capability, evento desconhecido, **falha de um evento não leva o lote**, nunca lança nem com banco fora;
- provider: erro classificado e **o token ausente do log e da exceção** — inclusive no caso em que a própria Meta o ecoa no corpo do erro.

**e2e**

| arquivo | prova |
|---|---|
| `whatsapp-webhook.e2e-spec.ts` | assinatura inválida/ausente/corpo adulterado → 403; alarme; handshake; **cinco formas de evento que precisam terminar em 200**; empresa cortada não processa; corte vale na requisição seguinte; **ciclo recebe→responde pelo número certo**; token não está em texto puro no banco |
| `platform-whatsapp.e2e-spec.ts` | token **nunca** volta em nenhuma das três rotas; isolamento; 409 no número duplicado; regravar troca o token; desconectar apaga o segredo e **mantém** o vínculo |
| `migration-company-whatsapp-connections.e2e-spec.ts` | base populada, unicidades, sem default em `provider`, cascade, `down` reversível |
| `platform-plan.e2e-spec.ts` (ajustado) | o snapshot de rebaixamento agora **semeia uma conexão** — sem isso, "a credencial sobrevive" era a comparação de duas tabelas vazias (DL-082) |

**Guard-rails:** `capability-coverage.spec.ts` ganhou a exigência real da camada 3 e o invariante da
lista de exceção. `tenant-coverage` e `active-user-coverage` seguem verdes — os serviços deste
módulo usam repositório cru com `companyId` explícito (mesma exceção consciente do
`CapabilitiesService`), então nenhum controller novo entra nas listas de tenant.

---

## Operação — o que precisa existir no servidor

Detalhado no **RUNBOOK §16**; em resumo:

| variável | sem ela |
|---|---|
| `WHATSAPP_APP_SECRET` | **todo webhook é rejeitado** (fail-closed) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | a Meta não consegue cadastrar a URL |
| `WHATSAPP_TOKEN_KEY` | nenhuma conexão pode ser gravada nem lida |

⚠️ **O webhook precisa ficar ABERTO na internet** — quem o chama é a Meta. Ele não está sob
`/api/platform/*`, então o `deny all` do §5.1 não o alcança; **qualquer endurecimento futuro do
Nginx tem de preservá-lo**, ou o bot de todos os estabelecimentos cai de uma vez.

---

## Smoke test (AC-5) — evidência

> Preenchido na execução contra a WABA de desenvolvimento (`1944290202933684`,
> **+55 11 94245-8672**), com túnel HTTPS local apontando para a API em `localhost:3000`.

**Procedimento:**

1. `cloudflared tunnel --url http://localhost:3000` (ou `ngrok http 3000`);
2. painel da Meta → Webhooks: URL `https://<túnel>/api/whatsapp/webhook`, *verify token* =
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, campo assinado `messages`;
3. `PUT /api/platform/companies/salao-teste/whatsapp` com o `phoneNumberId` e o token;
4. liberar a capability: `PATCH /api/platform/companies/salao-teste/plan` com `plan: "pro"`;
5. `WHATSAPP_ECHO_ENABLED=true` no `apps/api/.env` e subir a API;
6. mandar uma mensagem do celular para **+55 11 94245-8672**.

| etapa | evidência |
|---|---|
| conexão gravada e conferida | _(a preencher)_ |
| mensagem enviada do celular | _(a preencher)_ |
| o que a Meta entregou no webhook | _(a preencher)_ |
| resposta do eco | _(a preencher)_ |
| conversa no celular | _(a preencher)_ |

---

## Registrado, não implementado

| # | o quê | onde foi parar |
|---|---|---|
| 1 | **Contagem de mensagens enviadas por empresa** | **DL-085** + nota na Story 6.17. **Verificado: o dado NÃO saía de graça aqui** — a 6.1 não grava mensagem nenhuma. Ele nasce barato na **6.20**, a partir dos **status de entrega** que o webhook já recebe e hoje descarta; contar pelo status conta o que a Meta reconheceu, que é o que ela cobra |
| 2 | **Modelos aprovados são os mesmos para todos** | **DL-086** + pré-requisito com prazo na Story 6.18: aprovar na conta de desenvolvimento **antes da primeira venda**. Tarefa do Renato, não de código |

## Dívida consciente desta story

- **O eco é temporário** e sai na 6.2. Desligado por padrão e **ignorado fora de desenvolvimento** —
  um eco vivo em produção responderia besteira para a cliente de um salão real.
- **O processamento ainda roda no ciclo da resposta.** É o que o AC pede, e a 6.20 resolve
  estruturalmente logo em seguida. Até lá, quem segura é o timeout curto do provider.
- **Sem `TenantContext` no caminho do webhook**, de propósito: o tenant vem de lookup pelo número, e
  por isso nenhum serviço deste caminho pode usar `TenantAwareRepository`. Está escrito no topo do
  controller — é a armadilha que a 6.2 vai encontrar primeiro.
