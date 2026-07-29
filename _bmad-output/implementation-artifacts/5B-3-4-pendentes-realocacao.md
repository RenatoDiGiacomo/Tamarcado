# Stories 5B.3 / 5B.4 (spec para revisão): Realocação de Pendentes — a fundação sai do bot

Status: **FECHADA (DL-049)** · escopo do Épico 5B = **3 stories**; o **contador de pendentes vive DENTRO da 5B.3** (o antigo "5B.4" foi absorvido) · **não implementar até o go**

> **Tese (P2, já aprovada):** a máquina de **pendentes** deixa de ser exclusiva do bot e vira a **fundação do link**. O agendamento de fora (link) entra `pending`; o estabelecimento **confirma/recusa no painel**. O bot (Épico 6) depois **reusa** essa máquina — só pluga o canal WhatsApp e as notificações à cliente. Constrói-se **uma vez**.

---

## Máquina de status — o bot é GATILHO, não dono (DL-046)

**Princípio:** nada no ciclo depende 100% do bot; o bot **automatiza gatilhos que já existem manuais**. Máquina única:

```
pendente → confirmado → concluído
               ↓
           não compareceu / cancelado
```

Cada transição é disparável por **(a) mão da recepção** (existe desde o link, nunca sai) e **(b) bot** (Épico 6 — gatilho adicional sobre a MESMA transição, nunca exclusivo).

| Transição | Manual existe? |
|---|---|
| `confirmado → concluído` / `→ não compareceu` | ✅ Story 3.7 |
| `confirmado`/`pendente → cancelado` | ✅ Story 3.4 |
| **`pendente → confirmado`** | ❌ **FALTA — nasce nesta 5B.3** (botão Confirmar na tela Pendentes **e** no modal de detalhe) |

**Lembrete = eixo SEPARADO (DL-047):** o lembrete automático (bot, 6.10) é ortogonal à máquina — o bot manda **independente** de a cliente ter confirmado; **não trava** nenhuma transição.

> **Vocabulário neutro (DL-048):** o produto serve **qualquer prestador com agenda** (personal, serviços domésticos, etc), não só salão. O fluxo é universal; o vocabulário é preenchimento do usuário. A **página pública e os textos nascem NEUTROS** (ex.: "O estabelecimento vai confirmar", não "o salão"). O seed "Salão Teste" é só teste.

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

### Ações — a transição `pending→confirmed` MANUAL (DL-046)
- **Confirmar** (`pending → confirmed`) = a transição manual que **nasce aqui**. Endpoint dedicado `PATCH /appointments/:id/confirm { professionalId? }` (padrão `PATCH :id/ação`): valida origem `pending` (senão 409); **opcionalmente** atribui o profissional (PR-1 ✅ **não obrigatório** — reusa `assertProfessional` + auditoria `assigned_by` da 3.5); seta `confirmed`; grava delta em `appointment_changes` (`field="status"`, → Confirmado). Permissão owner/gerente (PR-3 ✅).
  - **Aparece em DOIS lugares (DL-046):** (1) botão **Confirmar** na **tela Pendentes** (despacho em lote); (2) botão **Confirmar** no **modal de detalhe** de um agendamento `pending` — o **caso presencial**: o dono encontra a cliente e confirma na hora, **sem link nem bot**. É a mesma transição, dois gatilhos manuais.
- **Recusar** (`pending → cancelled`) = endpoint dedicado `PATCH /appointments/:id/reject { reason }` com `reason` **obrigatório** (`@IsNotEmpty`, PR-2 ✅ / FR-B4). Reusa o padrão de motivo do cancelamento (3.4); o motivo fica gravado (`cancellation_reason`) — é o que o bot usa depois para notificar a cliente (FR-B5).

### UX (UX-DR9)
- **Modal de detalhe (status `pending`):** grupo de ação com **Confirmar** (primário) + **Recusar** — análogo ao "Desfecho" da 3.7, mas para a entrada do ciclo. (Um `pending` também pode ser Editado/Cancelado como hoje.)
- **Tela Pendentes:** confirmação **inline** (sem modal) com toast; recusa abre modal com justificativa **obrigatória** (botão desabilitado até preencher).
- Permissão: **owner/gerente** confirmam/recusam (PR-3 ✅); um `basic` não despacha pendente de outros (atribuir-se continua sendo 3.5/3.6).

### Não notifica a cliente (texto neutro — DL-048)
- No MVP do link, confirmar/recusar **não** manda mensagem à cliente (Épico 6). A cliente viu a tela **"Recebido! O estabelecimento vai confirmar."** (5B.2, **texto neutro**, não "salão"); o estabelecimento contata manual se quiser. A notificação pluga quando o bot entrar (FR-B3/B5).

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

## O link funciona COMPLETO sem o Épico 6 (nada órfão)

**Confirmado: 5B.2/5B.3/5B.4 são um fluxo fechado, sem depender do bot.**

- **Cliente (5B.2):** agenda → vê a tela de sucesso **"Recebido! O estabelecimento vai confirmar."** (texto neutro — DL-048) e **acabou**. Ela **não** espera nenhuma notificação automática — a mensagem já diz que a confirmação virá do estabelecimento. Sem promessa quebrada.
- **Estabelecimento (5B.3):** vê o pendente na agenda + na tela Pendentes; **confirma** (atribui + confirmado) ou **recusa** (cancelado + motivo). Tudo **in-panel**, sem WhatsApp.
- **Badge (5B.4):** polling in-panel — a recepção percebe novos pendentes sem F5.
- **Motivo da recusa** é **gravado agora** (`cancellation_reason`) e fica **pronto** para o bot notificar a cliente depois (Épico 6) — é **forward-compatible**, não uma dependência. Se o bot nunca existisse, o motivo simplesmente fica no registro (auditoria).

**O que o Épico 6 ADICIONA por cima (sem alterar o fluxo do painel):** a mensagem à cliente na confirmação/recusa (FR-B3/B5) e o timeout de 2h (FR-B6). São **camadas aditivas** — o painel já funciona sem elas.

> **Gap consciente (registrado, não órfão):** sem o bot, a cliente **não recebe** aviso automático de confirmado/recusado. Ela sabe disso pela tela de sucesso; o salão tem o telefone e contata manual se quiser. É uma **limitação consciente** do link-sem-bot, não meio fluxo pendurado.

## Decisões (Pendentes)

| # | Decisão | Status |
|---|---|---|
| **PR-1** | Profissional obrigatório na confirmação? | ✅ **Aprovado (Renato):** **não obrigatório** — confirmar e atribuir são independentes (atribuição é 3.5). |
| **PR-2** | Recusar: endpoint dedicado `:id/reject` (reason obrigatório) | ✅ **Aprovado (Renato):** dedicado, reason **obrigatório**, reusa o padrão de motivo do cancelamento (3.4). O motivo é o que o bot usa depois (FR-B5). |
| **PR-3** | Quem confirma/recusa | ✅ **Aprovado (Renato):** **owner/gerente** despacham; basic não trata pendente de outros. |
| **PR-4** | Intervalo do polling | ✅ **Aprovado (Renato):** **15–30s** (NFR-A3); WebSocket/SSE = futuro (DL-019). |

## References

- [plano-epico-agendamento-publico.md §3] · [DL-013] (pending sem profissional) · [DL-014/DL-018] (aprovação manual pelo painel) · [DL-035] (pending só existe com bot → agora também com o link) · [NFR-A3/UX-DR7/UX-DR9] (polling/badge/tela) · Stories 3.4 (cancel), 3.5 (assign), 3.6/3.7 (appointment_changes).
