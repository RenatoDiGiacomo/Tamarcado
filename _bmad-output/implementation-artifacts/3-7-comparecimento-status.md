# Story 3.7: Marcar comparecimento e status (no-show / concluído)

Status: **spec para revisão do Renato** — mapa de transições para aprovar antes de implementar · fecha o **último buraco do Épico 3** (FR-D9)

> **Ações pontuais por transição válida — não um select livre de status.** Cada ação tem sua regra. As transições que já existem (cancelar 3.4, editar 3.6) continuam como estão. **Sem notificação à cliente** (isso é o Épico 6/bot — DL-023 já diz que no-show é informativo). Auditoria **unificada** na `appointment_changes` da 3.6.

---

## Mapa de transições válidas (o que você pediu para ver primeiro)

Estados: `pending` · `confirmed` · `cancelled` · `completed` · `no_show`.

| De | Ação (botão) | Para | Condição | Origem |
|---|---|---|---|---|
| `confirmed` | **Concluído** | `completed` | *(recomendado)* o atendimento **já começou** (`scheduled_at ≤ agora`) — não se conclui o que não começou | **3.7** |
| `confirmed` | **Não compareceu** | `no_show` | o horário **já passou** (`scheduled_at ≤ agora`) — não faz sentido em agendamento futuro | **3.7** |
| `confirmed` / `pending` | Cancelar | `cancelled` | — | 3.4 (existe) |
| `confirmed` / `pending` | Editar (muta campos, mantém status) | mesmo | só *pending/confirmed* | 3.6 (existe) |
| `pending` | — | — | **fora daqui**: `pending` só nasce do bot/link (Épico 6/5B); no manual tudo já entra `confirmed` | — |
| `completed` / `no_show` / `cancelled` | — | **terminal** | sem ações; permanece visível com o StatusChip | — |

**Regras que caem fora do mapa (bloqueadas):**
- `completed`/`no_show`/`cancelled` → qualquer coisa: **terminal** (nada de concluir um cancelado, "des-concluir", etc.).
- Agendamento **futuro** → `no_show` ou `completed`: **bloqueado** (condição de tempo).
- `pending` → `completed`/`no_show`: **fora de escopo** (o manual não gera pending; o tratamento de pending é do link/bot).

**Questões deste mapa para você fechar:**
- **D1 — "já passou" = início.** Uso `scheduled_at ≤ agora` (o horário de **início** chegou). *(alternativa: exigir o fim do atendimento, `scheduled_at + duração ≤ agora` — mais rígido)*. **Recomendo início.**
- **D2 — Concluído exige ter começado?** Recomendo **sim** (`scheduled_at ≤ agora`) — coerente com no-show e evita concluir futuro. *(alternativa: permitir concluir a qualquer hora)*.
- **D4 — Reversão (desmarcar no-show/concluído)** fica **fora** desta story (terminal). Se um clique errado precisar de correção, tratamos depois. **Recomendo adiar.**

---

## Acceptance Criteria

1. **(AC1 — Ações no modal)** No modal de detalhe, quando `confirmed` **e** o horário já começou/passou, aparecem **"Concluído"** e **"Não compareceu"**, ao lado de Editar/Cancelar. Nada de `<select>` de status.
2. **(AC2 — No-show)** "Não compareceu" só aparece/aceita em `confirmed` com `scheduled_at ≤ agora` → `no_show`. Em agendamento **futuro** a ação **não aparece**; se chamada mesmo assim → **400**.
3. **(AC3 — Concluído)** "Concluído" em `confirmed` (+ começou) → `completed`. *(No futuro dispara o registro de pagamento — Épico 5; por ora **só** muda o status.)*
4. **(AC4 — Auditoria unificada)** A transição grava em **`appointment_changes`**: `field="status"`, `from`→`to` (rótulos legíveis), `changed_by_user_id` + `changed_at`. Mesma tabela da 3.6.
5. **(AC5 — Terminal)** `completed`/`no_show` permanecem **visíveis** com o StatusChip e ficam **read-only** (editar/cancelar já os excluem — 3.4/3.6). Sem "desfazer" nesta story.
6. **(AC6 — Sem notificação)** Nenhuma mensagem à cliente (Épico 6/DL-023).

## Permissão (D3, a confirmar)

- **owner/gerente:** qualquer agendamento.
- **basic:** só o **próprio** (`professional_id == self`) — igual ao cancelamento (3.4/AC7). **Recomendo** manter essa simetria. *(Um agendamento sem profissional não deveria receber no-show/concluído por um basic — ele não é o responsável.)*

## API

- **`PATCH /api/appointments/:id/status`** — body `{ to: "completed" | "no_show" }`.
  - Guards do controller (`JwtAuthGuard, ActiveUserGuard, RolesGuard`). Tenant-aware.
  - **Mapa de transição** validado no service: origem tem que ser `confirmed`; condição de tempo por alvo (D1/D2). Origem inválida (já terminal) → **409**; alvo com condição não satisfeita (futuro) → **400**.
  - **Permissão (D3):** basic só o próprio → senão **403**.
  - **Efeito:** `status = to`; grava linha em `appointment_changes` (`field="status"`, `from`=status antigo, `to`=novo).
  - **Resposta:** o agendamento atualizado (view). **404** fora do tenant.

> **Endpoint único `/status` com mapa** (não dois `/complete` + `/no-show`): centraliza o mapa de transições num só lugar (o que você quer ver e manter), é extensível (novas transições entram na tabela) e casa com o padrão `PATCH :id/ação` (3.4/3.5). A UI é que tem **duas ações pontuais**, cada uma chamando com o `to` certo.

## Banco

- **Nenhuma migração.** Reusa `status` (enum já tem `completed`/`no_show`) e a tabela `appointment_changes` (3.6). Auditoria unificada, como você pediu.

## Frontend

- **Modal de detalhe** ([Agenda.tsx](../../apps/web/src/pages/Agenda.tsx)): na linha de ações, além de Editar/Cancelar, renderiza:
  - **"Concluído"** (ação positiva) — visível se `confirmed` e começou.
  - **"Não compareceu"** (ação de atenção) — visível se `confirmed` e passou.
  - "Passou/começou" é derivado de `date`+`start` vs. agora (a agenda já lida com data/horário civis).
  - Clicar → `PATCH :id/status` → **refetch** + toast; erro com a mensagem real. Card repinta com o novo StatusChip (`done`/`noshow`).
- Hierarquia visual das 4 ações (sugestão): Concluído (primária/positiva) · Não compareceu (secundária/atenção) · Editar (secundária) · Cancelar (destrutiva).

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** um select livre de status.
- **NÃO** disparar pagamento (Épico 5) nem notificação à cliente (Épico 6).
- **NÃO** tratar `pending` (é do link/bot).
- **NÃO** permitir reversão/"desfazer" (terminal nesta story).

## Tasks / Subtasks

- [ ] `AppointmentsService.changeStatus(id, to, actor)` — mapa de transição (origem `confirmed` + condição de tempo por alvo); permissão (D3); grava status + `appointment_changes` (`field="status"`).
- [ ] `AppointmentsController` `@Patch(":id/status")` + `ChangeStatusDto` (`to` ∈ {completed, no_show}).
- [ ] e2e: confirmed+passou → no_show (+ change row); confirmed+começou → completed (+ change row); **futuro → no_show/completed = 400**; já terminal (completed/cancelled) → 409; basic no próprio OK / de outro 403; 404.
- [ ] Front: ações "Concluído"/"Não compareceu" no modal (condição de tempo + permissão); PATCH + refetch + toast; erro real.
- [ ] Web tests: ações aparecem só quando válidas (passado/futuro; papel); envia o `to` certo; card repinta.

## Verificação (obrigatória antes de fechar)

Pela tela: **marcar "Não compareceu"** num agendamento **passado** (confirmado) e **"Concluído"** noutro. **Screenshot dos dois** (card/StatusChip refletindo `no_show` e `completed`).

## Decisões

| # | Decisão | Resolução |
|---|---|---|
| **D1** | "Já passou" | 🟡 **Recomendo início** (`scheduled_at ≤ agora`). Confirmar. |
| **D2** | Concluído exige ter começado | 🟡 **Recomendo sim**. Confirmar. |
| **D3** | Permissão | 🟡 **Recomendo** owner/gerente qualquer; basic só o próprio (simetria com 3.4). Confirmar. |
| **D4** | Reversão | ✅ **Fora** desta story (terminal). |
| **D5** | Endpoint | ✅ `PATCH :id/status { to }` único, mapa no service. |

## References

- [Source: prd.md#FR-D9] (marcar não compareceu) · [epics.md#Épico 3 / Buracos conhecidos] · [DL-023] (no-show informativo, sem automação) · [DL-035] (pending só existe com bot).
- Story 3.4 (`cancel`, permissão basic, padrão `PATCH :id/ação`) · Story 3.6 (`appointment_changes`, auditoria por delta) — reaproveitados.
- Épico 5 (Pagamentos) — futuro consumidor do `completed` (FR-F, transição para *concluído*).

## Dev Agent Record

*(a preencher na implementação)*
