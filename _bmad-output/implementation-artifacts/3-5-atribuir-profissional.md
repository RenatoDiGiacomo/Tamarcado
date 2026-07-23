# Story 3.5: Atribuir/trocar profissional de um agendamento

Status: **aprovada — comportamento definido pelo Renato (2026-07-23)** · pré-requisito da 6.4 (DL-043)

> **O "U" mínimo do agendamento (DL-043).** Muta **só** `professional_id` de um agendamento existente — sem reabrir disponibilidade, conflito duro, ou re-snapshot (isso é a 3.6). Além de valor próprio (atribuir/trocar responsável), é **pré-requisito do Épico 6**: o bot cria com `professional_id` nulo (FR-A4/DL-013) e é aqui que o salão atribui pelo painel (dependência da 6.4).

## Story

As a dono/funcionário/profissional,
I want atribuir ou trocar o profissional de um agendamento existente,
so that agendamentos sem responsável (inclusive os do bot) ganhem profissional, sem remarcar horário.

## Acceptance Criteria

1. **(AC1 — Ação no detalhe)** No **modal de detalhe** (onde já está o Cancelar), o campo **Profissional** vira **editável** (`select`) quando o status é *pending*/*confirmed*. Em *completed/cancelled/no_show* o campo é **read-only** (histórico não muda).

2. **(AC2 — Permissões, D5)** owner/gerente atribuem/trocam **qualquer** agendamento. `basic` só pode **atribuir a si mesmo** quando `professional_id` está **nulo** (caso comum do bot); **não** pode tirar de outra pessoa nem trocar um já atribuído → **403**.

3. **(AC3 — Conflito avisa, não bloqueia, D3/D1)** Se o **novo** profissional já tem atendimento sobreposto no horário, o painel **avisa** ("{prof} já tem atendimento neste horário — atribuir mesmo assim?") e **deixa seguir** ao confirmar. Nunca bloqueia (mesma regra do encaixe, 3.3.1/D1).

4. **(AC4 — Sugerir sem restringir, 3.3.1)** O `select` lista **todos** os atendentes, **destacando** quem executa aquele serviço (o vínculo `professional_services` **sugere**, não restringe). Dá para atribuir alguém sem o vínculo.

5. **(AC5 — Auditoria, D2)** A troca grava **quem alterou e quando** (`assigned_by_user_id` + `assigned_at`, padrão do `cancelled_by_user_id`).

6. **(AC6 — Escopo)** **Não** mexe em horário, serviço, duração ou preço (é a 3.6). Só `professional_id` (+ auditoria).

## API

- **`PATCH /api/appointments/:id/professional`** — body `{ professionalId: string | null }`.
  - Guards do controller (`JwtAuthGuard, ActiveUserGuard, RolesGuard`). Tenant-aware (já registrado).
  - **Estado:** só *pending*/*confirmed* → senão **400** ("Não é possível trocar o profissional de um atendimento encerrado/cancelado.").
  - **Permissão (D5):** owner/gerente qualquer; `basic` só se (`professional_id` atual é **nulo**) **e** (`professionalId` == self) → senão **403**.
  - **Validação:** `professionalId` (quando não-nulo) precisa ser atendente ativo do tenant (reusa `assertProfessional` da 3.3, que **não** exige vínculo — 3.3.1) → senão **400**.
  - **Efeito:** `professional_id = professionalId`; `assigned_by_user_id = req.user.id`; `assigned_at = now`.
  - **Resposta:** o agendamento atualizado (view) **+ `overbooked: boolean`** (há sobreposição para o novo profissional? — informativo, não bloqueia).
  - **404** id inexistente/fora do tenant.
- **View de agendamento** ganha **`serviceId`** (aditivo) — o modal precisa dele para buscar `GET /services/:id/professionals` e destacar quem executa (AC4).

## Banco — migração (D2)

- Novas colunas em `appointments` (aditivas, espelham `created_by`/`cancelled_by`):
  - **`assigned_by_user_id`** BIGINT NULL, FK → `users`.
  - **`assigned_at`** DATETIME NULL.
- Sem índice novo (auditoria não é caminho quente).

## Frontend

- **Modal de detalhe** ([Agenda.tsx](../../apps/web/src/pages/Agenda.tsx)): o campo **Profissional** vira `select` editável quando *pending/confirmed* **e** o usuário tem permissão (AC2); senão texto read-only (como hoje).
  - Ao abrir o `select`, busca `GET /services/:serviceId/professionals` e **destaca** os vinculados (ex.: "★" ou grupo "Executa este serviço" vs "Outros").
  - Ao escolher um profissional, checa conflito **antes de aplicar** reusando a disponibilidade (padrão 3.3): busca `GET /availability?professionalId&serviceId&date` e, se o horário do agendamento **não** é slot livre dentro da janela dele, mostra o **aviso inline** (AC3). "Atribuir" aplica de qualquer forma.
  - Confirmar → `PATCH .../professional` → **refetch** da agenda → card reflete o novo profissional (some "Não atribuído"). Toast de sucesso; erro com a mensagem real (3.3.1). `basic` sem permissão nem vê o `select` editável.

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** trocar horário/serviço/duração/preço (é a **3.6**).
- **NÃO** exigir o vínculo `professional_services` para atribuir (ele **sugere**, não restringe — 3.3.1).
- **NÃO** bloquear por conflito (avisa e segue — D1).
- **NÃO** tratar grupo multi-serviço (`group_id` não existe — DL-040).

## Tasks / Subtasks

- [ ] Migração `AddAssignmentAuditToAppointments` (`assigned_by_user_id` FK, `assigned_at`) + campos na entidade.
- [ ] `AppointmentsService.assignProfessional(id, professionalId, actor)` — estado/permissão (D5)/validação; grava + auditoria; retorna view + `overbooked`.
- [ ] `AppointmentsController` `@Patch(":id/professional")`.
- [ ] Expor `serviceId` na view (`toAppointmentView` + `RawAppointmentRow`/query).
- [ ] e2e: atribui (nulo→prof) + auditoria; troca (owner); `basic` self em nulo OK; `basic` em já-atribuído/de-outro → 403; *completed* → 400; profissional inválido → 400; `overbooked=true` quando sobrepõe (não bloqueia); 404 fora do tenant.
- [ ] Front: `select` editável no detalhe (só pending/confirmed + permissão); destaque dos vinculados; aviso de conflito pré-aplicar; PATCH + refetch + toast; erro real.
- [ ] Web tests: campo read-only em concluído; `select` só p/ quem pode; envia `professionalId`; aviso de conflito; refetch.

## Verificação (obrigatória antes de fechar)

Pela tela: atribuir um profissional a um agendamento **não atribuído** (caso do bot) e **trocar** o profissional de outro. **Screenshot dos dois** (atribuição + troca; e o aviso de conflito se aplicável).

## Decisões

| # | Decisão | Resolução |
|---|---|---|
| **D1** | Endpoint | ✅ `PATCH /api/appointments/:id/professional` `{ professionalId }`. |
| **D2** | Auditoria | ✅ Colunas novas `assigned_by_user_id` + `assigned_at` (padrão `cancelled_by_user_id`), migração aditiva. |
| **D3** | Conflito | ✅ **Avisa e segue** (D1); backend retorna `overbooked`; front avisa antes de aplicar (reusa disponibilidade). |
| **D4** | Destacar quem executa | ✅ Expor `serviceId` na view; modal usa `GET /services/:id/professionals` (vínculo sugere, não restringe — 3.3.1). |
| **D5** | Permissões | ✅ owner/gerente qualquer; `basic` só **a si**, e só quando o campo está **nulo** (não tira de ninguém). |

## References

- [Source: epics.md#Story 3.5] e [.decision-log.md#DL-043] — fatiamento e pré-requisito da 6.4.
- [Source: FR-A4/DL-013] — bot cria sem profissional; atribuição pelo painel.
- Story 3.4 (`appointments.service.ts` cancel + `cancelled_by_user_id`) — padrão de auditoria e do endpoint `PATCH :id/ação`; 3.3.1 — vínculo sugere/não restringe; 3.3 (`assertProfessional`, availability/overbook).

## Dev Agent Record

*(a preencher na implementação)*
