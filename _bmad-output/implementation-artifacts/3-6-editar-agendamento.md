# Story 3.6: Editar agendamento (remarcação unificada) + redesign do modal de detalhe

Status: **spec para revisão do Renato** · fecha o "U" do CRUD (DL-043) · unifica Editar (DL-044)

> **Duas entregas numa leva.** (A) **Redesign do modal de detalhe** — layout limpo, ícone de origem, status único. (B) **Editar unificado** — um botão *Editar* abre serviço + horário + profissional juntos (reusa o formulário de Novo agendamento), **absorvendo o "trocar profissional" da 3.5** (DL-044). Resolve o paradoxo de atribuir um profissional a um serviço que ele não executa.

---

## Parte A — Redesign do modal de detalhe (UX)

Hoje o modal repete informação e esconde a ação de profissional. Enxugar:

1. **(AC-A1)** Remover a linha **"Origem"** (redundante — vira ícone, AC-A2).
2. **(AC-A2)** **Ícone ao lado do nome da cliente** no título: **balão do WhatsApp** quando `source = whatsapp`; **nada** quando `manual`.
3. **(AC-A3)** **Status aparece uma única vez** — a **badge** no topo, junto ao nome. Remover a linha "Status" duplicada de baixo.
4. **(AC-A4)** Ordem final: **título** (nome + ícone de origem + badge de status) → **Serviço** → **Horário** → **Profissional** (linha read-only) → **ações** (Editar · Cancelar).

O campo Profissional volta a ser uma **linha read-only** simples (nome ou "Não atribuído") — a edição sai dele e vai para o botão Editar (Parte B). O componente `AtribuirProfissional` (select isolado da 3.5) é **aposentado da UI**.

---

## Parte B — Editar unificado (serviço + horário + profissional)

5. **(AC-B1 — Botão Editar)** No modal de detalhe, um botão **Editar** claro e óbvio (ao lado de Cancelar), visível só em *pending*/*confirmed*. Substitui o "trocar" escondido da 3.5.
6. **(AC-B2 — Formulário reusado)** Editar abre o **formulário de Novo agendamento (Story 3.3)**, **pré-preenchido** e em **modo edição**: **serviço, horário e profissional editáveis juntos**. Cliente fica fixo (não se troca a cliente de um agendamento — para isso, cancela e recria). Título "Editar agendamento"; botão "Salvar alterações".
7. **(AC-B3 — Trocar serviço)** Trocar o **serviço** recalcula a **duração**, **reabre a disponibilidade** (`AvailabilityService`, já reage a `serviceId`) e, ao salvar, **re-snapshota** `duration_minutes` e `price_snapshot` do novo serviço.
8. **(AC-B4 — Conflito não bloqueia, D1)** Horário/profissional em conflito **avisa** (`overbooked` informativo) e **deixa seguir** — igual à criação (3.3.1/D1). A sobreposição ignora o **próprio** agendamento.
9. **(AC-B5 — Estado + auditoria)** Só edita *pending*/*confirmed* (senão 400). Grava **auditoria** de quem editou e quando.
10. **(AC-B6 — Registro do que mudou)** Grava um **registro simples de alteração** (campo, de→para, por quem, quando) — resolve a questão em aberto do DL-043. **Não** é versionamento completo do agendamento.

---

## API

- **`PATCH /api/appointments/:id`** — edição unificada. Body (todos opcionais; aplica os deltas informados):
  ```jsonc
  { "serviceId": "…", "date": "YYYY-MM-DD", "time": "HH:MM", "professionalId": "… | null" }
  ```
  - Guards do controller (`JwtAuthGuard, ActiveUserGuard, RolesGuard`). Tenant-aware.
  - **Estado:** só *pending*/*confirmed* → senão **400**.
  - **Permissão (D-B1, a confirmar):** owner/gerente editam qualquer um; `basic` edita **só o próprio** (`professional_id == self`), e **não** pode reatribuir para outra pessoa (o `professionalId` resultante deve ser `self` ou `null`) — mantém o espírito do D5 da 3.5.
  - **Validações:** serviço (quando informado) ativo do tenant; profissional (quando não-nulo) atendente ativo (não exige vínculo — 3.3.1); `date` hoje-ou-futura (mesma regra da criação, AC4/3.3).
  - **Efeito:** recalcula `scheduled_at` de `date`+`time` no fuso do tenant; se `serviceId` mudou, **re-snapshota** `duration_minutes`/`price_snapshot`; aplica `professional_id`; grava auditoria + registro de alteração.
  - **Resposta:** o agendamento atualizado (view) **+ `overbooked: boolean`**.
  - **404** id inexistente/fora do tenant.
- **`PATCH /api/appointments/:id/professional`** (da 3.5) **permanece** — o bot/6.4 atribuem só o profissional programaticamente (DL-044). A UI passa a usar o Editar unificado.

> **Reuso:** a lógica de conflito reaproveita `hasOverlapExcluding(...)` (3.5) e a validação de serviço/profissional espelha `createAtomic`/`assertProfessional` (3.3). Sem transação com `FOR UPDATE` (edição manual não bloqueia — D1); o `overbooked` é informativo, como na 3.5.

## Banco — registro de alteração (D-B2, a confirmar)

Tabela nova **`appointment_changes`** (append-only, migração aditiva):

| coluna | tipo | nota |
|---|---|---|
| `id` | bigint PK | |
| `company_id` | bigint | tenant-scoped |
| `appointment_id` | bigint FK → appointments | |
| `changed_by_user_id` | bigint FK → users | quem editou |
| `changed_at` | datetime | quando |
| `field` | varchar | `service` \| `scheduled_at` \| `professional` |
| `old_value` | varchar null | de |
| `new_value` | varchar null | para |

Uma linha por campo alterado numa edição. É o "registro simples de alteração" do DL-043/DL-044 — **não** snapshot do agendamento inteiro. Índice `(company_id, appointment_id)`.

> **Auditoria "quem editou/quando":** coberta pela própria `appointment_changes` (cada linha tem `changed_by_user_id`/`changed_at`). **Não** adiciona colunas novas em `appointments` para isso (evita `edited_by` redundante com a tabela de mudanças). *(Alternativa a confirmar: se você preferir um "último editor" barato no próprio `appointments`, dá para adicionar `edited_by_user_id`/`edited_at` — digo o trade-off na revisão.)*

## Frontend

- **Modal de detalhe** ([Agenda.tsx](../../apps/web/src/pages/Agenda.tsx)): aplica a Parte A (ícone de origem no título, sem linha Origem, status só na badge do topo, Profissional read-only) e adiciona o botão **Editar**.
- **Formulário reusado** ([NovoAgendamento.tsx](../../apps/web/src/pages/NovoAgendamento.tsx)): ganha um **modo edição** via prop `editing?: { appointmentId, serviceId, professionalId, date, time }`:
  - Pré-preenche serviço/profissional/data/horário; **cliente fixo** (mostra, não edita).
  - Título "Editar agendamento", botão "Salvar alterações".
  - Ao trocar serviço → disponibilidade reabre (já é assim). Conflito → aviso (já é assim).
  - Submit em modo edição → `PATCH /appointments/:id` (em vez de `POST`); ao ok → refetch + fecha.
- **`AtribuirProfissional`** (3.5) é **removido** da Agenda (a UI de atribuição vira o Editar). O arquivo/teste do componente saem.

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** trocar a **cliente** de um agendamento (cancela e recria).
- **NÃO** versionar o agendamento inteiro — só o registro de deltas (`appointment_changes`).
- **NÃO** bloquear por conflito (avisa e segue — D1).
- **NÃO** editar *completed*/*cancelled*/*no_show* (read-only).
- **NÃO** tratar multi-serviço (`group_id` não existe — DL-040).

## Tasks / Subtasks

- [ ] Migração `CreateAppointmentChanges` + entidade.
- [ ] `AppointmentsService.editAppointment(id, dto, actor)` — estado/permissão/validação; recalcula `scheduled_at`, re-snapshot ao trocar serviço; `overbooked` (reusa `hasOverlapExcluding`); grava `appointment_changes` por delta.
- [ ] `AppointmentsController` `@Patch(":id")`.
- [ ] DTO `EditAppointmentDto` (serviceId/date/time/professionalId opcionais, validados).
- [ ] e2e: troca serviço (re-snapshot duração/preço) · troca horário · troca profissional · combinada · `overbooked` sem bloquear · registro de alteração gravado (de→para) · *completed* → 400 · permissão basic · 404.
- [ ] Front (modal): ícone de origem, remover Origem, status único, Profissional read-only, botão Editar.
- [ ] Front (form): modo edição no NovoAgendamento (pré-preenche, cliente fixo, PATCH no submit).
- [ ] Remover `AtribuirProfissional` (componente + teste) da Agenda.
- [ ] Web tests: modal novo (ícone/sem Origem/status único); Editar abre pré-preenchido; troca serviço muda duração/preço; submit faz PATCH.

## Verificação (obrigatória antes de fechar)

Pela tela, screenshots de:
1. **Modal novo** — ícone de origem (WhatsApp) + sem linha Origem + status só na badge do topo.
2. **Botão Editar** visível e óbvio.
3. **Trocar serviço Corte→Coloração** — duração e preço mudam (disponibilidade reabre).
4. **Trocar horário** — novo horário aplicado.

## Decisões

| # | Decisão | Resolução |
|---|---|---|
| **D-B0** | Endpoint | ✅ `PATCH /api/appointments/:id` (edição unificada); `:id/professional` da 3.5 permanece para o bot (DL-044). |
| **D-B1** | Permissão | 🟡 **Recomendado:** owner/gerente qualquer; `basic` só o próprio e sem reatribuir para outra pessoa (espírito do D5). **Confirmar.** |
| **D-B2** | Registro de alteração | 🟡 **Recomendado:** tabela `appointment_changes` (delta por campo), sem colunas novas em `appointments`. **Confirmar** (vs. `edited_by`/`edited_at` no próprio agendamento). |
| **D-B3** | Escopo do editável | ✅ serviço + horário + profissional juntos; **cliente fixo** (cancela e recria para trocar cliente). |
| **D-B4** | Conflito | ✅ Avisa e segue (D1); `overbooked` informativo; ignora o próprio agendamento. |
| **D-B5** | Re-snapshot | ✅ Ao trocar serviço, refaz `duration_minutes`/`price_snapshot` do novo serviço. |

## References

- [Source: epics.md#Story 3.6] · [.decision-log.md#DL-044] (unificação) · [#DL-043] (fatiamento, questão aberta) · [#DL-042] (disciplina de doc).
- Story 3.5 (`assignProfessional`, `hasOverlapExcluding`, auditoria `assigned_by`) — base reaproveitada.
- Story 3.3 (`createAtomic`, `assertProfessional`, `AvailabilityService`, formulário `NovoAgendamento`) — lógica e UI reusadas.
- Story 3.4 (`cancelled_by_user_id`, padrão de auditoria e de endpoint `PATCH :id/ação`).

## Dev Agent Record

*(a preencher na implementação)*
