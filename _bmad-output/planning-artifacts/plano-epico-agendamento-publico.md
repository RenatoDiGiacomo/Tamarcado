# Plano — Épico "Agendamento pela Cliente (link público)"

Status: **ESCOPO FECHADO (DL-049) — rótulo "Épico 5B", 3 stories (5B.1–5B.3).** Este doc é o histórico da proposta; a spec fechada vive em `epics.md`, no decision-log (DL-046/047/048/049) e em `5B-1/5B-2/5B-3`. As seções abaixo que propunham renumerar 6→7 e 4 stories foram **superadas** pelas decisões do Renato (ver "Decisões" ao fim).

> **Por que primeiro.** Entrega "a cliente agenda sozinha" **sem** o risco do WhatsApp (banimento, custo por mensagem, dependência da Meta/Evolution) e **constrói a fundação que o bot também usa** (pendentes, disponibilidade pública, branding sem login). Cliente real já pediu. Vem antes do Épico 6 (bot).

---

## TL;DR — recomendação

- **Novo Épico 6 = "Agendamento pela Cliente (link público)".** WhatsApp vira **Épico 7**, Mobile vira **Épico 8** (renumeração — ver §1 e o trade-off).
- **A máquina de PENDENTES sai do bot e vira fundação do link** (§3): status `pending` (já existe, 3.1, nunca usado), tela Pendentes, confirmar/recusar, polling/badge. O bot (novo Épico 7) **reusa** — só pluga o canal WhatsApp.
- **4 stories no MVP** (6.1–6.4) + **1 opcional** (6.5 carrinho multi-serviço). MVP mínimo = 6.1–6.3; 6.4 (polling/badge) é fortemente recomendado.
- **Endpoints públicos** num `PublicController` resolvido por **slug** (`/agendar/{slug}`), em `PRE_TENANT_CONTROLLERS` (DL-027), campos **whitelisted**, rate-limit + pending-confirma como antispam.
- **`source` ganha `link`** (aditivo). **Carrinho multi-serviço** = story separada, cortável do primeiro ship.

---

## 1. Reordenação do roadmap — número e encaixe

Hoje: 1 Fundação · 2 Design System · 3 Agendamento manual · 4 Clientes · 5 Pagamentos · **6 WhatsApp** · 7 Mobile.

**Recomendação: inserir o link como Épico 6; WhatsApp → 7; Mobile → 8.**

- O link **precede** o bot de fato (é a fundação que o bot consome) — a numeração deve ler na ordem de execução.
- Um "Épico 5.5" (decimal) é *smell*; épico é unidade inteira. `X.Y.NN` é para ajuste fora de escopo (DL-028), não para épico novo.

**Trade-off (honesto):** renumerar 6→7 e 7→8 **churna referências** em docs ("Épico 6", stories 6.x, "pré-requisito do Épico 6" na 3.5, DL-035, NFR-A3). Mitigações:
- O bot **não tem código** — "Épico 6" só aparece em docs de planejamento. É find/replace mecânico, com sweep cuidadoso.
- **FRs não mudam** (FR-A/FR-B são identificadores estáveis). Só mudam rótulos "Épico N" e números de story `6.x→7.x`.
- A dependência da 3.5 ("pré-requisito da 6.4") **naturalmente migra**: a confirmação de pendentes agora vive no novo Épico 6 (link), então 3.5 continua sendo pré-requisito — do link.

> **Alternativa se você quiser zero churn:** manter bot=6/mobile=7 e chamar o link de **Épico 5B** (rótulo, não número). Funciona, mas fica feio no índice. **Recomendo renumerar** — pago o custo do sweep uma vez.

---

## 2. Pré-tenant: endpoints públicos e auditoria

Hoje o `TenantMiddleware` resolve tenant pelo **JWT** (`req.user.companyId`). A página pública **não tem login** → resolve por **slug na URL**. Precedente: `AuthController` em `PRE_TENANT_CONTROLLERS` (DL-027) resolve company por `companySlug` com métodos *unscoped* (DL-026).

**Desenho:**

- **Um `PublicBookingController`** com prefixo `/public/:slug/...` (o front usa `/agendar/{slug}`; a API expõe `/public/{slug}`).
- **Resolução de tenant por slug:** um passo que faz `companies.findBySlugUnscoped(slug)` → 404 se não existe → **entra no `TenantContext`** com o `companyId` resolvido. Assim os services downstream (`AvailabilityService`, `AppointmentsService`) seguem **tenant-scoped e seguros**, sem reescrever nada. É o mesmo princípio do `AuthController`, só que a chave é o slug em vez de credencial.
- **Endpoints públicos (MVP):**
  | Método | Rota | Retorna / faz |
  |---|---|---|
  | GET | `/public/:slug/installation` | branding whitelisted: `{ name, logoUrl, primaryColor }` (§4) |
  | GET | `/public/:slug/services` | serviços **ativos**: `{ id, name, durationMinutes, price }` |
  | GET | `/public/:slug/availability?serviceId&date` | slots livres (reusa `AvailabilityService`) |
  | POST | `/public/:slug/appointments` | cria **pending** (source=`link`), sem profissional (§3) |

- **Auditoria (DL-027):** o `PublicBookingController` entra em **`PRE_TENANT_CONTROLLERS`** com justificativa ("resolve tenant por slug público, sem JWT"). O guard-rail já **quebra a suíte** se um controller tenant-aware ficar fora das listas — a exceção fica **explícita e testada**. Regra de ouro: o controller **só** resolve por slug e **nunca** aceita `companyId` do body/query (mesma disciplina do DL-034).
- **Enumeração de slug não é vazamento:** o slug é um **handle público** que o salão distribui de propósito; os endpoints só expõem o que o salão **quer** público (branding, serviços, horários livres). Zero PII de cliente é lido por esses GETs.

---

## 3. Pendentes: sai do Épico 6, vira PRÉ-REQUISITO/fundação do link

Hoje o status `pending` existe (3.1) e **nunca foi usado**; toda a máquina de pendentes está no bot: FR-B1–B6, tela Pendentes (UX-DR9), confirmar/recusar (6.4), polling/badge (NFR-A3, 6.9, UX-DR7).

**Decisão de arquitetura:** **o agendamento de fora (link) entra `pending`; o salão confirma/recusa no painel.** Isso torna a máquina de pendentes a **fundação do link**, e o bot (Épico 7) passa a **reusá-la** — só adiciona o canal WhatsApp e as notificações à cliente.

Move-se para o Épico 6 (link):
- **FR-B1** (pendente aparece na agenda como *aguardando confirmação*, sem profissional) — **adaptado**: a notificação ao salão no MVP do link é **in-panel** (badge/toast), não WhatsApp.
- **FR-B2/B4** (confirmar / recusar com justificativa **pelo painel** — DL-018) — a tela Pendentes.
- **Confirmar = atribuir profissional (Story 3.5) + status→confirmado.** A 3.5 já está mergeada; é aqui que ela paga (era "pré-requisito da 6.4").
- **Polling/badge** (NFR-A3, UX-DR7, 6.9) — o salão vê novos pendentes sem reload.

Fica no bot (Épico 7):
- **FR-B3/B5/B6** na parte de **notificar a cliente** (confirmação/recusa/timeout via WhatsApp) — depende do canal.
- O **timeout de 2h** (FR-B6) é conceito do bot; no link não há timeout (o pendente espera o salão).

> **Gap consciente do MVP do link:** sem o bot, a cliente **não recebe** aviso automático de "confirmado/recusado". No MVP ela vê uma tela de sucesso "recebido, o salão vai confirmar"; o salão contata manualmente se quiser. Quando o Épico 7 (WhatsApp) entrar, a notificação à cliente pluga por cima. **Aceitável para o primeiro ship** — registrar como limite.

---

## 4. Branding sem login (sem brecha do DL-034)

O DL-034 proíbe **confiar em id de company vindo de fora** (para um usuário logado não ler outro tenant). Aqui **não há usuário logado**, o **slug é público** e expomos **só branding**. Portanto:

- **`GET /public/:slug/installation`** resolve slug→company (unscoped) e retorna um **DTO whitelisted**: `{ name, logoUrl, primaryColor }`. Nada além disso.
- O `InstallationController` **autenticado** (req.user.companyId) **não muda** — continua fechado.
- Não é brecha: (a) sem token, sem "outro tenant" para vazar; (b) slug é handle público deliberado; (c) endpoint separado, campos limitados, sem PII.

---

## 5. Segurança do POST público (sem auth)

> **Detalhamento tratado (hostil por padrão) na spec `5B-2-agendamento-publico-criar-pendente.md`:** 7 ACs **testados** (SQLi, XSS na saída, regex estrita por campo, whitelist estrita, payload limit, serviceId cross-tenant, isolamento por slug), com testes que batem a **API direto** (supertest), sem passar pelo front. Regra de ouro: validação no **backend**, duas camadas independentes (entrada + saída).

Defesas, em camadas:
1. **Pending + confirmação do salão é o antispam primário:** nada é confirmado sozinho; lixo entra como pendente e o salão **recusa**. Não gera custo (sem WhatsApp) nem bloqueia agenda de verdade.
2. **Rate limiting** (`@nestjs/throttler`): limite por **IP** e por **slug** no POST público (ex.: 5/min, 20/h). Global mais frouxo nos GETs.
3. **Janela antispam de 2h (DL-049):** o **mesmo telefone/IP** só pode enviar **nova** solicitação após **2h** — com **mensagem clara na tela**. + honeypot (campo oculto) + validação de telefone (formato BR).
4. **CAPTCHA/Turnstile:** **fora do MVP** — só se aparecer abuso real (evita fricção no "agenda sozinha").
5. **Concorrência** (NFR-C1): a criação reusa o `createAtomic` (serialização por profissional). Para o link, sem profissional atribuído, a checagem é de **capacidade do bloco** (≥1 profissional livre — DL-013); dois pendentes no mesmo slot não se bloqueiam (o salão desempata).

---

## 6. LGPD (NFR-S2)

Página aberta coletando **nome + telefone** exige aviso de privacidade:
- **Aviso inline + consentimento obrigatório:** checkbox "Concordo que o salão guarde meu nome e WhatsApp para gerenciar o atendimento" — botão de agendar **desabilitado** até marcar.
- **Link para política de privacidade** — página estática simples no MVP.
- **Minimização:** só nome + telefone (nada além). Opcional: gravar `consented_at` no pending (barato, ajuda auditoria).
- Reaproveita o tom do NFR-S2/NFR-S3 já usados no Épico 1.

---

## 7. `source` — valor novo no enum

- Enum atual: `whatsapp | manual | app`. `app` está **reservado** (app da cliente, futuro).
- **Adicionar `link`** (agendamento pela página pública). Migração **aditiva** (`ALTER TABLE appointments MODIFY source ENUM(...)`).
- Front: o card da agenda ganha um ícone para `link` (ex.: globo/link) ao lado dos de WhatsApp/manual.
- Recomendo **`link`** (claro, casa com "agendamento por link"); alternativa `public`. **Decidir.**

---

## 8. Multi-serviço (carrinho / `group_id`, DL-040)

A cliente vai querer **cílios + sobrancelha** → o carrinho reaparece. O DL-040 já decidiu o modelo (N `appointments` agrupados por `group_id` nullable, encadeados, **aditivo**).

**Ponto a favor no link:** como o link **não atribui profissional** (igual ao bot — DL-013), some a parte difícil do DL-040 (encadear especialistas diferentes). A disponibilidade do carrinho vira **"o salão tem capacidade para a duração somada a partir de um início"** — bem mais simples que encadear por profissional.

**Recomendação de escopo:** **cortar do primeiro ship**; entra como **Story 6.5** logo depois. MVP-mínimo = **1 serviço por agendamento**. Assim a cliente "agenda sozinha" no menor caminho, e o carrinho vem em seguida com o `group_id` (migração aditiva). **Se o cliente travar nisso**, promovo a 6.5 para dentro do MVP. **Decidir.**

---

## Dimensionamento — stories, MVP, cortes

**Épico 6 — Agendamento pela Cliente (link público):**

| Story | Escopo | MVP? |
|---|---|---|
| **6.1** | Fundação pública: `PublicBookingController` (slug→tenant, PRE_TENANT + guard-rail), branding público (§4) e lista de serviços | **Sim** |
| **6.2** | Disponibilidade pública + **criar pendente** (source=`link`, sem profissional), LGPD (consent) + rate-limit/antispam, tela de sucesso | **Sim** |
| **6.3** | **Pendentes no painel**: tela Pendentes + confirmar (atribui profissional = 3.5) / recusar com justificativa (FR-B1/B2/B4) | **Sim** |
| **6.4** | **Polling/badge** de pendentes (NFR-A3, UX-DR7, 6.9): background 15–30s, badge, toast, sem reload | **Sim** (recomendado) |
| **6.5** | **Carrinho multi-serviço** (`group_id`, DL-040) — cortável | Não (fast-follow) |

- **MVP mínimo shippável** = **6.1 + 6.2 + 6.3** ("cliente agenda → pendente → salão confirma"). **6.4** eleva de "funciona" para "usável no dia a dia" (salão vê pendentes sem F5) — recomendo incluir.
- **Cortes conscientes do primeiro ship:** carrinho multi-serviço (6.5); notificação automática à cliente (depende do canal — Épico 7); página de status/acompanhamento para a cliente além do "sucesso" (futuro).
- **Tamanho:** 4 stories (MVP) + 1 (fast-follow). Comparável ao Épico 3/4.

---

## Épico 7 (renumerado) — Mobile: alinhar o resquício (PWA)

- DL-018: mobile é **somente leitura** (agenda + consulta de pendentes; sem confirmar/recusar/criar).
- **Decisão a formalizar:** mobile = **PWA** (web instalável responsivo), **não** React Native. Remove fricção de app-store e reaproveita o painel (já responsivo, UX-DR7).
- **Sinergia:** o trabalho responsivo da página pública (Épico 6) e do painel já pavimenta o PWA. O "app do profissional" vira essencialmente o painel responsivo instalável + escopo de leitura — pouco código novo.
- Registrar como **DL** quando você aprovar (PWA read-only), e ajustar a descrição do Épico 8 (ex-7).

---

## Impacto no que já existe (nada quebra)

- **`pending` (3.1):** finalmente usado — sem mudança de schema.
- **`AvailabilityService` / `createAtomic`:** reusados (público só resolve tenant por slug antes).
- **3.5 (assign professional):** vira a ação de "confirmar pendente" — a dependência que já estava anotada.
- **`InstallationController` autenticado:** intacto; branding público é endpoint separado.
- **Migrações aditivas:** `source += link`; `group_id` só quando o carrinho (6.5) entrar.
- **Guard-rail de tenant (DL-027):** o novo controller público entra em `PRE_TENANT_CONTROLLERS` — exceção testada.

---

## Decisões (revisão do Renato — 2026-07-25)

| # | Decisão | Resolução |
|---|---|---|
| **P1** | Numeração | ✅ **Link = "Épico 5B"** (rótulo, zero churn); bot fica 6, mobile 7 |
| **P2** | Pendentes migram para a fundação do link | ✅ **Sim** — bot reusa depois *(recomendação aceita)* |
| **P3** | `source` novo valor | ✅ **`link`** *(recomendação aceita)* |
| **P4** | Multi-serviço no MVP | ✅ **Cortar** — Story 5B.5 fast-follow |
| **P5** | Polling/badge no MVP | ✅ **Incluir** (5B.1–5B.4) |
| **P6** | Notificação à cliente no MVP | ✅ **Fora** (depende do canal — Épico 6/bot); MVP só tela de sucesso *(recomendação aceita)* |
| **P7** | Mobile = PWA read-only | ✅ **Sim** — formalizar DL *(recomendação aceita)* |
| **P8** | 3.7 (no-show/concluído) | ✅ **Intercalar: 3.7 primeiro**, fecha o Épico 3, depois o link |

> Numeração escolhida = **"5B"** (zero churn). As stories viram **5B.1–5B.4** (+ 5B.5 carrinho). Quando você der o **go do link** (depois da 3.7), escrevo as specs 5B.1–5B.4 e atualizo epics.md/decision-log; **aviso para subir ao Contexto**.

> Quando você bater P1–P8, eu: (a) escrevo as specs 6.1–6.4 (e 6.5 se entrar), (b) atualizo `epics.md` (novo Épico 6 + renumeração + retrato com 3.6 mergeada) e o decision-log (DLs do link: pré-tenant público, branding público, pendentes-como-fundação, source=link, PWA), e (c) te aviso para subir ao Contexto. **Nada disso antes da sua revisão.**
