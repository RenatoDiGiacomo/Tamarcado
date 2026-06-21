# Story 1.2: Autenticação do dono e shell do painel

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a dono de salão,
I want fazer login no painel com e-mail e senha e ver a estrutura de navegação,
so that eu acesse minha instalação de forma segura.

## Acceptance Criteria

1. **(AC1 — Migration `users`)** Dada a migration desta story, quando aplicada, então a tabela `users` é criada com `id`, `company_id`, `name`, `email`, `password_hash`, `access_level` (enum owner/manager/basic), `attends_clients` (boolean), `theme` (enum light/dark, default light), `is_active`, timestamps — dois eixos de acesso independentes (DL-022) e tema individual por usuário (DL-021).
2. **(AC2 — Login → tokens)** Dadas credenciais válidas, quando o dono faz login, então o sistema retorna um JWT de acesso (15 min) e um refresh token (7 dias), e o `JwtStrategy` extrai `{ userId, companyId, accessLevel, attendsClients }` (NFR-S3, DL-022).
3. **(AC3 — Refresh)** Dado um access token expirado e um refresh token válido, quando o cliente chama o endpoint de refresh, então um novo access token é emitido sem novo login.
4. **(AC4 — Guard 401)** Dada uma requisição a endpoint protegido sem token válido, quando o `JwtAuthGuard` avalia, então a requisição é rejeitada com `401`.
5. **(AC5 — Shell responsivo)** Dado um usuário autenticado, quando acessa o painel, então vê o shell de navegação responsivo — sidebar fixa em desktop (≥768px) e tabs no rodapé em mobile (<768px) com menu "+" e área para badge de pendentes (UX-DR7).

## Pré-requisitos e contexto da base (Story 1.1 — já no `main`)

- Monorepo pnpm + Turborepo operacional. **Use os scripts raiz via Turbo** (`pnpm run build/lint/typecheck/test`) — `pnpm -r` puro ignora o `^build` e quebra em checkout limpo (lição da 1.1 / DL-025).
- `apps/api` (NestJS 11) com `GET /health` público e `setGlobalPrefix("api", { exclude: ["health"] })` — **todas as rotas novas ficam sob `/api`** (ex.: `/api/auth/login`).
- TypeORM configurado: `apps/api/src/database/{data-source-options.ts, database.module.ts, typeorm.config.ts}`, entidades em `entities/`, migrations em `migrations/`. `synchronize: false` — schema só evolui por migration.
- Tabela `companies` já existe (migration `1718900000000-CreateCompanies`). A FK `users.company_id → companies.id` aponta para ela.
- `apps/web` (React 19 + Vite 6) renderiza uma página inicial; testes com Vitest + @testing-library/react (setup em `src/test-setup.ts`).
- `packages/shared-types` exporta `CompanyId = string` (PK bigint → string). Use para tipar `companyId`.
- Fluxo Git: esta story está na branch `story/1.2-auth-shell`; commits pequenos; PR no fim (não mergear).

## Tasks / Subtasks

> Ordem TDD (red→green→refactor). Não marque `[x]` sem teste passando. Rode a suíte com MySQL acessível (docker compose up mysql, ou container efêmero).

- [ ] **Task 1 — Dependências e configuração (AC2, AC3)**
  - [ ] `apps/api`: adicionar `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/config`, `bcryptjs`, `class-validator`, `class-transformer` (+ `@types/passport-jwt`, `@types/bcryptjs`). **Usar `bcryptjs` (JS puro)**, não `bcrypt` nativo — evita build de toolchain na imagem Alpine.
  - [ ] `apps/web`: adicionar `react-router-dom`.
  - [ ] Registrar `ConfigModule.forRoot({ isGlobal: true })` no `AppModule`. Variáveis: `JWT_SECRET` (já existe), `JWT_ACCESS_TTL=900s`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL=7d`. Adicionar as novas ao `.env.example`, ao `docker-compose.yml` (serviço `api`) e ao bloco `env`/secrets do CI (`ci.yml`) e do staging.
  - [ ] `web`: adicionar `VITE_API_URL` (default `http://localhost:3000`) ao `.env.example` e ao serviço `web` do compose.

- [ ] **Task 2 — Entidade `User` + migration `users` (AC1)**
  - [ ] Criar `apps/api/src/database/entities/user.entity.ts` conforme architecture.md §3.2 (campos e tipos exatos; `id` como `string` — bigint).
  - [ ] RED: teste de integração `test/migration-users.e2e-spec.ts` que roda as migrations e verifica que `users` existe com as colunas da AC1 (`access_level` enum owner/manager/basic; `attends_clients` bool default false; `theme` enum light/dark default light; `is_active` default true) e a FK para `companies`; e que reverte limpo.
  - [ ] GREEN: migration `CreateUsers` (timestamp > `1718900000000`) criando a tabela `users` com: `id` bigint PK, `company_id` bigint NOT NULL, `name` varchar(100), `email` varchar(200) **UNIQUE global** (`uq_users_email`), `phone_whatsapp` varchar(20) NULL, `password_hash` varchar(255), `access_level` ENUM('owner','manager','basic'), `attends_clients` bool default false, `theme` ENUM('light','dark') default 'light', `is_active` bool default true, `created_at`/`updated_at`. Índices: `idx_users_company_access (company_id, access_level)`, `idx_users_company_attends (company_id, attends_clients)`, `idx_users_company_active (company_id, is_active)`. FK `fk_users_company (company_id) → companies(id)`.
  - [ ] **Não criar** outras tabelas. **Não** adicionar TenantMiddleware/TenantAwareRepository (Story 1.3).

- [ ] **Task 3 — UsersModule mínimo (AC2, AC5)**
  - [ ] `users.module.ts`, `users.service.ts` com `findByEmail(email)` e `findById(id)` sobre o repositório de `User` (TypeORM `@InjectRepository`). Sem `TenantAwareRepository` ainda — lookup por email é global (a constraint é global) e por id.
  - [ ] RED→GREEN: `GET /api/users/me` (protegido) retornando o perfil do usuário autenticado: `{ id, companyId, name, email, accessLevel, attendsClients, theme }` — consumido pelo shell (item "Configurações" só para owner; base para tema futuro).

- [ ] **Task 4 — AuthModule: login + JWT (AC2, AC4)**
  - [ ] RED: `auth.service.spec.ts` — `validateUser(email, senha)` retorna o usuário quando o hash bate (bcryptjs) e `null`/erro quando não; `login(user)` assina access (TTL 15min) e refresh (TTL 7d) com payload `{ sub: userId, companyId, accessLevel, attendsClients }`.
  - [ ] GREEN: `auth.service.ts` (validateUser via `UsersService.findByEmail` + `bcrypt.compare`; login via `JwtService.sign` com segredos/TTL distintos para access e refresh), `strategies/jwt.strategy.ts` (extrai Bearer, valida com `JWT_SECRET`, `validate(payload)` → `{ userId: payload.sub, companyId, accessLevel, attendsClients }`), `guards/jwt-auth.guard.ts` (`AuthGuard('jwt')`).
  - [ ] `auth.controller.ts`: `POST /api/auth/login` (DTO `{ email, password }` validado por class-validator) → `{ accessToken, refreshToken }`. Credenciais inválidas → `401`.
  - [ ] RED→GREEN: aplicar `JwtAuthGuard` em `GET /api/users/me`; sem token → `401`.
  - [ ] Registrar `ValidationPipe` global (whitelist) no `main.ts`.

- [ ] **Task 5 — Refresh token (AC3)**
  - [ ] RED: e2e — login → usar o `refreshToken` em `POST /api/auth/refresh` → recebe novo `accessToken` (200); refresh inválido/expirado → `401`.
  - [ ] GREEN: `POST /api/auth/refresh` valida o refresh token (segredo `JWT_REFRESH_SECRET`) e emite novo access token. **MVP: refresh stateless** (JWT assinado, sem armazenamento em banco); rotação/blacklist de refresh fica como melhoria futura — registrar na nota da story.

- [ ] **Task 6 — Seed de company + owner para dev/teste (AC2)**
  - [ ] Criar seed que insere uma `company` ("Salão Teste", slug único) e um `user` owner (`access_level='owner'`, `attends_clients=true`, senha conhecida via `bcryptjs.hash`) — idempotente. Expor como `pnpm --filter api run seed:dev` e chamar a partir de `infra/scripts/seed-dev.sh` (que já roda as migrations).
  - [ ] Documentar as credenciais de dev no `README` (apenas dev). Os e2e de auth podem semear o owner no `beforeAll` (não dependa do seed manual nos testes).

- [ ] **Task 7 — Frontend: cliente de API + estado de auth (AC2, AC4)**
  - [ ] `apps/web/src/lib/api.ts`: wrapper `fetch` lendo `import.meta.env.VITE_API_URL`, anexando `Authorization: Bearer <access>` e, em `401`, tentando o refresh uma vez antes de deslogar.
  - [ ] `apps/web/src/auth/AuthContext.tsx`: guarda tokens (localStorage) + perfil (`/api/users/me`), expõe `login()`, `logout()`, `user`. RED→GREEN com teste do reducer/contexto (mock do fetch).

- [ ] **Task 8 — Frontend: tela de Login (AC2)**
  - [ ] RED: `Login.test.tsx` — renderiza form (e-mail, senha, botão), submit chama o client e, em sucesso, redireciona para o shell; erro exibe mensagem.
  - [ ] GREEN: `src/pages/Login.tsx` + rota pública `/login`. Copy seguindo UX-DR6 (sem emojis, "você", frases curtas).

- [ ] **Task 9 — Frontend: shell responsivo + rotas protegidas (AC5)**
  - [ ] RED: `AppShell.test.tsx` — em viewport ≥768px renderiza **sidebar** com itens (Agenda, Pendentes [área de badge], Clientes, Pagamentos, Configurações); em <768px renderiza **tabs no rodapé** (Agenda, Pendentes [badge], Clientes, "+"); "Configurações" só aparece para `accessLevel === 'owner'`; há ação "Sair" (logout). (Use mock de `matchMedia`/CSS para o breakpoint.)
  - [ ] GREEN: `src/components/AppShell.tsx` (layout responsivo com breakpoint 768px, header com logo/nome + avatar/Sair, área de conteúdo placeholder), `src/routes` com guarda: sem sessão → redireciona a `/login`. Itens de menu são placeholders (telas reais vêm nos Épicos 2+); o "+" abre um menu de ações rápidas (placeholder). Badge de pendentes: só o espaço/elemento (a contagem real chega na Story 2.12).

- [ ] **Task 10 — Validações finais (todas as ACs)**
  - [ ] Rodar a sequência do CI via Turbo em ambiente limpo (sem `dist/`), com MySQL acessível: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test`.
  - [ ] Validar AC manualmente via compose: login retorna tokens; `/api/users/me` 401 sem token e 200 com token; refresh emite novo access; painel mostra o shell (sidebar/tabs) conforme a largura.

## Dev Notes

### Escopo cirúrgico — o que NÃO fazer

- **NÃO** implementar multi-tenancy (`TenantMiddleware`, `TenantAwareRepository`, `AsyncLocalStorage`) — é a **Story 1.3**. Aqui o lookup de usuário por email é global (a constraint `uq_users_email` é global) e o `companyId` vai no JWT, mas ainda **não** há filtro automático por tenant nas queries.
- **NÃO** implementar `RolesGuard`/matriz de permissões além do necessário — gestão de equipe e permissões é a **Story 1.4**. O shell só precisa esconder "Configurações" de não-owners (checagem simples do `accessLevel` do token).
- **NÃO** criar telas reais de Agenda/Pendentes/Clientes/Pagamentos — são placeholders no shell (Épicos 2+).
- **NÃO** criar outras tabelas além de `users`.
- **NÃO** adicionar editor de tema agora (a troca claro/escuro é a Story 1.7); apenas exponha `theme` no `/users/me`.

### Schema `users` (architecture.md §3.2)

Seguir o schema canônico §3.2 **exatamente**. Pontos de atenção:
- `email` tem **UNIQUE global** (`uq_users_email`), não por tenant — intencional no schema (um e-mail = um usuário na plataforma). Não transformar em unique composto com `company_id`.
- `access_level ENUM('owner','manager','basic')` e `attends_clients BOOLEAN DEFAULT FALSE` são os **dois eixos independentes** (DL-022). `theme ENUM('light','dark') DEFAULT 'light'` é preferência **individual** (DL-021) — fica em `users`, não em `companies`.
- Todos os índices de lookup começam por `company_id` (política da §6.3), mesmo sem o filtro automático desta story.

### Autenticação (architecture.md §4.1, NFR-S3)

- `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`. Access TTL 15 min, refresh TTL 7 dias.
- Payload do access: `{ sub: <userId>, companyId, accessLevel, attendsClients }`. `JwtStrategy.validate` retorna `{ userId, companyId, accessLevel, attendsClients }` (vira `req.user`).
- `AuthModule` **não** faz tenant lookup (isso é o `TenantModule`, §4.1).
- Hash de senha com **`bcryptjs`** (JS puro) — `bcrypt` nativo exige toolchain de build na imagem Alpine; evite.
- **Refresh stateless no MVP:** o refresh token é um JWT próprio (segredo `JWT_REFRESH_SECRET`, TTL 7d); o endpoint de refresh valida e emite novo access. Sem armazenamento/rotação/blacklist em banco — registrar como melhoria futura (consistente com o estágio do MVP).
- `JWT_SECRET` já existe no compose/.env (1.1). Adicionar `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`.

### Endpoints (sob prefixo global `/api`)

- `POST /api/auth/login` `{ email, password }` → `{ accessToken, refreshToken }` | `401`
- `POST /api/auth/refresh` `{ refreshToken }` → `{ accessToken }` | `401`
- `GET /api/users/me` (protegido) → `{ id, companyId, name, email, accessLevel, attendsClients, theme }` | `401`

### Frontend (ux-spec.md §4.1, UX-DR6, UX-DR7)

- Roteamento: `react-router-dom`. Rota pública `/login`; demais protegidas (sem sessão → redireciona `/login`).
- Estado de auth: `AuthContext` com tokens em `localStorage` + perfil de `/api/users/me`. Cliente `fetch` anexa `Authorization` e tenta refresh único em `401`.
- **Shell (UX-DR7, ux-spec §4.1):**
  - Desktop (≥768px): sidebar fixa — header com `[Logo] [Nome] ... [Usuário] [Sair]`; itens: Agenda, Pendentes (com área de badge), Clientes, Pagamentos, **Configurações (só owner)**.
  - Mobile (<768px): header `[Logo/Nome] [Avatar]`; tabs no rodapé: Agenda, Pendentes (badge), Clientes, **"+"** (menu de ações rápidas: Novo agendamento / Nova cliente / Registrar pagamento — placeholders).
  - Badge de pendentes: apenas o elemento/área agora; contagem real é a Story 2.12 (polling).
  - Copy UX-DR6: zero emojis, "você", frases curtas.
- `VITE_API_URL` (default `http://localhost:3000`) — no browser a API é `localhost:3000` (dev compose).

### Testing

- API unit (Jest): `AuthService` (validateUser hash hit/miss; login assina tokens com TTL/payload corretos), `JwtStrategy.validate` (shape do `req.user`).
- API e2e (Jest+supertest, MySQL real): login válido→200+tokens; inválido→401; refresh válido→novo access; refresh inválido→401; `GET /api/users/me` sem token→401, com token→200. Semear company+owner no `beforeAll` (não depender do seed manual). Migration `users` coberta por `test/migration-users.e2e-spec.ts`.
- Web (Vitest + @testing-library/react): Login (render, submit sucesso/erro), AppShell (sidebar ≥768 vs tabs <768, "Configurações" só owner, logout), guarda de rota (redireciona sem sessão). Mock de `matchMedia` e do client de API.

### Project Structure Notes

- Backend segue architecture.md §2: `modules/auth/{auth.module,auth.controller,auth.service}.ts`, `modules/auth/strategies/jwt.strategy.ts`, `modules/auth/guards/jwt-auth.guard.ts`, `modules/users/{users.module,users.controller,users.service}.ts`, `database/entities/user.entity.ts`, `database/migrations/<ts>-CreateUsers.ts`, `database/seeds/`.
- `LocalStrategy` e `RolesGuard` aparecem na §2 mas pertencem a 1.3/1.4 — não criar agora (a não ser `LocalStrategy` se preferir para o login; opcional, validar via service é suficiente).
- Frontend: `src/pages/Login.tsx`, `src/components/AppShell.tsx`, `src/auth/AuthContext.tsx`, `src/lib/api.ts`, configuração de rotas.

### References

- [Source: architecture.md#3.2 `users`] — schema completo, dois eixos (DL-022), theme (DL-021).
- [Source: architecture.md#4.1 AuthModule] — JWT access 15min/refresh 7d, JwtStrategy payload, JwtAuthGuard, RolesGuard (1.4).
- [Source: architecture.md#4.3 UsersModule] — findByEmail, /users/me, seed do primeiro owner.
- [Source: architecture.md#2] — estrutura de pastas auth/users.
- [Source: ux-spec.md#4.1 Estrutura de Navegação] — sidebar desktop / tabs mobile, badge, menu "+".
- [Source: epics.md#Story 1.2] — acceptance criteria; UX-DR7.
- [Source: .decision-log.md#DL-021, DL-022, DL-025] — tema individual; dois eixos; lição do Turbo `^build`.

### Pendências/decisões registradas

- Refresh token stateless (sem rotação/blacklist) no MVP — melhoria futura.
- `RolesGuard`/matriz de permissões e gestão de equipe → Story 1.4.
- Multi-tenancy (filtro automático por `company_id`) → Story 1.3.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
