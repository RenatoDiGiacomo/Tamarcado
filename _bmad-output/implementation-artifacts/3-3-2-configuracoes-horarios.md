# Story 3.3.2: Configurações → Horários (grade semanal por profissional)

Status: **aprovada — em implementação** (Renato aprovou D1–D5 + 2 acréscimos em 2026-07-19)

> **Painel de Configurações — UI only.** Preenche a aba **Horários** que hoje está
> "em breve". A API já existe desde a **Story 1.6** (`GET`/`PUT /schedules/:professionalId`,
> owner-only, `slot_interval_minutes` por profissional — DL-032). **Sem mudança de backend.**
> Segue o padrão das abas de Configurações (casca `ConfiguracoesTabs` + componentes do DS,
> como Identidade/Serviços na 2.1.03).
>
> **Numeração (coerência — Winston):** rotulada **3.3.2** por urgência de desbloqueio do
> agendamento manual (sem ela o dono dependia de SQL/seed, e a mensagem apontava para uma aba
> desabilitada). É **funcionalidade nova do Painel de Configurações**, não um ajuste da Story 3.3
> — o rótulo `X.Y.NN` (DL-028) foi usado por velocidade; **documentado, não renomeado** (ver DL
> nova). A aba **Equipe** também segue sem UI (registrada como pendência).

## Story

As a dono do salão,
I want configurar, por profissional, os dias e horários de atendimento e o intervalo entre atendimentos,
so that a disponibilidade da agenda reflita a realidade — sem depender de SQL/seed.

## Acceptance Criteria

1. **(AC1 — Aba habilitada)** A aba **Horários** deixa de ser "em breve": vira uma `NavLink`
   ativa (`/configuracoes/horarios`) na `ConfiguracoesTabs`, no mesmo padrão de Serviços/Identidade.
   Owner-only (a seção Configurações já redireciona não-donos).

2. **(AC2 — Escolha do profissional)** A tela lista os profissionais que atendem
   (`GET /users/attenders`); ao escolher um, carrega a grade dele (`GET /schedules/:id`) —
   `{ intervalMinutes, days }`. Como o GET traz só os dias com registro, a tela **reconstrói os 7
   dias** (dias ausentes = inativos).

3. **(AC3 — Grade por dia, FR-G2)** Para cada dia **Seg…Dom**: um **toggle ativo/inativo** e os
   campos de **início** e **fim** (desabilitados quando o dia está inativo). Ao ativar um dia sem
   horário, entra um default (09:00–18:00).

4. **(AC4 — Intervalo, FR-G3/DL-032)** Um campo de **intervalo entre atendimentos** (0–120 min)
   por profissional.

5. **(AC5 — Salvar a semana, FR-G2)** Um único **Salvar** envia `PUT /schedules/:id` com
   `{ interval_minutes, days[] }` (o PUT **substitui** toda a grade). Validação: **fim > início**
   nos dias ativos — client-side com mensagem clara + o backend também rejeita (400 "Faixa
   inválida"). Feedback de sucesso.

6. **(AC6 — Disponibilidade reflete)** Depois de salvar um horário, o **modal de novo agendamento**
   passa a oferecer os slots daquele horário (validação end-to-end — ver §Verificação).

7. **(AC7 — "Sem horários" no seletor)** No seletor de profissional, quem ainda **não tem
   horário configurado** aparece marcado (ex.: "Ana Prof · sem horários"), para o dono não
   esquecer alguém e depois não entender por que a agenda dela não oferece slot.

8. **(AC8 — Aplicar a todos)** Um botão **"Aplicar a todos os profissionais"** grava a grade +
   intervalo **atuais da tela** para **todos** os que atendem (um `PUT` por profissional), com
   **confirmação** ("Aplicar este horário aos N profissionais?"). Resolve o caso comum (equipe no
   mesmo horário) — configura uma vez, aplica a todos. Feedback ao concluir; os selos "sem
   horários" somem.

## Pré-requisitos e contexto

- **API (Story 1.6, sem mudança):**
  - `GET /api/schedules/:professionalId` → `{ professionalId, intervalMinutes, days: [{ dayOfWeek, startTime, endTime, isActive }] }` (só os dias gravados).
  - `PUT /api/schedules/:professionalId` (owner) — body `{ interval_minutes: 0–120, days: [{ day_of_week: 0–6, start_time: "HH:MM", end_time, is_active }] }` → devolve a view atualizada. Valida `end>start` nos dias `is_active`, e que o profissional atende (DL-022).
- **`day_of_week`:** 0=Dom … 6=Sáb (getUTCDay). A tela exibe **Seg primeiro** (mapeia a ordem).
- **Casca:** `ConfiguracoesTabs` (aba), `Configuracoes` (shell owner-only), rota no `App.tsx`
  (`/configuracoes/horarios`). DS: `Card`, `Input`, `Label`, `Button`, toggle/segmented.
- **Consumo:** o `AvailabilityService` já lê `professional_schedules` (dias `is_active`) — por isso
  salvar aqui muda o que o modal de agendamento oferece (AC6).

## Backend

**Nenhuma mudança.** Reusa `SchedulesController`/`SchedulesService` da 1.6 (já tenant-aware,
owner-only, no Swagger). Esta story é **frontend puro**.

## Frontend — aba Horários

- **Rota** `/configuracoes/horarios` (nova `<Route>` no bloco Configurações do `App.tsx`);
  habilitar a aba na `ConfiguracoesTabs` (trocar `to: null` por `to: "/configuracoes/horarios"`).
- **`ConfiguracoesHorarios`:** seletor de profissional (atendentes) → carrega a grade →
  editor dos 7 dias (toggle + início/fim) + intervalo → **Salvar** (PUT). Mapeia
  `dayOfWeek 0..6` para a ordem Seg…Dom na exibição e de volta no envio.
- **Estados:** carregando, salvo (feedback), erro (mostra a mensagem real da API — padrão da 3.3.1).

## Verificação (obrigatória antes de fechar)

Configurar um horário real **pela tela**, salvar, e confirmar que o **modal de novo agendamento**
passa a oferecer os slots daquele horário. **Screenshot dos dois** (a tela de Horários salva + o
modal com os chips do horário configurado).

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** mexer no backend de schedules (1.6) nem no `AvailabilityService`.
- **NÃO** construir a aba **Equipe** (fica como pendência registrada — DL nova).
- **NÃO** adicionar exceções/feriados nem horários por serviço (fora do MVP).

## Tasks / Subtasks

- [ ] `ConfiguracoesTabs`: habilitar a aba **Horários** (`to: "/configuracoes/horarios"`).
- [ ] `App.tsx`: rota `/configuracoes/horarios` → `ConfiguracoesHorarios`.
- [ ] `ConfiguracoesHorarios`: seletor de profissional (`/users/attenders`) com selo **"sem
      horários"** (AC7 — carrega o `GET /schedules/:id` de cada atendente no mount).
- [ ] Editor da semana: 7 dias (Seg…Dom) com toggle + início/fim; reconstrução dos ausentes
      (D2); intervalo 0–120 (D5); validação `fim>início` (D4).
- [ ] **Salvar** → `PUT /schedules/:id` (7 dias, D3); feedback + erro com mensagem real da API.
- [ ] **Aplicar a todos** (AC8): confirma → `PUT` para cada atendente com a grade atual → recarrega selos.
- [ ] Testes (Vitest): mapeamento dias↔ordem Seg-Dom, reconstrução dos 7 dias, validação de faixa,
      selo "sem horários", montagem do body do PUT, fluxo "aplicar a todos".

## Decisões — **aprovadas por Renato (2026-07-19)** ✅

| # | Decisão | Resolução |
|---|---|---|
| **D1** | Seletor de profissional | ✅ `<select>` no topo. **+Acréscimo (AC7):** marca quem está **"sem horários"**. |
| **D2** | Reconstrução dos 7 dias (default 09:00–18:00 ao ativar) | ✅ |
| **D3** | PUT envia os 7 dias sempre (backend ignora inativos) | ✅ |
| **D4** | Validação `fim>início` client-side + 400 do backend | ✅ |
| **D5** | Intervalo: `Input` numérico 0–120 com dica | ✅ |
| **+A** | **Aplicar a todos os profissionais** (AC8) — configura uma vez, aplica a todos, com confirmação | ✅ incluído nesta story (ganho direto na demo ao vivo) |

## References

- [Source: epics.md#UX-DR13] — Configurações, subseção Horários (toggle de dia + intervalo).
- [Source: prd.md#FR-G2/FR-G3] — dono configura horários por profissional + intervalo.
- [Source: .decision-log.md#DL-032] — intervalo por profissional, teto 120min; [#Story 1.6] — API de schedules.
- [Source: .decision-log.md#DL-028] — versionamento X.Y.NN; [#nova DL] — coerência de numeração (3.3.2 = Painel de Configurações) + pendência Equipe.
- Story 2.1.03 — casca de Configurações (abas horizontais) + Identidade/Serviços (padrão a seguir).

## Dev Agent Record

*(a preencher na implementação, após aprovação das decisões)*
