# Stories 5B.3 / 5B.4 (spec para revisão): Realocação de Pendentes — a fundação sai do bot

Status: **PROPOSTA para revisão do Renato** · a parte a olhar com cuidado (o que move do Épico 6) · **não implementar até o go**

> **Tese (P2, já aprovada):** a máquina de **pendentes** deixa de ser exclusiva do bot e vira a **fundação do link**. O agendamento de fora (link) entra `pending`; o salão **confirma/recusa no painel**. O bot (Épico 6) depois **reusa** essa máquina — só pluga o canal WhatsApp e as notificações à cliente. Constrói-se **uma vez**.

---

## O que MOVE (Épico 6 → link) e o que FICA (bot)

| Item | Hoje (Épico 6) | Vai para |
|---|---|---|
| Status `pending` ("aguardando confirmação") | existe (3.1), **nunca usado** | **usado** pelo link (5B.2) e depois pelo bot |
| **FR-B1** — pendente aparece na agenda como *aguardando confirmação*, sem profissional | bot | **link (5B.3)** — notificação ao salão é **in-panel** (badge/toast), não WhatsApp |
| **FR-B2** — confirmar/recusar **pelo painel** (DL-018) | bot | **link (5B.3)** — a tela Pendentes |
| **FR-B4** — recusa exige justificativa | bot | **link (5B.3)** |
| **Polling/badge** (NFR-A3, UX-DR7, 6.9) | bot | **link (5B.4)** |
| **FR-B3/B5 (notificar a cliente)** confirmação/recusa via WhatsApp | bot | **fica no bot** (depende do canal) |
| **FR-B6** — timeout de 2h | bot | **fica no bot** (conceito do bot; no link o pendente espera o salão) |

**Ganho arquitetural:** quando o Épico 6 (WhatsApp) chegar, ele **não recria** nada de pendentes — só adiciona o `WhatsAppProvider`/máquina de estados e as mensagens à cliente por cima da tela e dos endpoints já prontos.

---

## Story 5B.3: Tela de Pendentes + confirmar/recusar

**Escopo:** a recepção vê os agendamentos `pending` (vindos do link) e **confirma** (vira `confirmed`, atribuindo o profissional) ou **recusa** (vira `cancelled`, com justificativa obrigatória).

### Onde o pendente aparece
- **Na agenda** (FR-B1): já renderiza — o `StatusChip` mapeia `pending` → "aguardando confirmação" (existe desde a 3.2, nunca exercitado). O card mostra "Não atribuído" (DL-013).
- **Na tela Pendentes** (UX-DR9): lista dedicada de `status = pending`, ordenada por chegada, para a recepção despachar em lote.

### Ações (reusam o que já existe)
- **Confirmar** = **atribuir profissional (Story 3.5)** + `status → confirmed`. O momento natural de atribuir é a confirmação (o link/bot criam sem profissional — DL-013). Endpoint dedicado `PATCH /appointments/:id/confirm { professionalId }` (padrão `PATCH :id/ação`), que: valida origem `pending` (senão 409); atribui o profissional (reusa `assertProfessional` + auditoria `assigned_by` da 3.5); seta `confirmed`; grava delta em `appointment_changes` (`field="status"`, → Confirmado). **(PR-1: profissional obrigatório na confirmação, ou pode confirmar deixando "não atribuído" para atribuir depois via 3.5/3.6? Recomendo permitir confirmar SEM profissional — atribuição é independente.)**
- **Recusar** = `status → cancelled` com **justificativa obrigatória** (FR-B4). Reusa a transição de cancelamento (3.4), mas com `reason` **obrigatório** (a 3.4 tem `reason` opcional). **(PR-2: endpoint dedicado `PATCH :id/reject { reason }` com `@IsNotEmpty`, ou reusar `:id/cancel` e o front exigir o motivo? Recomendo endpoint dedicado — a obrigatoriedade é regra do domínio, não da UI.)**

### UX (UX-DR9)
- Confirmação **inline** (sem modal) com toast; recusa abre modal com campo de justificativa **obrigatório** (botão desabilitado até preencher).
- Permissão: owner/gerente qualquer; **basic** — a decidir (PR-3): recepção costuma ser owner/gerente; um `basic` (profissional) confirmar pendentes de outros não faz sentido. Recomendo **owner/gerente** para confirmar/recusar (a atribuição a si mesmo continua sendo 3.5).

### Não notifica a cliente
- No MVP do link, confirmar/recusar **não** manda mensagem à cliente (Épico 6). A cliente viu a tela "recebido, o salão vai confirmar" (5B.2); o salão contata manual se quiser. A notificação pluga quando o bot entrar (FR-B3/B5).

---

## Story 5B.4: Detecção de pendentes por polling (badge)

**Escopo:** o painel detecta novos pendentes **em segundo plano**, sem reload (NFR-A3, UX-DR7, ex-6.9).

- **`GET /appointments/pending-count`** → `{ count }` (pendentes do tenant). Leve, tenant-scoped.
- **Front:** polling a cada **15–30s** em background; atualiza **só** o badge numérico de pendentes (na navegação, UX-DR7) e dispara um **toast** quando chega um novo — **nunca** recarrega a página, **não** fecha modais nem apaga texto em edição. Badge persiste até o salão tratar (não reseta por reload).
- **Item de navegação "Pendentes"** com o badge (hoje a aba existe como "em breve"? — checar; senão, adicionar).
- **Evolução futura:** WebSocket/SSE (DL-019) — polling REST é o MVP.

---

## Reuso e impacto (nada quebra)

- **`pending` (3.1):** finalmente usado — **sem migração**.
- **`StatusChip`/agenda:** já mapeiam `pending`.
- **Story 3.5 (assign):** vira o núcleo do "confirmar".
- **Story 3.4 (cancel):** base do "recusar".
- **`appointment_changes` (3.6/3.7):** auditoria unificada das transições de confirmar/recusar (`field="status"`).
- **Guard-rail/tenant:** `pending-count` e confirm/reject são endpoints autenticados normais (`TENANT_AWARE_CONTROLLERS`) — sem novidade de isolamento (o público é só a **criação**, 5B.2).

## Tasks / Subtasks (resumo)

**5B.3** — `PATCH :id/confirm` + `PATCH :id/reject` (DTOs, mapa de origem `pending`, auditoria); tela Pendentes (lista + confirmar inline + recusar com justificativa); e2e (pending→confirmed com/sem profissional; pending→cancelled com reason; reason vazio → 400; origem não-pending → 409; permissão).
**5B.4** — `GET /appointments/pending-count`; polling em background + badge + toast; e2e/web tests (conta certa; badge não some por reload; polling não fecha modal).

## Decisões a confirmar

| # | Decisão | Recomendação |
|---|---|---|
| **PR-1** | Profissional obrigatório na confirmação? | **Não** — pode confirmar sem atribuir (atribuição é 3.5, independente) |
| **PR-2** | Recusar: endpoint dedicado `:id/reject` (reason obrigatório) vs. reusar `:id/cancel` | **Dedicado** — obrigatoriedade é regra do domínio (FR-B4) |
| **PR-3** | Quem confirma/recusa | **owner/gerente** (recepção); basic não trata pendente de outros |
| **PR-4** | Intervalo do polling | **15–30s** (NFR-A3); WebSocket/SSE = futuro (DL-019) |

## References

- [plano-epico-agendamento-publico.md §3] · [DL-013] (pending sem profissional) · [DL-014/DL-018] (aprovação manual pelo painel) · [DL-035] (pending só existe com bot → agora também com o link) · [NFR-A3/UX-DR7/UX-DR9] (polling/badge/tela) · Stories 3.4 (cancel), 3.5 (assign), 3.6/3.7 (appointment_changes).
