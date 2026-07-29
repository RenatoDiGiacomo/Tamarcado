# Story 5B.3: Pendentes — confirmar / recusar + contador

Status: **FECHADA (DL-049)** · escopo = **confirmar/recusar + contador**, nada mais · **não implementar até o go**

> **Escopo estrito (DL-049):** a tela Pendentes lista os agendamentos `pending` (criados pelo link, 5B.2) e permite **Confirmar** e **Recusar**; mais o **contador** de pendentes no painel. **Não** há "realocação" de máquina do bot, nem polling/badge como story separada, nem qualquer escopo do Épico 6 aqui.

---

## Máquina de status — a transição `pending → confirmed` MANUAL (DL-046)

Princípio (DL-046): toda transição do ciclo tem gatilho **manual** desde já; o bot (Épico 6) é gatilho **adicional**, nunca dono.

```
pendente → confirmado → concluído
               ↓
           não compareceu / cancelado
```

| Transição | Manual existe? |
|---|---|
| `confirmado → concluído` / `→ não compareceu` | ✅ Story 3.7 |
| `confirmado`/`pendente → cancelado` | ✅ Story 3.4 (recusar reusa isto) |
| **`pendente → confirmado`** | ❌ **FALTA — nasce nesta 5B.3** |

O status `pending` já existe (3.1) e o `StatusChip` já o mapeia (3.2) — **sem migração**.

---

## Ações

### Confirmar (`pending → confirmed`)
- Endpoint **`PATCH /appointments/:id/confirm { professionalId? }`** (padrão `PATCH :id/ação`): valida origem `pending` (senão **409**); **profissional OPCIONAL** (PR-1 — reusa `assertProfessional` + auditoria `assigned_by` da 3.5 quando informado); seta `confirmed`; grava delta em `appointment_changes` (`field="status"` → Confirmado). Permissão **owner/gerente** (PR-3).
- **Leva ao badge "confirmado" JÁ EXISTENTE (3.7)** — **não** criar badge novo.
- **Dois gatilhos manuais** (DL-046): botão **Confirmar** na **tela Pendentes** (despacho em lote) **e** no **modal de detalhe** de um `pending` — o **caso presencial** (o dono encontra a cliente e confirma na hora, sem link nem bot). Mesma transição.

### Recusar (`pending → cancelled`)
- Endpoint **`PATCH /appointments/:id/reject { reason }`** com `reason` **obrigatório** (`@IsNotEmpty` — PR-2). Reusa o padrão de motivo do cancelamento (3.4); grava `cancellation_reason` + delta em `appointment_changes`. Permissão **owner/gerente**.
- *(Se a cliente não confirmar por telefone, o estabelecimento também pode simplesmente **Cancelar** pela 3.4, que já aceita `pending → cancelled` — DL-049.)*

### UX (UX-DR9)
- **Tela Pendentes:** lista `status = pending` ordenada por chegada; **Confirmar** inline (toast); **Recusar** abre modal com justificativa **obrigatória** (botão desabilitado até preencher).
- **Modal de detalhe (`pending`):** grupo de ação **Confirmar** (primário) + **Recusar** — análogo ao "Desfecho" da 3.7, na entrada do ciclo.
- Texto **neutro** (DL-048): "O estabelecimento vai confirmar", nunca "salão".

## Contador de pendentes (dentro desta story — DL-049)

- **`GET /appointments/pending-count`** → `{ count }` (pendentes do tenant, tenant-scoped, leve).
- **Front:** um **context/provider** com **refresh curto** mantém o contador como **estado compartilhado**, alimentando o **badge** de Pendentes na navegação (UX-DR7). Atualiza em segundo plano sem recarregar a página, sem fechar modais nem apagar texto em edição.
- **Não** é story separada; **não** há "polling/badge" como escopo à parte — é só o provider do contador. (WebSocket/SSE = futuro, DL-019.)

## Reuso e impacto (nada quebra)

- `pending` (3.1) e `StatusChip` (3.2) — já existem, sem migração.
- **3.5 (assign)** = núcleo do "confirmar"; **3.4 (cancel)** = base do "recusar".
- **`appointment_changes` (3.6/3.7)** = auditoria unificada de confirmar/recusar (`field="status"`).
- `confirm`/`reject`/`pending-count` são endpoints **autenticados normais** (`TENANT_AWARE_CONTROLLERS`) — sem novidade de isolamento (o público é só a criação, 5B.2).

## Funciona COMPLETO sem o Épico 6 (nada órfão)

- **Cliente:** viu "Recebido! O estabelecimento vai confirmar." (5B.2) e acabou — **não** espera notificação automática.
- **Estabelecimento:** vê o pendente (agenda + tela Pendentes), **confirma** ou **recusa com motivo**, in-panel.
- **Motivo da recusa** é gravado agora e fica **pronto** para o bot notificar a cliente depois (Épico 6) — forward-compatible, **não** dependência.
- **Gap consciente:** sem o bot, a cliente não recebe aviso automático; ela sabe pela tela, e o estabelecimento contata pelo telefone. Limitação consciente, não fluxo órfão.

## Tasks / Subtasks

- [ ] `PATCH :id/confirm { professionalId? }` + `PATCH :id/reject { reason }` (DTOs; origem `pending` senão 409; auditoria `appointment_changes`; permissão owner/gerente).
- [ ] `GET /appointments/pending-count`.
- [ ] Tela **Pendentes** (lista + Confirmar inline + Recusar com justificativa).
- [ ] **Confirmar/Recusar no modal de detalhe** de um `pending` (caso presencial — DL-046).
- [ ] **Provider do contador** (context, refresh curto) + badge na navegação.
- [ ] e2e: `pending→confirmed` com/sem profissional; `pending→cancelled` com reason; reason vazio → 400; origem não-`pending` → 409; permissão; `pending-count` correto.
- [ ] Web tests: tela Pendentes; confirmar leva ao badge da 3.7; contador atualiza sem fechar modal.

## Decisões

| # | Decisão | Status |
|---|---|---|
| **PR-1** | Profissional obrigatório na confirmação? | ✅ **Não obrigatório** — confirmar e atribuir são independentes (3.5). |
| **PR-2** | Recusar: endpoint dedicado `:id/reject` (reason obrigatório) | ✅ Dedicado, reason **obrigatório**, reusa o motivo do cancelamento (3.4). |
| **PR-3** | Quem confirma/recusa | ✅ **owner/gerente**; basic não despacha pendente de outros. |
| **PR-4** | Contador | ✅ Context/provider com **refresh curto**, **dentro da 5B.3**; sem story separada. |

## References

- [epics.md#Story 5B.3] · [DL-049] (escopo fechado) · [DL-046] (transição manual) · [DL-047/DL-048] (lembrete separado / vocabulário neutro) · Stories 3.4 (cancel), 3.5 (assign), 3.6/3.7 (`appointment_changes`), 3.2 (StatusChip/pending).