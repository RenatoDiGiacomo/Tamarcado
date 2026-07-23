# Story 4.2: Perfil da cliente — histórico e observações

Status: **aprovada — em implementação** (Renato aprovou o escopo em 2026-07-23; fecha o Épico 4. Sem pressa de sábado — apresentação por prints; prioridade é bem-feito.)

> **Fecha o Épico 4.** A 4.1 entregou lista/busca/cadastro/edição; a 4.2 abre o **perfil** de cada cliente: dados + **observações** editáveis (`notes` já existe desde a 3.1) + **histórico** de agendamentos, com atalho para agendar já com a cliente pré-selecionada. Reaproveita o `AppointmentsModule` (a agenda já tem a view de agendamentos com serviço/profissional/status).

## Story

As a dono/funcionário/profissional,
I want abrir o perfil de uma cliente com observações e histórico de agendamentos,
so that eu tenha o contexto dela num lugar só e agende de novo em um clique.

## Decisões (na spec, como pedido)

| # | Decisão | Resolução |
|---|---|---|
| **D1** | Perfil = rota própria ou expansão do modal da 4.1? | ✅ **Rota própria `/clientes/:id`** (recomendação do Renato — conteúdo demais para modal e o print fica melhor). O clique na linha da lista (4.1) passa a **navegar para o perfil**; a edição de nome/telefone **migra para o perfil**. |
| **D2** | Endpoint de histórico | ✅ **`GET /clients/:id/appointments`** (aninhado, como sugerido), reusando `AppointmentsService`/`viewQuery`. Ordem **mais recente primeiro** (DESC). |
| **D3** | `GET /clients/:id` | ✅ **Enriquecido** com `notes` e `createdAt` (aditivo — não quebra a 4.1). |
| **D4** | Observações | ✅ `PATCH /clients/:id` ganha `notes?`; no perfil, textarea + botão **"Salvar observação"** (save explícito, não auto-save — evita gravar sem querer e fica claro no print). |
| **D5** | "Novo agendamento para esta cliente" | ✅ `NovoAgendamento` ganha prop opcional **`initialClient`**; o perfil renderiza uma instância com a cliente pré-selecionada; ao criar, **recarrega o histórico** (o novo aparece) — sem navegar para fora. |
| **D6** | Visibilidade do histórico por papel | ✅ Aplica o mesmo `roleScope` da agenda (FR-D2): `basic` vê só os próprios + não atribuídos; owner/gerente veem tudo. |

## Acceptance Criteria

1. **(AC1 — Perfil, FR-E2, UX-DR11)** `/clientes/:id` mostra **nome, WhatsApp** (ou "sem WhatsApp") e **"Cliente desde &lt;data de cadastro&gt;"**. Cliente inexistente/de outro tenant/deletada → estado de erro/404 (não vaza).

2. **(AC2 — Observações, FR-E3)** Bloco **Observações** com a `notes` atual (ou vazio), **editável**: textarea + **"Salvar observação"** → `PATCH /clients/:id { notes }` → feedback (toast). Erro mostra a mensagem real (padrão 3.3.1).

3. **(AC3 — Histórico, FR-E2, UX-DR11)** Lista o **histórico completo** de agendamentos da cliente (`GET /clients/:id/appointments`): **serviço, data, status (StatusChip), profissional** ("Não atribuído" em itálico quando nulo), mais recente primeiro. **`EmptyState`** quando não houver nenhum.

4. **(AC4 — Editar dados)** No perfil, **Editar** (nome/WhatsApp) reusa o formulário da 4.1 (modal) → `PATCH /clients/:id` → recarrega o perfil.

5. **(AC5 — Atalho de agendamento, FR-E2)** **"Novo agendamento para esta cliente"** abre o fluxo da 3.3 (`NovoAgendamento`) com a **cliente já selecionada** (sem buscar de novo). Ao criar, o **histórico recarrega** e o novo agendamento aparece.

6. **(AC6 — Navegação)** Na lista de Clientes (4.1), **clicar numa linha abre o perfil** (`/clientes/:id`); há **voltar** para a lista.

## API

- **`GET /clients/:id`** — enriquecido: `{ id, name, phone_whatsapp, notes, createdAt }` (deletada/fora do tenant → 404, como na 4.1).
- **`GET /clients/:id/appointments`** — `{ appointments: AppointmentView[] }` da cliente, tenant-scoped, ordenado por `scheduled_at` **DESC**, com `roleScope` (D6). Cliente inválida/deletada → **404**; sem agendamentos → `{ appointments: [] }`.
- **`PATCH /clients/:id`** — aceita **`notes?`** (≤ p.ex. 2000 chars) além de `name?`/`phone?` (4.1). `notes` vazio → `null`.
- Guards atuais (qualquer autenticado do tenant). Tenant-aware (já registrado).
- **Reuso:** `AppointmentsRepository.findByClient` (novo, sobre o `viewQuery` existente) + `toAppointmentView`; `ClientsModule` importa `AppointmentsModule` (que já exporta `AppointmentsService`). **Sem migração** (`notes` já existe — 3.1).

## Frontend

- **Rota `/clientes/:id`** (`App.tsx`) → página **`ClientePerfil`**.
  - Carrega em paralelo `GET /clients/:id` e `GET /clients/:id/appointments`.
  - **Cabeçalho:** nome, WhatsApp, "Cliente desde &lt;data&gt;", botão **Editar** (modal nome/telefone — reusa a 4.1) e **voltar** para `/clientes`.
  - **Observações:** textarea + **Salvar observação** (`PATCH { notes }`, toast).
  - **Histórico:** lista (serviço · data · `StatusChip` · profissional) + `EmptyState` ("Nenhum agendamento ainda").
  - **Novo agendamento para esta cliente:** renderiza `NovoAgendamento` com `initialClient`; `onCreated` → recarrega o histórico.
- **`NovoAgendamento`:** prop opcional `initialClient?: { id, name, phone_whatsapp }` — no reset de abertura, pré-seleciona a cliente (em vez de zerar).
- **`Clientes` (4.1):** clique na linha → `navigate(/clientes/:id)` (em vez do modal de edição, que migra para o perfil).

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar exclusão de cliente (segue fora; soft delete respeitado).
- **NÃO** editar/cancelar agendamentos a partir do histórico (o histórico é **leitura**; cancelar é na agenda, Story 3.4).
- **NÃO** adicionar campos novos à `clients` (e-mail etc.) — fora do escopo; `notes` já existe.
- **NÃO** paginar o histórico no MVP (lista simples, DESC; paginar depois se precisar).

## Tasks / Subtasks

- [ ] `AppointmentsRepository.findByClient(clientId, scope?)` (reusa `viewQuery`, DESC) + `AppointmentsService.listByClient`.
- [ ] `ClientsModule` importa `AppointmentsModule`; `ClientsController` `GET /:id/appointments` (valida cliente via `getById` → 404).
- [ ] `ClientsService.getById` enriquecido (`notes`, `createdAt`); `UpdateClientDto` + `update` aceitam `notes`.
- [ ] e2e: `GET /:id/appointments` (serviço/profissional/status, DESC; 404 cliente inválida/deletada; vazio → []); `PATCH { notes }`; `GET /:id` traz `notes`/`createdAt`; `roleScope` (basic).
- [ ] Front: página `ClientePerfil` (perfil + observações + histórico + `EmptyState` + atalho); `NovoAgendamento` `initialClient`; `Clientes` navega para o perfil.
- [ ] Web tests: perfil renderiza dados + histórico; `EmptyState`; salvar observação (PATCH notes); atalho pré-seleciona; linha da lista navega.

## Verificação (obrigatória antes de fechar)

Pela tela: abrir o **perfil de uma cliente com histórico populado** e **salvar uma observação**. **Screenshot dos dois** (perfil+histórico; observação salva).

## References

- [Source: epics.md#Épico 4 / Story 4.2] — perfil, observações e histórico (FR-E2/E3, UX-DR11); atalho para o agendamento manual (Épico 3, 3.3).
- [Source: client.entity.ts] — `notes` já existe desde a 3.1; `created_at` para "cliente desde".
- [Source: appointments.repository.ts (viewQuery) / appointments.mapper.ts (toAppointmentView, roleScope)] — reuso da view de agendamentos.
- Story 4.1 (`4-1-clientes.md`) — lista/edição reaproveitadas; 3.3 (`NovoAgendamento`) — fluxo do atalho.

## Dev Agent Record

*(a preencher na implementação)*
