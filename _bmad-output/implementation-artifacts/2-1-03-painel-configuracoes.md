# Ajuste 2.1.03: Painel de Configurações (Identidade + Serviços)

Status: approved — em implementação

> **Versionamento:** primeira story do épico **Painel de Configurações** (frontend das
> subseções de `/configuracoes`, cujo backend nasceu no Épico 1). Segue o padrão de id
> `2.1.NN` já usado em 2.1.01/2.1.02 (branch `story/2.1.03-painel-configuracoes`), pois
> aplica o Design System 2.1 a telas que a 2.1 deixou fora do escopo (design-system-spec
> §6 lista Serviços/Horários/Equipe/Identidade como pendentes). Entrega a **casca de
> Configurações** (abas horizontais) + **Identidade visual** e **Serviços**; Horários e
> Equipe são as próximas stories do épico. **Frontend puro** (`apps/web`) — todo o
> backend já existe (Épico 1: 1.4 equipe, 1.5 serviços + vínculo, 1.7 identidade).

## Origem

Prévia HTML da Sally (aprovada) — vira a referência de implementação, **sem passar
pelo Figma**. Duas levas aprovadas nesta rodada; Horários e Equipe (levas 3/4) ficam
para depois.

## Contexto técnico (o que já existe)

- **API `/installation`** (`GET` qualquer autenticado; `PATCH` só Dono) — `{ name,
  logoUrl, primaryColor }`. Já consumida por `useInstallation` (branding do shell).
- **API `/services`** — `GET` lista, `POST` cria, `PATCH :id` edita
  (`{ name, durationMinutes, price|null, isActive }`); `price` é **opcional** (DL-030).
- **API vínculo** — `GET /services/:id/professionals` → `{ professionalIds }`;
  `PUT /services/:id/professionals` (só Dono) substitui o conjunto. Só aceita usuários
  com `attends_clients = true`.
- **API `/users/attenders`** → `{ users: [...] }` (id, name, attendsClients) — fonte
  dos chips de profissionais.
- **Design System (2.1)** — `PageLayout`, `Card`, `Button`, `Input`, `Label`,
  componentes shadcn/Radix, tokens (primary do salão, raios, Inter), tema claro/escuro
  via `data-theme`. A cor primária vira `--primary` (HSL) em runtime (`lib/theme.ts`).
- **Cru a substituir:** `pages/ConfiguracoesIdentidade.tsx` (markup `<section>/<form>`).

## Acceptance Criteria

### Leva 1 — Casca + Identidade visual

1. **(AC1 — Casca com abas horizontais)** A tela de Configurações usa `PageLayout`
   (título "Configurações") + uma barra de **abas horizontais** (Radix Tabs, estilo
   do toggle `[Dia|Semana]` da Agenda): **Serviços · Horários · Equipe · Identidade
   visual**. Cada aba tem rota própria (`/configuracoes/servicos`,
   `/configuracoes/identidade`, etc.); a aba ativa reflete a URL. Horários e Equipe
   entram como abas **desabilitadas ("em breve")** nesta entrega.

2. **(AC2 — Owner-only)** As rotas de `/configuracoes/*` são **somente Dono**: usuário
   sem papel `owner` é redirecionado (para `/`). O item "Configurações" no shell já é
   owner-only (`AppShell`).

3. **(AC3 — Identidade restilada)** A aba Identidade visual usa `Card` + `Input` +
   `Label` + `Button` do DS (substitui o markup cru). Campos: **Nome da instalação**,
   **URL do logo** (placeholder `https://...`), **Cor primária**. Consome
   `GET /installation` (prefill) e salva com `PATCH /installation`; sucesso e erro
   comunicados (Toast/`sonner` ou linha de status). Preserva os `label`/associações e
   o fluxo de save dos testes existentes.

4. **(AC4 — Presets + hex)** A Cor primária oferece **5 presets** clicáveis + campo
   **hex** editável; selecionar um preset preenche o hex e vice-versa.

5. **(AC5 — Prévia ao vivo)** Uma área de **prévia** repinta **na hora** ao mudar cor
   e nome (sem salvar): a cor primária escolhida é aplicada a um mini-mock (ex.: botão
   + nome da instalação), refletindo como o painel ficará.

### Leva 2 — Serviços

6. **(AC6 — Master-detail)** A aba Serviços mostra **lista à esquerda** (com
   **"+ Novo serviço"**) e **formulário à direita**. A lista vem de `GET /services`;
   selecionar um item carrega o formulário. "+ Novo serviço" abre o formulário vazio.

7. **(AC7 — Form de serviço)** Campos **Nome** (obrigatório), **Duração** (minutos) e
   **Preço** (**opcional** — em branco = sem preço, DL-030). Salvar cria
   (`POST /services`) ou edita (`PATCH /services/:id`); a lista reflete a mudança.

8. **(AC8 — Vínculo secundário)** Abaixo dos campos principais, seção **secundária**
   (divisor + heading menor/muted) **"Profissionais que fazem este serviço"**: chips
   toggle dos usuários com `attends_clients` (`GET /users/attenders`), com a nota
   **"Opcional — em branco vale para toda a equipe."** Estado inicial vem de
   `GET /services/:id/professionals`; salvar usa `PUT /services/:id/professionals`.
   Visualmente **não compete** com nome/duração/preço.

## Fora de escopo

- Abas **Horários** e **Equipe** (levas 3/4) — entram desabilitadas ("em breve").
- **Upload** de logo (segue por **URL**, DL-034). 
- **Entrada mobile** para Configurações — pendência ligada ao escopo mobile.
- Qualquer mudança de **backend/contrato** (as APIs já existem).

## Tasks / Subtasks

- [x] **Task 0 — Infra de rede** — `"PUT"` adicionado ao union de método em `lib/api.ts`.
- [x] **Task 1 — Casca de Configurações (AC1/AC2)** — `pages/Configuracoes.tsx` +
  `components/ConfiguracoesTabs.tsx` (abas **route-driven** via `NavLink`, estilo do
  Segmented da Agenda — **sem** nova dependência de `@radix-ui/react-tabs`) + guard
  owner-only (redirect). Rotas aninhadas em `App.tsx`; `AppShell` → `/configuracoes`.
- [x] **Task 2 — Identidade visual (AC3/AC4/AC5)** — `ConfiguracoesIdentidade` refeito
  com DS; 5 presets terrosos + hex + swatch; prévia ao vivo (logo/nome + botão + chip
  "Hoje"). Contrato do teste existente preservado.
- [x] **Task 3 — Serviços (AC6/AC7/AC8)** — `pages/ConfiguracoesServicos.tsx`
  master-detail + form (preço opcional) + chips de vínculo (`/users/attenders` +
  `GET|PUT /services/:id/professionals`).
- [x] **Task 4 — Testes** — Vitest: casca (abas/guard, 2), Identidade (presets + 2
  existentes, 3), Serviços (lista/PATCH+PUT/POST, 3). **34/34** verdes; typecheck/lint/
  build verdes.
- [x] **Task 5 — Swagger/guard-rail** — **N/A**: sem novo contrato (endpoints já
  anotados). `ServicesController` já está em `TENANT_AWARE_CONTROLLERS`;
  `InstallationController` fica fora de propósito (companies não é tenant-aware).

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Completion Notes
- **Frontend puro**, backend intacto. Abas **route-driven** (`NavLink`) em vez de Radix
  Tabs — cada aba tem rota própria e a ativa reflete a URL; evita dependência nova e
  casa com o Segmented da Agenda.
- **Identidade:** presets terrosos (Terracota/Mostarda/Oliva/Argila/Café), prévia ao
  vivo repinta via estado local (sem salvar). Test de contrato (1.7) mantido verde.
- **Serviços:** `PUT /services/:id/professionals` só existia no backend; faltava `PUT`
  no cliente HTTP (`lib/api.ts`) — adicionado.
- Validação: web **34/34** (Vitest), typecheck/lint/build verdes. Visual não capturado
  aqui (rota protegida owner-only, sem backend semeado no ambiente) — reusa primitivos
  do DS já validados na 2.1/2.1.02.

### File List
**Novos**
- `apps/web/src/components/ConfiguracoesTabs.tsx`
- `apps/web/src/pages/Configuracoes.tsx` (+ `.test.tsx`)
- `apps/web/src/pages/ConfiguracoesServicos.tsx` (+ `.test.tsx`)

**Modificados**
- `apps/web/src/lib/api.ts` (método `PUT`)
- `apps/web/src/App.tsx` (rotas aninhadas de `/configuracoes`)
- `apps/web/src/components/AppShell.tsx` (nav → `/configuracoes`)
- `apps/web/src/pages/ConfiguracoesIdentidade.tsx` (+ `.test.tsx`) — restyle DS

## Decisões (resolvidas pelo Renato, 2026-07-13)

1. **Versionamento:** **2.1.03** — ajuste vinculado à 2.1, consistente com
   2.1.01/2.1.02. Uma spec, duas levas, um PR.
2. **5 presets de cor — tons terrosos** (feedback do Renato). Paleta escolhida
   (num único constante, fácil de ajustar):
   - Terracota `#B85C38`
   - Mostarda `#B07D1F`
   - Oliva `#6B7A3F`
   - Argila `#A15A4A`
   - Café `#6F4A34`
