# Story 3.3: Agendamento manual pelo painel

Status: **aprovada — em implementação** (Renato aprovou as 7 decisões, indo nas recomendações, em 2026-07-17)

> **Épico 3 — full-stack.** É onde o salão **finalmente marca um horário**: a criação
> transacional (`createAtomic`) adiada da 3.1 (DL-002/D2) aterrissa aqui, com o primeiro
> criador real. Reutiliza o **`AvailabilityService`** (3.1) para sugerir horários livres e o
> **FAB "+ Novo agendamento"** da agenda (3.2). Entrega: endpoint de criação + endpoints
> mínimos de `clients` (busca + cadastro inline) + a tela de novo agendamento.

## Story

As a dono/funcionário/profissional,
I want criar um agendamento manualmente definindo quem atende,
so that eu registre clientes que chegam pessoalmente ou por telefone.

## Acceptance Criteria

1. **(AC1 — Quem atende, FR-D5/DL-009)** Dono/funcionário (`owner`/`manager`) escolhem
   **qualquer** profissional que atende; o profissional (`basic`) cria **só para si** — o campo
   "Profissional" nem aparece para ele (força `professional_id = self`).

2. **(AC2 — Criação confirmada, FR-D6/FR-K3)** Ao salvar, o agendamento entra com
   `source = manual`, `status = confirmed`, **sem** fluxo de aprovação. A tela deixa isso
   explícito ("Entra como: **Confirmado**, sem aprovação"). Registra `created_by_user_id` (FR-K2).

3. **(AC3 — Cliente: busca + cadastro inline, FR-D7)** O campo de cliente **busca em tempo real**
   (nome/telefone); não achando, dá para criar a cliente inline ("+ Nova") — **nome obrigatório**,
   **WhatsApp opcional** (normalizado E.164 quando informado — reusa `normalizePhoneBR` da 3.1).

4. **(AC4 — Validação de data/horário)** A data deve ser **hoje ou futura** (fuso do tenant);
   passado é bloqueado. Slot **já ocupado** gera **aviso, não bloqueio** (overbooking permitido
   para encaixes/walk-ins — ver D1).

5. **(AC5 — Sem notificação, FR-D8)** Cliente sem WhatsApp → **nenhuma** notificação automática é
   disparada (no MVP manual não há notificação de qualquer forma; o campo só alimenta o cadastro).

6. **(AC6 — Atomicidade, NFR-C1/DL-002)** A escrita roda em **transação** com
   `SELECT ... FOR UPDATE` nas linhas do profissional no dia — a máquina reutilizável que o **bot
   (Épico 6)** vai chamar com bloqueio rígido. No manual, o conflito vira **aviso** (D1).

7. **(AC7 — Agenda reflete)** Criado o agendamento, a **agenda (3.2)** passa a exibi-lo (a tela
   volta/atualiza para o período do novo agendamento).

## Pré-requisitos e contexto

- **Story 3.1 (base):** `appointments`, `clients` (base), `AvailabilityService` (`getDaySlots`,
  `hasAvailableSlot` **apto a `FOR UPDATE`** via `excludeAppointmentIds`) — tudo no `main`.
- **Story 3.2 (agenda):** o FAB "+ Novo agendamento" e o `AppointmentsModule` (listagem). **Esta
  branch nasceu da 3.2; rebasear em `main` após o merge da 3.2.**
- **`clients` ainda não tem endpoints** (DL-002/D7: base sem CRUD) — a 3.3 adiciona **busca** e
  **cadastro inline**; a gestão completa é do Épico 4.
- **Multi-tenancy/guard-rail (1.3):** `ClientsController` novo é tenant-aware → registrar em
  `TENANT_AWARE_CONTROLLERS`. O `AppointmentsController` (já registrado) ganha o `POST`.
- **Permissões (1.4):** `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)`; a regra "profissional
  só cria para si" é aplicada no service (DL-022), não com `@Roles` (todos criam).

## Backend

### Criação atômica — `AppointmentsService.createManual`
- **`POST /api/appointments`** com body: `client_id`, `service_id`, `professional_id` (null =
  não atribuído; para `basic` é ignorado e forçado a `self`), `scheduled_at` (instante UTC do
  slot escolhido — a tela usa o `startUtc` que o `/availability` já devolve).
- **Fluxo transacional (AC6):** abre transação → `SELECT ... FOR UPDATE` nos `appointments` do
  profissional no dia → calcula conflito via `hasAvailableSlot` (motor da 3.1) → **insere** com
  **snapshots** `duration_minutes` e `price_snapshot` copiados do serviço no ato (null se sem
  preço — DL-030) → commit. `source=manual`, `status=confirmed`, `created_by_user_id=self`.
- **Overbooking (D1):** conflito **não** aborta no manual; retorna o agendamento criado + flag
  `overbooked: true` (a tela já avisou na seleção). Método preparado para o bot chamar com
  `enforce=true` (rejeita no conflito) — sem construir o caminho do bot agora.
- **Validação:** data hoje-ou-futura (fuso do tenant); serviço ativo; profissional (quando dado)
  atende e executa o serviço; cliente do tenant. Swagger (`POST` em `@ApiTags('appointments')`).

### Endpoints mínimos de `clients` — `ClientsController`
- **`GET /api/clients?search=`** — busca tenant-scoped por nome **ou** telefone (parcial), limite
  pequeno; para o autocomplete em tempo real.
- **`POST /api/clients`** — cadastro inline: `name` (obrigatório), `phone_whatsapp` (opcional →
  `normalizePhoneBR`). Retorna a cliente criada. Tenant-aware (guard-rail 1.3.01).

## Frontend — novo agendamento

- Aberto pelo **FAB "+ Novo agendamento"** da agenda (3.2). Forma: ver **D4**.
- Campos: **Cliente** (busca com autocomplete + "+ Nova" inline), **Serviço**, **Profissional**
  (oculto para `basic`), **Data**, **Horário** (sugere slots livres via `GET /availability` da
  3.1; ver **D7**). Texto fixo "Entra como: Confirmado, sem aprovação" (AC2).
- **Aviso de overbooking (AC4):** ao escolher um horário fora dos slots livres, aviso inline
  ("Este horário já tem agendamento — deseja encaixar?") sem bloquear o salvar.
- Ao salvar: `POST /api/appointments`; sucesso → volta para a agenda no dia do novo agendamento.

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** construir o caminho do **bot** (`enforce=true` fica pronto, mas sem consumidor — Épico 6).
- **NÃO** implementar **cancelamento** (Story 3.4) nem **editar** agendamento.
- **NÃO** implementar **gestão de clientes** (listagem/edição/exclusão — Épico 4); só busca + criação.
- **NÃO** disparar **notificação** de qualquer tipo (FR-D8; notificações são do bot, Épico 6).
- **NÃO** implementar **pagamento** (Épico 5) nem **no_show** (`3.2.NN`).

## Tasks / Subtasks

**Backend — criação atômica:**
- [ ] `CreateAppointmentDto` (`client_id`, `service_id`, `professional_id?`, `scheduled_at`).
- [ ] `AppointmentsService.createManual(dto, user)`: transação + `SELECT ... FOR UPDATE` nas linhas do profissional no dia; conflito via `AvailabilityService.hasAvailableSlot` (excludeAppointmentIds das linhas travadas); snapshots; `source=manual`/`status=confirmed`/`created_by_user_id`; `basic`→`self`; retorna `{ appointment, overbooked }`.
- [ ] Método interno `createAtomic({ ..., enforce })` — `enforce=true` lança conflito (409) para o bot (Épico 6); `createManual` chama com `enforce=false`.
- [ ] Validações: data hoje-ou-futura (fuso do tenant); serviço ativo; profissional atende+executa; cliente do tenant.
- [ ] `POST /api/appointments` no `AppointmentsController` (+ Swagger).

**Backend — `clients` (busca + inline):**
- [ ] `ClientsService` (search + create) sobre o `ClientsRepository` (3.1); `POST` usa `normalizePhoneBR`.
- [ ] `ClientsController`: `GET /api/clients?search=`, `POST /api/clients`; DTOs; guards; `@ApiTags('clients')`; registrar em `TENANT_AWARE_CONTROLLERS`.

**Frontend — modal Novo agendamento:**
- [ ] `NovoAgendamento` (dialog) aberto pelo FAB da agenda; campos cliente (autocomplete + "+ Nova"), serviço, profissional (oculto p/ `basic`), data, horário (slots de `/availability` + "outro horário").
- [ ] Texto fixo "Entra como: Confirmado, sem aprovação"; aviso de overbooking inline; `POST` → volta p/ a agenda no dia criado.

**Testes:**
- [ ] **Concorrência (e2e):** 2 `createAtomic` simultâneos, mesmo slot, `enforce=true` → só um grava, o outro 409.
- [ ] Unit: `basic`→self; snapshots; validação de data passada; overbooked flag (manual não bloqueia).
- [ ] e2e: `POST /appointments` (papéis, isolamento); `clients` search + create.
- [ ] Front: visibilidade do campo profissional por papel; criação inline de cliente; aviso de overbooking; submit.

## Decisões — **aprovadas por Renato (2026-07-17, indo nas recomendações)** ✅

| # | Decisão | Resolução aprovada |
|---|---|---|
| **D1** | **Overbooking no manual.** | ✅ Manual **sempre grava** (dado válido); slot ocupado é **aviso** (na tela + flag `overbooked`), nunca 4xx. |
| **D2** | **Atomicidade (`createAtomic`/`FOR UPDATE`).** | ✅ Máquina transacional **construída agora** com flag `enforce`: **manual=false** (avisa), **bot depois=true** (bloqueia). Honra DL-002/D2. |
| **D3** | **Endpoints de `clients`.** | ✅ `GET /clients?search=` + `POST /clients` nesta story; gestão completa fica no Épico 4. |
| **D4** | **Forma da tela** (UX-DR10). | ✅ **Modal/drawer** sobre a agenda. |
| **D5** | **Snapshots na criação.** | ✅ `duration_minutes` + `price_snapshot` copiados do serviço no ato (preço null — DL-030); `created_by_user_id = self`. |
| **D6** | **Campo Profissional** (FR-D2/DL-009). | ✅ `owner`/`manager` escolhem qualquer um; `basic` não vê o campo e grava `self` (regra no service). |
| **D7** | **Seleção de horário.** | ✅ **Slots livres** (via `/availability`) **+ opção "outro horário"** com o aviso da D1. |

> **Ponto crítico de teste (Renato):** teste de **concorrência** — duas criações simultâneas no
> mesmo slot com `enforce=true` provando que **só uma grava** (o `SELECT ... FOR UPDATE` serializa).

## References

- [Source: epics.md#Story 3.3] — ACs (FR-D5–D8, FR-K2/K3, UX-DR10).
- [Source: prd.md#FR-D5–D8] — quem atende, criação confirmada, cliente inline, sem notificação;
  [#FR-K2/K3] — auditoria do criador + estado inicial por origem.
- [Source: .decision-log.md#DL-002 D2] — `createAtomic` transacional é desta story; [#DL-009] —
  agendamento manual; [#DL-022] — papéis; [#DL-030] — preço opcional; [#DL-023] — no_show é `3.2.NN`.
- [Source: architecture.md#4.6 AvailabilityService / #4.7 AppointmentsModule; #NFR-C1] — atomicidade `SELECT ... FOR UPDATE`.
- [Source: ux-spec.md#UX-DR10] — tela de novo agendamento manual.
- Stories 3.1 (motor de disponibilidade + base `clients`) e 3.2 (agenda + FAB) — dependências diretas.

## Dev Agent Record

*(a preencher na implementação, após aprovação das decisões)*
