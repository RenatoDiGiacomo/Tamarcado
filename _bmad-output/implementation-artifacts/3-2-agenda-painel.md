# Story 3.2: Agenda do painel (dia/semana)

Status: **aprovada — em implementação** (Renato aprovou as 6 decisões em 2026-07-17)

> **Épico 3 — full-stack.** Popula a **casca `AgendaGrid`** (já pronta da Story 2.1/DL-036 —
> bonita, com cards por status, ícones de origem, "Não atribuído", toggle Dia/Semana, scroll
> com cabeçalho fixo da 2.1.01) com **dados reais** dos `appointments` (Story 3.1). Entrega o
> endpoint de listagem + a tela Agenda. **NÃO reconstrói a grade** — só a alimenta.

## Story

As a dono/funcionário/profissional,
I want ver a agenda em dia/semana com status e origem,
so that eu acompanhe os agendamentos do salão de relance.

## Acceptance Criteria

1. **(AC1 — Agenda dia/semana reutilizando `AgendaGrid`)** A tela Agenda **reutiliza** o
   `AgendaGrid` do Design System (DL-036) — não constrói a grade do zero. As visões **Dia** e
   **Semana** exibem os `appointments` reais do período, com cores por status (verde/confirmado,
   cinza/concluído, vermelho riscado/cancelado, cinza-escuro/não compareceu). *(Mês → `3.2.NN`;
   status `pending` só com o bot, Épico 6.)*

2. **(AC2 — Dados reais da API)** Um endpoint lista os `appointments` do tenant por período,
   com `clientName` (clients), `serviceName` (salon_services), `professionalName` (users) e
   horário; a tela mapeia para o formato do `AgendaGrid`. Escopado por tenant (NFR-S1).

3. **(AC3 — Papéis, FR-D2)** Dono/funcionário (`owner`/`manager`) veem todos os profissionais;
   profissional (`basic`) vê apenas os próprios (`professional_id = self`) e os não atribuídos
   (`professional_id IS NULL`) — DL-022.

4. **(AC4 — Cada entrada, FR-D3/FR-K4)** Cada card mostra cliente, serviço, horário, status e
   ícone de origem (lápis = manual; balão = whatsapp); **"Não atribuído"** em itálico cinza
   quando `professional_id` é nulo.

5. **(AC5 — Filtro por origem, FR-K5)** O filtro `[Todos] [WhatsApp] [Manual]` (já na casca)
   opera sobre os dados reais.

6. **(AC6 — Estados)** **Dia cheio** renderiza os cards posicionados por horário; **dia vazio**
   mostra um estado vazio padronizado (UX-DR17) em vez da grade vazia.

7. **(AC7 — Navegação e período)** Avançar/voltar (‹ ›) muda o dia (visão Dia) ou a semana
   (visão Semana); a troca Dia/Semana recarrega o período correto. Faixa horária da grade a
   partir do horário comercial do tenant (ver D5). Respeita o `timezone` do tenant (ADR-008).

## Pré-requisitos e contexto

- **Story 3.1 (dependência):** `appointments` (+ `AvailabilityService`) no `main`. **Esta branch
  nasceu da 3.1; rebasear em `main` após o merge da 3.1 antes de implementar.**
- **Casca `AgendaGrid`** (`apps/web/src/components/agenda/AgendaGrid.tsx`) — já entrega:
  toggle Dia/Semana e filtro de origem (estado **interno**, ver Nota técnica), cards por status,
  ícones origem, "Não atribuído", FAB "+ Novo agendamento", scroll com cabeçalho fixo (2.1.01).
  Recebe `appointments: AgendaAppointment[]` (id, clientName, serviceName, start/end "HH:MM",
  status, origin, professionalName, weekday?) + `businessHours` + `dateLabel` + callbacks.
- **`StatusChip`** usa `pending|confirmed|done|cancelled|noshow` — **mapear** do backend:
  `completed → done`, `no_show → noshow` (os demais batem).
- **Multi-tenancy/guard-rail (1.3):** o `AppointmentsController` novo é tenant-aware → registrar
  em `TENANT_AWARE_CONTROLLERS`.
- **Permissões (1.4):** `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)`; a listagem é
  leitura (sem `@Roles`), mas o **filtro por papel** é aplicado no service (DL-022).
- **DS/telas (2.1):** `PageLayout`, `EmptyState`, tokens; a tela vive numa rota do shell.

## Backend — `AppointmentsModule` (listagem)

- **`GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD`** (datas civis no fuso do tenant;
  convertidas para o range UTC). Retorna os agendamentos não deletados do período, com os nomes
  resolvidos (join `clients`/`salon_services`/`users`). Ordena por `scheduled_at`.
- **Filtro por papel (AC3/DL-022):** `owner`/`manager` → todos; `basic` → `professional_id =
  self OR professional_id IS NULL`. Aplicado no service (não no controller).
- **Shape de resposta (por item):** `id`, `clientName`, `serviceName`, `professionalName|null`,
  `startUtc`/`start` (HH:MM no fuso), `end`, `status`, `source`. *(A tela deriva `weekday` e faz
  o mapeamento de status.)*
- **Tenant-aware** via repositório apropriado (satisfaz o guard-rail 1.3.01) + Swagger
  (`@ApiTags('appointments')`).

## Frontend — tela Agenda

- Rota no shell (ex.: `/agenda`), usando `PageLayout` + `AgendaGrid`.
- Busca `GET /api/appointments` para o período atual; mapeia cada item para `AgendaAppointment`
  (status→StatusChip; `weekday` = dia da semana de `scheduled_at` no fuso, 0=Seg..6=Dom).
- `dateLabel` formatado (`Dia, DD/MM`); `onPrev`/`onNext` movem o período; `onNew` → agendamento
  manual (Story 3.3, por ora pode navegar/placeholder); `onSelect` → detalhe read-only (D3).
- **Empty state** (AC6) quando o período não tem agendamentos.

### Nota técnica (integração com a casca)

O `AgendaGrid` hoje controla `view` (Dia/Semana) em **estado interno**. A tela precisa saber a
visão para buscar o período certo (1 dia × 7 dias). Proposta (ver D6): **elevar `view` para a
tela** — a casca passa a aceitar `view` + `onViewChange` controlados (pequena extensão, sem
reconstruir). Alternativa: a tela sempre busca a semana e deixa a casca filtrar — mas o modo Dia
não sabe qual dia isolar. Recomendo controlar `view` na tela.

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** reconstruir o `AgendaGrid` (é casca pronta — DL-036).
- **NÃO** implementar a visão **Mês** (fica `3.2.NN`) nem o status **pending** (Épico 6, bot).
- **NÃO** implementar **criar** agendamento (Story 3.3) nem **cancelar** (Story 3.4).
- **NÃO** implementar o **polling de pendentes** / badge (Épico 6).
- **Marcar "não compareceu" (FR-D9):** fora da 3.2 → vira `3.2.NN` (D2 aprovada).

## Tasks / Subtasks

**Backend — `AppointmentsModule` (listagem):**
- [ ] `AppointmentsRepository` tenant-aware (estende `TenantAwareRepository<Appointment>`).
- [ ] `AppointmentsService.listByPeriod(from, to, user)`: converte datas civis (fuso do tenant) → range UTC; join `clients`/`salon_services`/`users`; filtro por papel (DL-022); ordena por `scheduled_at`.
- [ ] `ListAppointmentsQueryDto` (`from`, `to` — `YYYY-MM-DD`, validados).
- [ ] `AppointmentsController` `GET /api/appointments` com guards + `@ApiTags('appointments')`; registrar em `TENANT_AWARE_CONTROLLERS`.
- [ ] `AppointmentsModule` (forFeature + TenantModule + UsersModule) no `AppModule`.

**Frontend — tela Agenda:**
- [ ] Elevar `view`/`onViewChange` no `AgendaGrid` (D6) — props controladas, default interno preservado.
- [ ] `agendaApi.list(from, to)` + hook de fetch por período.
- [ ] Página `Agenda` (rota no shell): mapeia resposta → `AgendaAppointment` (status→StatusChip, `weekday` no fuso); `dateLabel`; `onPrev`/`onNext`; empty state (AC6); `onSelect` → drawer read-only (D3).
- [ ] Faixa horária via `business_hours_start/end` do tenant (D4).

**Seed:** agendamentos de exemplo (variados: status, origem, com/sem profissional) para a agenda ter dados realistas.

**Testes:** unit do filtro por papel + mapeamento de datas/fuso (backend); e2e da listagem (isolamento tenant, papéis, período); unit do mapeamento status/weekday e empty state (frontend).

## Decisões — **aprovadas por Renato (2026-07-17)** ✅

| # | Decisão | Resolução aprovada |
|---|---|---|
| **D1** | **Disponibilidade na agenda?** A agenda **mostra agendamentos**; a disponibilidade (slots livres) é o motor do **agendamento manual (3.3)**. | ✅ A 3.2 exibe **appointments**; a disponibilidade entra na **3.3**. Renato: "eu tinha misturado os conceitos — ver o que está marcado (3.2) é diferente de oferecer horário livre (3.3)". |
| **D2** | **Marcar "não compareceu" (FR-D9)** exige menu de contexto no card + endpoint `PATCH`. | ✅ A 3.2 = **visualização**; o **no-show** vira **`3.2.NN`** logo após. Mantém a 3.2 enxuta. |
| **D3** | **Ação ao clicar no card (`onSelect`)**. | ✅ **Detalhe read-only** (drawer: cliente, serviço, horário, status, profissional). Mutações depois. |
| **D4** | **Faixa horária da grade** — origem do `businessHours`. | ✅ `companies.business_hours_start`/`_end`. |
| **D5** | **Endpoint** `GET /api/appointments?from&to`. | ✅ Aprovado o shape/rota. |
| **D6** | **Controlar `view` (Dia/Semana) na tela** (casca aceita `view`/`onViewChange`). | ✅ Elevar o estado (lifting state up); extensão pequena da casca, sem reconstruí-la. |

## References

- [Source: epics.md#Story 3.2] — ACs (FR-D1–D3, FR-D9, FR-K4/K5, UX-DR8).
- [Source: epics.md#Story 2.1 / DL-036] — `AgendaGrid` é casca do DS; a 3.2 popula, não reconstrói.
- [Source: architecture.md#3.7 appointments] — campos/enums; [#4.7 AppointmentsModule] — papéis por `access_level` (DL-022).
- [Source: prd.md#FR-D2] — visibilidade por papel; [#FR-D3/K4] — card e origem; [#FR-D9/DL-023] — no_show.
- [Source: ux-spec.md#UX-DR8] — grade dia/semana, cores por status, origem, filtro; [#UX-DR17] — estados vazios.
- Story 2.1.01 — padrão de scroll com cabeçalho fixo (já na casca).

## Dev Agent Record

*(a preencher na implementação, após aprovação das decisões)*
