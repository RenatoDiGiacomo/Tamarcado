# Story 1.7: Identidade visual e tema

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a dono de salão,
I want personalizar nome, logo e cor da instalação e escolher o tema claro/escuro,
so that o sistema reflita a identidade do meu negócio.

## Acceptance Criteria

1. **(AC1 — Config da instalação, somente Dono)** Dado que sou o Dono, quando configuro nome do estabelecimento, informo a **URL do logo** e defino a cor primária, então os dados são persistidos em `companies` (`name`, `logo_url`, `primary_color`) e o painel passa a exibir nome e logo (FR-J1, FR-J3, UX-DR13 — subseção Identidade). Mutações exigem `@Roles('owner')` → não-Dono recebe 403. *(Upload de arquivo é evolução futura — DL-034; no MVP o logo é uma URL, colada no setup presencial — FR-J5.)*

2. **(AC2 — Área restrita, sem self-service além disso)** Dado a área de personalização (FR-G6, FR-J5), quando acesso, então ela está restrita ao Dono e é feita no painel — sem editor visual self-service adicional no MVP.

3. **(AC3 — Tema individual)** Dado qualquer usuário autenticado, quando alterna claro/escuro na tela de Perfil, então a preferência é gravada em `users.theme` (individual por usuário — DL-021) e **persiste entre sessões** (FR-J4, UX-DR15). Não é config da instalação.

4. **(AC4 — Painel exibe a identidade)** Dado uma instalação com nome e logo configurados, quando qualquer usuário do tenant abre o painel, então o **nome e o logo** da instalação aparecem (header), substituindo o placeholder "Tamarcado"; a cor primária é aplicada como acento visual.

## Pré-requisitos e contexto (Épico 1: Stories 1.1–1.6 no `main`)

- **Schema já existe (sem migration nova, salvo armazenamento do logo — ver DECISÃO 1):**
  - `companies` (§3.1): `name`, `logo_url VARCHAR(500) NULL`, `primary_color VARCHAR(7) NULL DEFAULT '#6C63FF'`, `business_hours_*` etc. `companies` é o **registro de tenants** — **não** é tenant-scoped por `TenantAwareRepository` (é acessada por `id`).
  - `users.theme ENUM('light','dark') DEFAULT 'light'` (desde 1.2/1.3, DL-021). `GET /api/users/me` já retorna `theme`.
- **API (1.2–1.6):** `JwtAuthGuard`/`ActiveUserGuard`/`RolesGuard`; `@Roles('owner')`; `req.user = { userId, companyId, accessLevel, attendsClients }` (o `companyId` do token identifica a instalação atual). Swagger dev-only em `/api/docs` (1.5.01) — **documentar os endpoints novos** com `@ApiTags`/`@ApiBearerAuth`.
- **Guard-rail 1.3.01 (importante):** ele cobre controllers que dependem de `TenantAwareRepository`. O `InstallationController` opera sobre `companies` (não é tenant-aware repo) usando `req.user.companyId` do token → **não entra** em `TENANT_AWARE_CONTROLLERS** e o guard-rail não o sinaliza. Segurança do tenant vem de sempre usar `req.user.companyId` (nunca um id do body). Documentar essa fronteira.
- **Web (`apps/web`, estado atual — Story 1.2):** React + Vite + react-router-dom; **sem UI lib, sem sistema de tema**. Arquivos: `components/AppShell.tsx` (header com `<strong>Tamarcado</strong>` hardcoded + nome do user + Sair; sidebar com "Configurações" só para owner — hoje itens são labels, sem rotas), `auth/AuthContext.tsx` (expõe `user`), `lib/api.ts` (fetch fino: `apiRequest(path, {method, body, token})` — só JSON, sem PUT/multipart), `pages/Login.tsx`. Testes com Vitest + Testing Library.
- Fluxo Git: branch `story/1.7-identidade-visual-e-tema` (já criada do `main`); commits pequenos, PR no fim (merge é do Renato). Versionamento (DL-028, 2 níveis): planejado `1.7`; ajustes fora de escopo `1.7.NN`; tipo no prefixo do commit (`feat`/`fix`/`docs`/`chore`).

## Tasks / Subtasks

> Ordem TDD. Rode a suíte com MySQL. Não marque `[x]` sem teste passando. Decisões aprovadas (ver seção "Decisões aprovadas" e DL-034): logo = URL (sem upload); full-stack; `PATCH /users/me` p/ tema; cor só como acento.

### API

- [ ] **Task 1 — `InstallationModule` (GET/PATCH da instalação atual) (AC1, AC2, AC4)**
  - [ ] `modules/installation/{installation.module.ts, installation.controller.ts, installation.service.ts, dto/update-installation.dto.ts}`. Injeta `@InjectRepository(Company)`. Resolve a company atual por `req.user.companyId` (nunca por id do body).
  - [ ] `GET /api/installation` (qualquer autenticado do tenant): `{ name, logoUrl, primaryColor }` — usado pelo painel para o branding (AC4).
  - [ ] `PATCH /api/installation` (`@Roles('owner')`): atualiza `name`, `logo_url` (**URL**, opcional/nullable) e `primary_color` (validar hex `#RRGGBB`; `logoUrl` = URL válida quando presente). Não-Dono → 403.
  - [ ] `@ApiTags('installation')` + `@ApiBearerAuth()`. **Não** registrar em `TENANT_AWARE_CONTROLLERS` (não usa `TenantAwareRepository`; ver contexto). Guards: `JwtAuthGuard, ActiveUserGuard, RolesGuard`.
  - [ ] RED→GREEN e2e: Dono edita nome/logo(URL)/cor; GET reflete; não-Dono PATCH → 403; hex/URL inválido → 400.

- [ ] **Task 3 — Tema individual (`PATCH /api/users/me`) (AC3)**
  - [ ] `PATCH /api/users/me` (qualquer autenticado): `{ theme: 'light'|'dark' }` → grava em `users.theme` do próprio usuário (tenant-scoped, `req.user.userId`). Reusar `UsersService` (novo método `setTheme` tenant-scoped). `GET /api/users/me` já devolve `theme`.
  - [ ] `@ApiTags`/doc no `UsersController`.
  - [ ] RED→GREEN e2e: seta tema; persiste (novo GET reflete); valor inválido → 400.

### Web (apps/web)

- [ ] **Task 4 — Sistema de tema (claro/escuro) + persistência (AC3, AC4)**
  - [ ] `ThemeProvider`/contexto: aplica `data-theme` (ou classe) no `<html>`/root e tokens CSS (variáveis) para claro/escuro; lê o tema inicial de `GET /api/users/me` (`theme`) e aplica; toggle chama `PATCH /api/users/me`.
  - [ ] `lib/api.ts` já cobre `PATCH` JSON — sem multipart (logo é URL). Sem mudança estrutural no client além de helpers de conveniência, se necessário.
  - [ ] RED→GREEN (Vitest): toggle troca o tema e chama a API; tema inicial vem do `/users/me`.

- [ ] **Task 5 — Branding no `AppShell` (AC4)**
  - [ ] Buscar `GET /api/installation` no load; substituir `<strong>Tamarcado</strong>` pelo **nome** + **logo** (`<img>` de `logoUrl`, com fallback pro nome se sem logo); aplicar `primaryColor` como acento (variável CSS).
  - [ ] RED→GREEN (Vitest): header exibe nome/logo mockados; fallback sem logo.

- [ ] **Task 6 — Tela "Perfil" (toggle de tema) + "Configurações → Identidade visual" (AC1, AC2, AC3)**
  - [ ] Rotas/páginas: **Perfil** (avatar no header → toggle de tema, UX §"Perfil do usuário") e **Configurações → Identidade visual** (owner-only: nome, **URL do logo**, cor primária, "Salvar" — espelhar UX linhas 966–983, com o campo de logo como URL no MVP).
  - [ ] Owner-only no client: esconder/rotear "Configurações" só para `accessLevel==='owner'` (o backend já barra com 403 — o client é só UX).
  - [ ] RED→GREEN (Vitest): form salva (chama PATCH/upload); Perfil alterna tema; não-owner não vê Configurações.

- [ ] **Task 7 — Validação final (todas as ACs)**
  - [ ] Sequência CI: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde (API + web), sem `--forceExit`, guard-rail 1.3.01 verde.
  - [ ] Conferir manualmente (compose + `/api/docs`): Dono edita nome/logo/cor → painel reflete; usuário comum troca tema e persiste após relogar; não-Dono não acessa Configurações (403 no PATCH).

## Dev Notes

### Fronteiras de escopo — o que NÃO fazer

- **NÃO** construir editor visual self-service além do form simples (FR-J5): nome, logo, cor primária. Sem paleta avançada, sem preview complexo.
- **NÃO** aplicar `primary_color` em cada componente — só como **acento** (header/botões primários) via variável CSS. O objetivo é "apresentável ao salão", não theming completo.
- **NÃO** mexer no bot/WhatsApp (FR-J2, assinatura do bot com o nome) — é Épico 2; aqui o nome vive em `companies.name`, o bot consome depois.
- **NÃO** quebrar regressões 1.1–1.6 (login, `/users/*`, `/services/*`, `/schedules/*`, isolamento, guard-rail, Swagger).
- **NÃO** registrar o `InstallationController` no guard-rail (não usa `TenantAwareRepository`).

### Segurança de tenant (sem TenantAwareRepository)

- `companies` é o registro de tenants — acessada por `id`, não filtrada por `company_id`. O `InstallationController` **sempre** usa `req.user.companyId` (do token verificado) para achar/atualizar a company atual; **nunca** aceita um id de company no body/param. Isso mantém o isolamento sem o wrapper tenant-aware.
- Tema: `PATCH /api/users/me` usa `req.user.userId` — o usuário só altera o próprio tema.

### Autorização (matriz FR-I2)

- Identidade visual (nome/logo/cor) = **owner-only** ("Configurar personalização da instalação"). Tema = **qualquer usuário** (preferência individual).

### File structure

- **API:** `apps/api/src/modules/installation/*`; `modules/users/users.service.ts` (+`setTheme`), `users.controller.ts` (+`PATCH /me`); `app.module.ts` (importa `InstallationModule`).
- **Web:** `apps/web/src/theme/*` (provider + tokens), `components/AppShell.tsx` (branding), `pages/Perfil.tsx`, `pages/ConfiguracoesIdentidade.tsx`, `lib/api.ts` (extensão), rotas em `App.tsx`.
- **Testes:** e2e `apps/api/test/installation.e2e-spec.ts`, `users-theme.e2e-spec.ts`; Vitest em `apps/web/src/**`.

### Testing

- API e2e (MySQL, `--runInBand`, `jest.setTimeout(60000)`): CRUD de identidade (owner) + 403; upload de logo (tipo/tamanho); tema persiste. Teardown limpo.
- Web (Vitest): ThemeProvider (aplica/toggle/persiste via API), AppShell (branding + fallback), forms de Perfil/Identidade. Mockar `apiRequest`.

### Swagger (1.5.01)

- `@ApiTags('installation')` no novo controller; documentar `PATCH /users/me`. Conferir em `/api/docs` (dev). Upload aparece como `multipart/form-data` (usar `@ApiConsumes('multipart/form-data')` + `@ApiBody`).

### References

- [Source: epics.md#Story 1.7] — ACs (FR-J1/J3/J4/J5, FR-G6, UX-DR13/DR15, DL-021).
- [Source: prd.md#FR-J] — identidade por instalação, tema individual, setup por Renato (sem self-service).
- [Source: architecture.md#3.1 companies] (name/logo_url/primary_color), [#3.2 users.theme], [#4.12 InstallationModule].
- [Source: ux-spec.md#Identidade visual] (form nome/logo/cor, linhas 966–983) e nota do tema em "Perfil".
- [Source: .decision-log.md#DL-021] (tema individual em users), [#DL-028] (versionamento 2 níveis).

### Decisões aprovadas (Renato, 2026-07-02 — ver DL-034)

1. **Logo = campo URL (opção b).** No MVP o logo é uma **URL** (`companies.logo_url`), colada por Renato no **setup presencial** (FR-J5) — trivial e evita a dor de volume Docker/arquivo perdido. Sem upload multipart, sem storage. **Upload self-service pelo painel + storage (disco/S3-R2) fica como evolução futura** (roadmap `addendum.md §C.9`), quando o cliente for subir o próprio logo.
2. **Full-stack agora:** API + branding no painel + Perfil + Configurações — é o visual para apresentar aos salões.
3. **Tema:** `PATCH /api/users/me { theme }` (self-update genérico).
4. **Cor primária:** só **acento** (header + botões primários) via variável CSS. Sem theming amplo.
5. **Sem UI lib nova:** CSS/estilos simples, como o `AppShell` atual.

**Confirmado (segurança):** `InstallationController` **não** entra no guard-rail 1.3.01 — `companies` não é tenant-aware; isolamento vem de sempre usar `req.user.companyId` do token, nunca id de company no body.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
