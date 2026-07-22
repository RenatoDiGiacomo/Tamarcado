# Story 3.4: Cancelamento pelo painel

Status: **aprovada — em implementação** (Renato aprovou em 2026-07-21; D1 = adicionar `cancelled_by_user_id`)

> **Fecha o C**RUD** de agendamento pelo painel** — hoje o modal de detalhe é read-only ([Agenda.tsx](../../apps/web/src/pages/Agenda.tsx), comentário "mutações vêm nas Stories 3.3/3.4"). A 3.3 trouxe a **criação** manual; a 3.4 traz o **cancelamento**. A **edição/remarcação (o "U") fica fora** — remarcar reabre disponibilidade, conflito e re-snapshot de preço/duração; superfície grande demais para o prazo, vira história própria.
>
> Metade já existe: colunas `status`, `cancellation_reason`, `cancelled_by` (Story 3.1); a **disponibilidade já ignora cancelados** ([availability.service.ts:300](../../apps/api/src/modules/availability/availability.service.ts#L300): `status != 'cancelled'`), então o **slot liberado reaparece sozinho**. Falta o endpoint de transição, o botão no modal e o rastro de autoria.

## Story

As a dono (ou gerente/profissional) do salão,
I want cancelar um agendamento pelo painel, com confirmação e motivo opcional,
so that a agenda reflita a realidade e o horário volte a ficar disponível — sem apagar o histórico.

## Acceptance Criteria

1. **(AC1 — Cancelar do modal)** No detalhe (read-only) de um agendamento, um botão **"Cancelar agendamento"** (destrutivo) aparece **só** quando `status ∈ {pending, confirmed}`. Já cancelado/`completed`/`no_show` não mostram o botão.

2. **(AC2 — Confirmação, ação destrutiva)** O clique **não cancela direto**: abre uma **confirmação** explícita (cancelar é irreversível pela UI). Só o "Confirmar cancelamento" dispara a chamada. "Voltar" fecha sem efeito.

3. **(AC3 — Motivo opcional)** A confirmação tem um campo **motivo (opcional)** que vai em `cancellation_reason`. Vazio → `null`.

4. **(AC4 — Rastro de autoria)** O cancelamento grava **`cancelled_by = "professional"`** (o lado do salão, que o bot usa na 6.6) **e** **`cancelled_by_user_id`** = id do usuário logado (a pessoa). Os dois têm propósitos distintos e coexistem (D1).

5. **(AC5 — Continua visível como Cancelado)** O agendamento cancelado **permanece na agenda** com status **Cancelado** (a grade já rende cancelado com risco). Não é `is_deleted`.

6. **(AC6 — Slot volta aos disponíveis)** O horário cancelado **reaparece** nos slots livres do Novo agendamento (garantido pelo backend, que já exclui cancelados da disponibilidade). Sem mudança na availability.

7. **(AC7 — Permissão)** owner/gerente cancelam qualquer agendamento; **`basic` só cancela onde `professional_id == self`** (espelha a regra de leitura da agenda). Sem permissão → 403 com mensagem real.

## API — endpoint novo

- `PATCH /api/appointments/:id/cancel` — guards `JwtAuthGuard, ActiveUserGuard, RolesGuard` (padrão do controller).
  - **Body:** `{ reason?: string }` (DTO com `@IsOptional() @IsString() @MaxLength(500)`; whitelist).
  - **Efeito:** `status = "cancelled"`, `cancellation_reason = reason ?? null`, `cancelled_by = "professional"`, `cancelled_by_user_id = req.user.id`.
  - **Retorno:** o agendamento atualizado (mesma view do GET).
  - **Erros:**
    - já `cancelled` → **409** ("Este agendamento já está cancelado.").
    - `completed`/`no_show` → **400** ("Não é possível cancelar um atendimento já encerrado.").
    - id inexistente / fora do tenant → **404**.
    - `basic` cancelando alheio → **403** ("Você só pode cancelar seus próprios atendimentos.").
  - **Tenant-aware:** entra em `TENANT_AWARE_CONTROLLERS` (guard-rail `tenant-coverage.spec.ts`).

## Banco — migração (D1)

- Nova coluna **`cancelled_by_user_id BIGINT NULL`** em `appointments` (espelha `created_by_user_id`). Migração dedicada; entidade ganha o campo. Sem índice novo (consulta por autor não é caminho quente).

## Frontend

- **Modal de detalhe** ([Agenda.tsx](../../apps/web/src/pages/Agenda.tsx)): botão **"Cancelar agendamento"** (destrutivo) condicionado ao status (AC1). Abre **confirmação** (AC2) com `<textarea>` de **motivo opcional** (AC3) → `PATCH .../cancel` → fecha o modal → **refetch** do período → card vira Cancelado. Erro mostra a mensagem real da API (padrão 3.3.1).
- Confirmação: reusa o `Dialog` do DS num modo "confirmar destrutivo" (título, aviso, textarea, botões `Voltar` / `Confirmar cancelamento` em vermelho). Sem novo primitivo se puder reusar.

## Prioridade 2 (junto nesta branch) — esconder abas vazias

- **`AppShell`** ([AppShell.tsx:21-22](../../apps/web/src/components/AppShell.tsx#L21)): **Clientes** e **Pagamentos** aparecem no menu mas não têm tela. Desabilitar as duas com **"em breve"** (mesmo tratamento de Horários/Equipe no `ConfiguracoesTabs`): item não-navegável, cinza, `title="Em breve"`, sem rota ativa. **Pagamentos** fica assim (vira pacote de venda à parte); **Clientes** será reativado na 4.1.

## Verificação (obrigatória antes de fechar)

Cancelar um agendamento **real pela tela**:
1. Card vira **Cancelado** na agenda (**screenshot 1**).
2. Abrir **Novo agendamento** no mesmo profissional/horário e ver o **slot de volta** nos disponíveis (**screenshot 2**).

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar **edição/remarcação** (o "U") — história própria.
- **NÃO** notificar o cliente (isso é **6.7**).
- **NÃO** tratar grupo multi-serviço — **`group_id` não existe** ainda (DL-040); cada agendamento já é independente.
- **NÃO** apagar (`is_deleted`) — cancelar mantém o registro visível.
- **NÃO** mexer na availability (já exclui cancelados).

## Tasks / Subtasks

- [ ] Migração `AddCancelledByUserIdToAppointments` (BIGINT NULL) + campo na entidade.
- [ ] DTO `CancelAppointmentDto` (`reason?` opcional, maxLength 500).
- [ ] `AppointmentsService.cancel(id, { reason }, actor)` — transição + autoria + regras de status/permissão.
- [ ] `AppointmentsController` `@Patch(":id/cancel")`.
- [ ] Registrar em `TENANT_AWARE_CONTROLLERS`.
- [ ] e2e: cancela (status/campos/autoria); slot volta na availability; 403 basic em alheio; 400 completed; 409 já cancelado; 404 fora do tenant.
- [ ] Front: botão condicionado ao status; confirmação; motivo opcional; refetch; mensagem de erro real.
- [ ] Web tests (Vitest): botão só nos status certos; confirmação exigida; envia `reason`; refetch após sucesso.
- [ ] P2: `AppShell` desabilita Clientes/Pagamentos ("em breve") + teste.

## Decisões — aprovadas por Renato (2026-07-21) ✅

| # | Decisão | Resolução |
|---|---|---|
| **D1** | Rastro de autoria do cancelamento | ✅ **Adicionar `cancelled_by_user_id` (nullable)**. Propósitos distintos: `cancelled_by` = lado (salão vs cliente, usado pelo bot na 6.6); `cancelled_by_user_id` = a pessoa. |
| **D2** | Edição/remarcação junto | ✅ **Fora** — história própria (risco de prazo; reabre disponibilidade/conflito). |
| **D3** | Permissão de cancelar | ✅ owner/gerente qualquer um; `basic` só os próprios (espelha a leitura). |
| **D4** | `cancelled_by` no painel | ✅ `"professional"` (lado do salão; o enum não tem "owner"). |
| **D5** | Escopo sábado | ✅ **3.4 + P2** firme; **4.1** só após 3.4 verificada e mergeada. |

## References

- [Source: appointment.entity.ts] — `status`, `cancellation_reason`, `cancelled_by`, `created_by_user_id` (Story 3.1, DL-038 D5).
- [Source: availability.service.ts#L300] — disponibilidade já exclui `cancelled` (slot volta sozinho).
- [Source: .decision-log.md#DL-040] — multi-serviço/`group_id` é futuro (Épico 6); por isso "cancelar só aquele" é automático.
- Story 3.3 (`appointment-create.e2e-spec.ts`) — padrão do controller/atomic; 3.3.1 — mensagem de erro real no front.

## Dev Agent Record

*(a preencher na implementação)*
