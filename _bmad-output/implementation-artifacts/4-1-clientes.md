# Story 4.1: Clientes — cadastro, listagem e busca

Status: **aprovada — em implementação** (Renato aprovou D1–D4 em 2026-07-22; + D5 filtro `is_deleted`/LGPD e D6 cliente sem telefone. 4.1 é **bônus** — se não fechar com qualidade até sábado, para-se e a aba fica "em breve")

> **Abre o Épico 4.** A base `clients` (Story 3.1) e o cadastro inline + busca (Story 3.3) já existem; a 4.1 **completa o CRUD** (listar paginado, obter por id, editar) e entrega a **tela de gestão**. Perfil da cliente com histórico/observações é a **4.2 — fora daqui**.

## Story

As a dono/funcionário/profissional,
I want manter o cadastro de clientes com busca, listagem e edição,
so that eu encontre rápido quem atendo e mantenha os dados certos — inclusive de quem chega sem WhatsApp.

## O que já existe (reaproveita — Stories 3.1/3.3)

- **Entidade `Client`:** `id`, `company_id`, `name` (≤100), `phone_whatsapp` (nullable), `phone_whatsapp_normalized` (E.164, **UNIQUE por tenant**), `notes` (nullable — é da 4.2), `is_deleted` (soft delete). Índices `company_id+name` e `company_id+is_deleted`.
- **`ClientsRepository`** (tenant-aware) com `search(term, limit)`.
- **`ClientsService.create`** — dedup por telefone normalizado (idempotente); `normalizePhoneBR`.
- **`GET /clients?search=`** (autocomplete: vazio→`[]`, termo→limit 10, shape `{ clients }`) e **`POST /clients`**.
- **Front:** `NovoAgendamento` consome `GET /clients?search=` (só com termo ≥2) e `POST /clients`. **AppShell** já tem o item **Clientes** — hoje **"em breve"** (desabilitado).

## Acceptance Criteria

1. **(AC1 — Listar paginado, FR-E1)** `GET /clients` em **modo lista** (quando vêm `page`/`pageSize`) retorna `{ clients, total, page, pageSize }`, ordenado por **nome**, tenant-scoped, só `is_deleted=false`. Sem termo → **todos** (paginado); com termo → filtrado.

2. **(AC2 — Busca por nome/telefone, FR-E2)** O `search` casa parcial em nome, `phone_whatsapp` e `phone_whatsapp_normalized` (reusa a query da 3.3). Na tela, a busca é **debounced** e refaz a listagem (página volta a 1).

3. **(AC3 — Cadastro, FR-E1)** Pela tela, **"+ Nova cliente"** → nome (obrigatório, ≤100) + WhatsApp (opcional). Usa o **`POST /clients` atual** (dedup por telefone — não duplica). Entra na lista.

4. **(AC4 — Editar, FR-E3)** `PATCH /clients/:id` `{ name?, phone_whatsapp? }` atualiza nome/telefone (renormaliza o telefone). Pela tela, editar abre o mesmo formulário **pré-preenchido**. Erro mostra a mensagem real (padrão 3.3.1).

5. **(AC5 — Obter por id)** `GET /clients/:id` → a cliente do tenant; fora do tenant/inexistente/**deletada** → **404**.

6. **(AC6 — Telefone único na edição, D3)** Editar o telefone para um que **já é de outra cliente** (não-deletada) → **409** ("Já existe uma cliente com esse WhatsApp."). **Sem telefone não colide** (D6): a checagem só roda quando o telefone normalizado **não é null**, e ignora o próprio id. (Na criação, o dedup do `POST` já resolve — inalterado.)

7. **(AC7 — Aba reativada)** O item **Clientes** no `AppShell` **deixa de ser "em breve"** e navega para **`/clientes`**. (Pagamentos segue "em breve".)

8. **(AC8 — Soft delete respeitado, D5/LGPD)** A listagem, a busca **e** o `GET /clients/:id` filtram **`is_deleted = false`** — cliente apagado (soft delete da 3.1) **não reaparece** em lugar nenhum, mesmo sem tela de exclusão nesta story.

## API

- **`GET /clients`** — dois modos, **preservando o contrato do autocomplete (3.3)**:
  - **sem** `page`/`pageSize` → autocomplete atual (vazio→`[]`, termo→limit 10, `{ clients }`). Inalterado (o e2e "busca vazia → []" continua válido).
  - **com** `page`/`pageSize` → **modo lista**: `{ clients, total, page, pageSize }`.
- **`GET /clients/:id`** → `ClientView` (404 fora do tenant).
- **`PATCH /clients/:id`** `{ name?, phone_whatsapp? }` → `ClientView` (400 validação; 409 telefone colidindo com outra cliente; 404 fora do tenant).
- Guards atuais (`JwtAuthGuard, ActiveUserGuard, RolesGuard`) — **qualquer usuário autenticado do tenant** (sem `@Roles`, como já é). Tenant-aware (já em `TENANT_AWARE_CONTROLLERS`).
- **Sem migração** — a entidade já tem tudo.

## Frontend

- **Rota `/clientes`** (`App.tsx`, dentro do shell autenticado) → página **`Clientes`**.
- **Página `Clientes`** (`PageLayout title="Clientes"`, action **"+ Nova cliente"**):
  - **Busca** (input debounced) por nome/telefone → `GET /clients?search=&page=1&pageSize=20`.
  - **Lista** (linhas: nome + WhatsApp, ou "sem WhatsApp" em itálico). Clique na linha → **editar**.
  - **Paginação** simples (‹ ›, "página X de N" / total). `EmptyState` quando não há clientes ou a busca não acha.
  - **Formulário** de cadastro/edição em **modal** (reusa `Dialog` + `Input`/`Label`): nome + WhatsApp. Salvar → `POST`/`PATCH` → recarrega a lista + toast (UX-DR19). Erro → mensagem real (409/400).
- **`AppShell`:** remover `disabled` de **Clientes** (reativa a rota); **Pagamentos** continua "em breve".

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar **perfil da cliente / histórico de agendamentos / observações (`notes`)** — é a **4.2**.
- **NÃO** implementar **excluir** cliente (não pedido; `is_deleted` fica como está).
- **NÃO** mexer no **autocomplete** da 3.3 nem no **dedup** do `POST` (contrato preservado).
- **NÃO** adicionar papéis/permissões novos — mantém "qualquer autenticado do tenant".

## Tasks / Subtasks

- [ ] `ClientsRepository`: `list({ search, page, pageSize })` (com `total`) e `findByIdScoped`.
- [ ] `ClientsService`: `list`, `getById` (404), `update` (renormaliza; 409 em colisão de telefone com **outro** id).
- [ ] DTOs: `ListClientsQueryDto` (`search?`, `page?`, `pageSize?`), `UpdateClientDto` (`name?`, `phone_whatsapp?`).
- [ ] `ClientsController`: `GET` modo lista, `GET :id`, `PATCH :id`.
- [ ] e2e: lista paginada (`total`/`page`), busca filtra, `GET :id` (200/404), update nome/telefone, update com telefone colidindo → 409, **dois sem telefone NÃO colidem** (D6), **cliente `is_deleted=true` some da lista/busca/`GET :id`→404** (D5), busca por telefone com registro sem telefone não quebra, isolamento por tenant; **e o e2e "busca vazia → []" segue verde**.
- [ ] Front: página `Clientes` (lista + busca debounced + paginação + `EmptyState`), modal de cadastro/edição, toast, erro real.
- [ ] `App.tsx`: rota `/clientes`. `AppShell`: reativa Clientes (+ teste "Clientes vira link").
- [ ] Web tests (Vitest): lista + busca; cadastro; edição (prefill→salvar); paginação; aba reativada.

## Verificação (obrigatória antes de fechar)

Pela tela: **cadastrar** um cliente, **buscar** por ele, e **editar** (nome/telefone). **Screenshot dos três** (cadastro/lista, busca, edição).

## Decisões (recomendações — vetar se quiser; 4.1 é bônus)

| # | Decisão | Recomendação |
|---|---|---|
| **D1** | Paginação | ✅ `page`/`pageSize` (offset), `pageSize=20`; **modo lista** só quando vêm os params — preserva o autocomplete e o e2e atual. |
| **D2** | UX de cadastro/edição | ✅ **Modal** (form compartilhado create/edit), lista simples com busca+paginação. (vs edição inline). |
| **D3** | Telefone duplicado | ✅ `POST` **inalterado** (dedup retorna a existente); `PATCH` → **409** ao colidir com **outra** cliente. |
| **D4** | Escopo | ✅ Sem excluir, sem `notes`/histórico (4.2), sem papéis novos. |
| **D5** | Soft delete (Renato) | ✅ Listagem, busca e `GET :id` filtram `is_deleted=false` (LGPD) — apagado não reaparece; sem tela de exclusão nesta story. |
| **D6** | Cliente sem telefone (Renato) | ✅ Colisão 409 só quando o telefone normalizado ≠ `null` (dois sem telefone **não** colidem); busca por telefone robusta a `null` (LIKE em `null` não casa, mas o registro aparece por nome/na lista). |

## References

- [Source: epics.md#Épico 4 / Story 4.1] — cadastro e listagem com busca (FR-E1/E2/E3).
- [Source: client.entity.ts / clients.service.ts / clients.repository.ts] — base 3.1 + busca/dedup 3.3 reaproveitados.
- [Source: clients.e2e-spec.ts] — contrato do autocomplete a **preservar** ("busca vazia → []").
- Stories 3.3.2/3.3.3 — padrão de tela do painel (DS + shell); 3.4 — toast/erro real.

## Dev Agent Record

*(a preencher na implementação)*
