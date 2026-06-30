# Story 1.4: Gestão de equipe e permissões

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a dono de salão,
I want convidar usuários, definir o nível de acesso e se cada um atende clientes, e ativar/desativar acesso,
so that minha equipe use o sistema com as permissões corretas, refletindo quem é administrativo e quem tem agenda própria.

## Acceptance Criteria

1. **(AC1 — Convite + primeiro acesso)** Dado que sou o Dono, quando convido um novo usuário (nome, e-mail, `access_level`, `attends_clients`), então um convite com token é gerado e retornado como **link**; o usuário convidado, ao abrir o link, **cria a própria senha** no primeiro acesso e passa a poder logar. O convite expira e é de uso único. (FR-G4, UX-DR14)

2. **(AC2 — Dois eixos independentes)** Dado o modelo de dois eixos (FR-I1, DL-022), quando o Dono define ou altera o **`access_level`** (`owner`/`manager`/`basic`) e o atributo **`attends_clients`** (true/false) de um usuário, então os dois campos são persistidos de forma **independente** e valem nas **próximas** requisições (novo token reflete os valores — FR-G5). Ex.: `manager` + `attends_clients=true` (manicure que recepciona) e `manager` + `attends_clients=false` (recepcionista pura) são ambos válidos.

3. **(AC3 — RolesGuard / matriz FR-I2)** Dada a matriz de permissões por `access_level` (FR-I2), quando um usuário tenta uma ação fora do seu nível (ex.: `manager` ou `basic` gerenciando usuários, ou acessando relatórios consolidados), então o `RolesGuard` rejeita com **403**. Os endpoints de gestão de equipe desta story exigem `@Roles('owner')`.

4. **(AC4 — `attends_clients` exposto para disponibilidade)** Dado um usuário com `attends_clients=true` (FR-I1), quando se consulta a lista de profissionais que atendem (endpoint tenant-scoped), então **apenas** usuários com `attends_clients=true` (e ativos) são retornados — independentemente do `access_level`. *(O consumo por `AvailabilityService`/`professional_id` é do Épico 2; aqui entregamos o dado e o endpoint, não o cálculo de disponibilidade — ver Fronteiras de escopo.)*

5. **(AC5 — Dono único / FR-I3)** Dado que existe exatamente **um** `owner` ativo por instalação (FR-I3), quando tento rebaixar o `access_level` do único `owner` (ou desativá-lo), então a operação é **bloqueada** com mensagem explicativa (HTTP 409/422). **Escopo 1.4: apenas o bloqueio.** A transferência de titularidade é feita manualmente no banco/setup presencial por enquanto; a transferência automatizada é melhoria futura (ver Decisões aprovadas, item 4).

6. **(AC6 — Desativação revoga acesso / FR-G4)** Dado um usuário desativado (`is_active=false`), quando ele tenta **autenticar** (login) **ou usar um token de acesso já existente**, então o acesso é **negado** (login → 401; requisição autenticada com token válido mas usuário inativo → 401). O Dono não pode desativar a si mesmo sendo o único `owner` (ver AC5).

## Pré-requisitos e contexto (Stories 1.1–1.3 — no `main`, build limpo validado)

- **Auth (1.2):** `AuthModule` com `JwtStrategy`/`JwtAuthGuard` (`modules/auth`). Access token carrega `{ sub, companyId, accessLevel, attendsClients }`; `JwtStrategy.validate` popula `req.user: AuthUser { userId, companyId, accessLevel, attendsClients }`. Refresh stateless (`JWT_REFRESH_SECRET`). Login resolve tenant por `companySlug` (DL-026) e checa `is_active` no login.
- **Multi-tenancy (1.3):** `TenantMiddleware` aplicado **por controller** via `TENANT_AWARE_CONTROLLERS` (`app.module.ts`). `TenantAwareRepository<T>` injeta `WHERE company_id = ?`. `UsersRepository extends TenantAwareRepository<User>`. `UsersService` já tem: `findById` (tenant), `findByIdUnscoped` (refresh), `findByCompanyAndEmail` (login), `listForTenant`, `countForTenant`.
- **Guard-rail (1.3.01):** todo controller novo que toca tabela tenant-aware **deve** ser registrado em `src/modules/tenant/tenant-aware-controllers.ts` (`TENANT_AWARE_CONTROLLERS`), senão `tenant-coverage.spec.ts` quebra a suíte. **Esta story adiciona endpoints de escrita em `UsersController` (já coberto) e possivelmente um controller de convite — registrar se for o caso.**
- **Schema `users` (§3.2):** já tem `access_level ENUM('owner','manager','basic')`, `attends_clients BOOLEAN`, `is_active BOOLEAN`, `theme`, `uq_users_tenant_email (company_id, email)`, índices `idx_users_company_access`/`_attends`/`_active`. `password_hash VARCHAR(255) NOT NULL`. **Não há colunas/tabela de convite — esta story precisa de uma migration (ver DECISÃO PENDENTE 1).**
- **Common:** `common/repository/` e `common/tenant/` existem. **Não existem ainda** `common/decorators/roles.decorator.ts` nem o `RolesGuard` — são **novos** nesta story (arquitetura §1 prevê `common/decorators/roles.decorator.ts` e §4.1 prevê `RolesGuard` no `AuthModule`).
- Fluxo Git: branch `story/1.4-gestao-de-equipe-e-permissoes` (já criada do `main`); commits pequenos; PR no fim (merge é do Renato). Versionamento: planejado = `1.4`; ajustes fora de escopo = `1.4.NN` (DL-028).

## Tasks / Subtasks

> Ordem TDD (red→green→refactor). Rode a suíte com MySQL acessível. Não marque `[x]` sem teste passando. Decisões aprovadas (ver seção "Decisões aprovadas" e DL-029).

- [ ] **Task 1 — `RolesGuard` + `@Roles` decorator (AC3)**
  - [ ] `common/decorators/roles.decorator.ts`: `@Roles(...levels: AccessLevel[])` via `SetMetadata('roles', levels)` (arquitetura §1.149-151).
  - [ ] `modules/auth/guards/roles.guard.ts`: lê metadata `roles` (`Reflector`), compara contra `req.user.accessLevel`; sem `@Roles` → libera; nível insuficiente → `ForbiddenException` (403). Roda **depois** do `JwtAuthGuard` (precisa de `req.user`).
  - [ ] Exportar o `RolesGuard` pelo `AuthModule` (§4.1).
  - [ ] RED→GREEN unit: `roles.guard.spec.ts` — `owner` passa em `@Roles('owner')`; `manager`/`basic` → 403; endpoint sem `@Roles` → passa.

- [ ] **Task 2 — Enforçar `is_active` por requisição (AC6)**
  - [ ] `modules/auth/guards/active-user.guard.ts`: com o tenant já no contexto (middleware roda antes), busca o usuário **tenant-scoped** (`UsersService.findById(req.user.userId)`) e rejeita com **401** se não encontrado ou `is_active=false`. Aplicar junto do `JwtAuthGuard` nas rotas protegidas (decisão aprovada item 2).
  - [ ] Login já barra inativo (1.2) — adicionar/confirmar teste de regressão.
  - [ ] RED→GREEN e2e: usuário ativo recebe token → é desativado → mesma requisição com o token antigo → 401.

- [ ] **Task 3 — Migration + entidade `user_invites` (AC1)**
  - [ ] Migration (nova) para a tabela `user_invites` (`id`, `company_id`, `email`, `name`, `access_level`, `attends_clients`, `token_hash`, `expires_at`, `accepted_at NULL`, `invited_by`, timestamps; FK `company_id → companies`; índices liderados por `company_id`; unicidade do convite **pendente** por `(company_id, email)`). `password_hash` em `users` permanece `NOT NULL` — o `User` é criado no aceite (decisão aprovada item 1).
  - [ ] Registrar a entidade nas `entities`/`migrations` do `data-source-options.ts` e `typeorm.config.ts` (espelhar o padrão de `CreateUsers`).
  - [ ] RED→GREEN: e2e de migration (espelhar `migration-users.e2e-spec.ts`): aplica e reverte limpo.

- [ ] **Task 4 — Convidar usuário (Dono) (AC1, AC2, AC3)**
  - [ ] `POST /api/users/invite` (ou `/api/team/invite`) protegido por `JwtAuthGuard` + `@Roles('owner')`: valida DTO (`name`, `email`, `access_level`, `attends_clients`), cria convite tenant-scoped com token aleatório seguro (hash no banco, token em claro só no retorno), retorna o **link** de aceite. Bloqueia e-mail já existente como usuário ativo no tenant (`uq_users_tenant_email`).
  - [ ] Gerar e **retornar o link** de aceite (sem envio de e-mail — decisão aprovada item 3). Endpoint no `UsersController` existente (já coberto pelo guard-rail; sem controller novo — item 5).
  - [ ] RED→GREEN e2e: Dono convida → 201 + link; `manager`/`basic` convidando → 403.

- [ ] **Task 5 — Aceitar convite / criar senha no primeiro acesso (AC1)**
  - [ ] Endpoint **público (pré-tenant)**, fora do `TenantMiddleware` (como `auth/*` — DL-026), ex.: `POST /api/auth/accept-invite` `{ token, password }`: valida token (não expirado, não usado), cria o `User` com `password_hash` (bcrypt), `access_level`/`attends_clients` do convite, `is_active=true`, marca convite como aceito (uso único). Opcional: retorna tokens (auto-login) ou exige login depois.
  - [ ] Resolver o tenant pelo convite (não pelo contexto — não há). Garantir que entra na rota de exclusão do middleware (espelhar exclusão de `auth/*`).
  - [ ] RED→GREEN e2e: aceite cria usuário e permite login; token expirado/reutilizado → 400/401.

- [ ] **Task 6 — Editar usuário: `access_level` + `attends_clients` + ativar/desativar (AC2, AC3, AC5, AC6)**
  - [ ] `PATCH /api/users/:id` protegido por `@Roles('owner')`, tenant-scoped (id de outro tenant → 404 pelo `TenantAwareRepository`): atualiza `access_level` e/ou `attends_clients` (independentes) e `is_active`.
  - [ ] **Invariante FR-I3 (AC5) — só o bloqueio:** impedir rebaixar/desativar o **único** `owner` ativo (contar owners ativos do tenant; se a operação deixaria zero, rejeitar com 409/422 + mensagem). **NÃO** construir transferência automática (decisão aprovada item 4). Considerar concorrência (transação/lock) ao contar, para evitar corrida que zere os owners.
  - [ ] Reuso: usar `UsersRepository`/`UsersService` (tenant-aware) — **não** criar repositório paralelo.
  - [ ] RED→GREEN e2e: altera os dois eixos de forma independente (novo token reflete — AC2); bloqueio do último owner (AC5); desativar usuário comum ok.

- [ ] **Task 7 — Listagem de equipe + profissionais que atendem (AC2, AC4)**
  - [ ] `GET /api/users` (já existe) — confirmar que retorna campos de gestão (`access_level`, `attends_clients`, `is_active`) sem vazar `password_hash`.
  - [ ] `GET /api/users/attenders` (ou query param) tenant-scoped: só `attends_clients=true` e ativos (AC4), para consumo futuro do Épico 2.
  - [ ] RED→GREEN e2e: lista de equipe traz os campos certos; `attenders` filtra corretamente.

- [ ] **Task 8 — Validação final (todas as ACs)**
  - [ ] Sequência CI em ambiente limpo, MySQL acessível: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde, **sem `--forceExit`** (manter o padrão da 1.3), e **guard-rail 1.3.01 verde** (controllers tenant-aware cobertos).
  - [ ] Conferir manualmente (compose): Dono convida, convidado cria senha e loga; Gestão/Básico recebem 403 nas ações de gestão; desativar revoga acesso.

## Dev Notes

### Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar `AvailabilityService`, `professional_schedules`, `professional_services` nem cálculo de disponibilidade — é Épico 2. Aqui só persistimos `attends_clients` e expomos a lista de quem atende (AC4).
- **NÃO** implementar a aplicação da matriz FR-I2 nos módulos de agendamento/pagamento/relatórios (não existem ainda). Esta story entrega o **mecanismo** (`RolesGuard` + `@Roles`) e o aplica **nos endpoints de gestão de equipe**. Os demais módulos usarão o mesmo mecanismo nos seus épicos.
- **NÃO** mexer no isolamento de tenant (1.3) nem no fluxo pré-tenant de auth/login (DL-026). O aceite de convite é pré-tenant e deve ficar **fora** do `TenantMiddleware`, como `auth/*`.
- **NÃO** quebrar regressões da 1.2/1.3: login, refresh, `/users/me`, `/users`, `/users/:id`, isolamento A↔B e o guard-rail 1.3.01.
- **NÃO** introduzir biblioteca de RBAC de terceiros — `@Roles`/`RolesGuard` nativos (Nest `Reflector`), conforme arquitetura §1/§4.1.

### Estratégia de autorização (arquitetura §4.1, §6.1)

- Ordem real Nest por request: `TenantMiddleware` (middleware) → `JwtAuthGuard` → `RolesGuard` → handler. O `RolesGuard` lê `req.user.accessLevel` (populado pelo `JwtStrategy`). Como `accessLevel` vem do **token**, alterações de nível (AC2) só valem no **próximo** token — documentar (alinha com FR-G5 "próximas requisições").
- `@Roles('owner')` nos endpoints de gestão de equipe. Sem `@Roles` → guard libera (rotas comuns autenticadas seguem só com `JwtAuthGuard`).
- `is_active` (AC6) **não** está no token e não pode ser inferido dele → precisa de checagem contra o banco por request nas rotas protegidas (DECISÃO PENDENTE 2). Atenção a custo: 1 lookup tenant-scoped por request.

### Convite e primeiro acesso (AC1, UX-DR14)

- UX (ux-spec.md §"Equipe e permissoes"): tela de lista com `[+ Convidar]`, modal "Convidar para a equipe" (Nome, Permissão; "convite enviado por link, usuário cria a própria senha no primeiro acesso"), modal "Editar permissão". Espelhar os campos.
- Segurança do token: aleatório (`crypto.randomBytes`), **hash no banco** (nunca em claro), `expires_at`, uso único (`accepted_at`). O link em claro só existe na resposta da criação.
- `password_hash` é `NOT NULL` no schema atual → por isso o usuário só é **criado** no aceite (com senha), não no convite. (Alternativa: criar user já no convite com `password_hash` nullable — exige migration que afrouxe a coluna; ver DECISÃO PENDENTE 1.)

### Invariante Dono único (AC5, FR-I3)

- Exatamente um `owner` ativo por `company_id`. Operações que reduziriam isso (rebaixar/desativar o último owner) → bloqueio (409/422) com mensagem. Transferência atômica: promover B a `owner` e rebaixar A no mesmo request (transação). Considerar concorrência (dois PATCH simultâneos) — usar transação/lock análogo a NFR-C1.

### Segurança / regressão

- Nunca retornar `password_hash` nos endpoints (já omitido no `toProfile` do `UsersController` — manter).
- Endpoints de gestão SEMPRE tenant-scoped (via `TenantAwareRepository`) — id de outro tenant é 404, não 403.
- O endpoint de aceite de convite é o único novo endpoint **público**; tudo mais exige `JwtAuthGuard`.

### File structure (arquitetura §1, §4.1, §4.3)

- `apps/api/src/common/decorators/roles.decorator.ts` (novo)
- `apps/api/src/modules/auth/guards/roles.guard.ts` (novo) + `roles.guard.spec.ts`
- `apps/api/src/modules/auth/guards/active-user.guard.ts` (novo, se DECISÃO PENDENTE 2 = guard) + spec
- `apps/api/src/modules/auth/auth.controller.ts` (+ endpoint `accept-invite`) e `auth.service.ts` (lógica de aceite) — ou um `InvitesModule` (decidir)
- `apps/api/src/modules/users/` — DTOs novos (`invite-user.dto.ts`, `update-user.dto.ts`), `users.controller.ts`/`users.service.ts` estendidos; possivelmente `team.controller.ts`
- `apps/api/src/database/entities/user-invite.entity.ts` (novo) + migration nova + registro em `data-source-options.ts`/`typeorm.config.ts`
- Se houver controller novo tenant-aware → `src/modules/tenant/tenant-aware-controllers.ts`
- Testes: e2e em `apps/api/test/` (`team-invite.e2e-spec.ts`, `roles.e2e-spec.ts`, `user-management.e2e-spec.ts`, migration spec); unit specs de `RolesGuard` e do(s) guard(s) novo(s). Reusar `test/e2e-app.ts` (`bootstrapE2E`/`teardownE2E`) e `test/test-db.ts` (incluir a nova tabela em `KNOWN_TABLES` para reset FK-safe).

### Testing

- Unit: `RolesGuard` (owner/manager/basic vs `@Roles`), guard de `is_active`, lógica de invariante de Dono único.
- e2e (MySQL real, `--runInBand`): convite→aceite→login; 403 da matriz; edição dos dois eixos com novo token; bloqueio do último owner; desativação revoga token existente; regressões 1.2/1.3.
- Manter teardown limpo (AC5 da 1.3 — `app.close()`, sem `--forceExit`) e o guard-rail 1.3.01 verde.

### References

- [Source: epics.md#Story 1.4] — ACs originais (FR-G4, FR-G5, FR-I1/I2/I3, DL-022, UX-DR14).
- [Source: prd.md#FR-I1/FR-I2/FR-I3] — dois eixos + matriz de permissões + Dono único; [FR-G4/FR-G5] — gestão e níveis.
- [Source: architecture.md#3.2 users] — schema (access_level, attends_clients, is_active); [#4.1 AuthModule] — `RolesGuard`/`@Roles`; [#4.3 UsersModule] — CRUD dois eixos; [#1 estrutura] — `common/decorators/roles.decorator.ts`.
- [Source: ux-spec.md#Equipe e permissoes] — telas de lista, convite e edição de permissão (UX-DR14).
- [Source: .decision-log.md#DL-022] — dois eixos; [#DL-026] — pré-tenant/login; [#DL-028] — versionamento 1.4.NN.

### Decisões aprovadas (Renato, 2026-06-30 — ver DL-029)

1. **Modelo de convite:** tabela separada **`user_invites`** (não afrouxar `password_hash`). O `User` é criado no **aceite** (com senha). Migration feita pela própria dev (tabela simples, sem necessidade do arquiteto).
2. **Enforcement de `is_active`:** **guard dedicado com lookup tenant-scoped por request** (`ActiveUserGuard`). Revogação imediata vale a query extra (demissão corta acesso na hora).
3. **Entrega do convite:** **gerar e retornar o link** (sem e-mail). Venda é presencial — o Dono passa o link na hora. E-mail é melhoria futura.
4. **Transferência de Dono:** **APENAS O BLOQUEIO** (não deixar remover/rebaixar o último Dono). **NÃO** construir transferência atômica automática agora — transferências são manuais no setup presencial dos primeiros clientes. A transferência automatizada vira ajuste futuro (1.4.NN ou história própria) quando houver demanda real.
5. **Organização de módulos:** aceite de convite no **`AuthModule`** (pré-tenant, junto do login); gestão de equipe no **`UsersController`** existente. **Sem controller novo** → não mexe no guard-rail 1.3.01.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
