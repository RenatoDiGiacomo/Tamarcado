# Story 2.1: Design System (shadcn/ui + Radix + Tailwind)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor,
I want uma base de UI de produção (shadcn/ui + Radix + Tailwind) com os tokens da Sally e a casca da grade de agenda,
so that todas as telas do núcleo vendável (Épico 3–5) sejam bonitas, acessíveis e consistentes, sem reinventar componentes.

## Acceptance Criteria

1. **(AC1 — Base configurada)** Dado o `apps/web`, quando shadcn/ui + Tailwind + Radix são configurados, então `pnpm --filter web run build/typecheck/lint/test` passam, o alias `@/` resolve, e o app existente (login/shell/perfil/config da 1.2/1.7) continua subindo e funcionando.

2. **(AC2 — Tokens da Sally como tema)** Dado o `design-system-spec.md` (Sally), quando configuro o tema do Tailwind/shadcn, então as cores/tipografia/raio usam **os tokens da Sally** (não os defaults do shadcn); o tema claro/escuro continua dirigido por `users.theme` via `[data-theme="dark"]` (mecanismo da 1.7, sem reescrever o toggle); e a **cor primária por salão** (1.7, `companies.primary_color`) continua aplicada em runtime e alimenta os componentes shadcn.

3. **(AC3 — Primitivos)** Dado o spec §3, quando implemento os primitivos, então existem `Button` (primary/secondary/ghost/danger), `Input`, `Select`, `Dialog` (Modal), `Card`, `PageLayout`, `EmptyState` (ícone + texto), `Toast` e `StatusChip` (5 status), tipados, testados (Vitest) e usando os tokens.

4. **(AC4 — AgendaGrid)** Dado a Agenda—Dia da Sally, quando implemento o `AgendaGrid` (casca dia/semana), então segue: borda esquerda + `StatusChip` por status, **altura do bloco ∝ duração**, ícones de origem (lápis=manual, balão=whatsapp), "Não atribuído" em cinza itálico, toggle `[Dia|Semana]` + "Mês — em breve", filtro de origem. É **pura apresentação** (props do §4.6 do spec; sem fetch/regra).

5. **(AC5 — Login refeito)** Dado a tela de Login da Sally, quando refaço o Login com a nova base, então a versão inline crua sai e o Login usa `Card`/`Input`/`Button`, mantendo o fluxo de autenticação (`AuthContext.login`) e os testes verdes.

## Pré-requisitos e contexto (no `main`)

- **Web atual (1.2 + 1.7):** React 19 + Vite + TS, **sem** CSS framework. `src/index.css` = tokens de tema da 1.7 (`--bg/--fg/--surface/--border/--muted/--primary`, claro + `[data-theme="dark"]`; `body`/`a` usam as vars). `main.tsx` importa `index.css`. `components/AppShell.tsx` (branding + nav + efeito que aplica `data-theme` e `--primary` — estilos inline). `auth/AuthContext.tsx` (`setTheme` → `PATCH /users/me`; guarda `user.theme`). `pages/Login.tsx` (form inline), `pages/Perfil.tsx`, `pages/ConfiguracoesIdentidade.tsx` (inline). `lib/api.ts`, `lib/useInstallation.ts`. Testes Vitest (Login, AppShell, App, AuthContext, Perfil, ConfiguracoesIdentidade).
- **tsconfig:** `moduleResolution: Bundler`, `jsx: react-jsx`, **sem** `paths` (o alias `@/` precisa ser adicionado — tsconfig `paths` + `vite.resolve.alias`).
- **Referência de design:** `_bmad-output/planning-artifacts/design-system/design-system-spec.md` (Sally) — tokens (§2), primitivos (§3), `AgendaGrid` (§4) + contrato de props (§4.6), inventário de telas (§6). **Fonte de verdade visual.** Figma: https://www.figma.com/design/MwcRbRwteTxofX7MRt966J (Agenda—Dia e Login aprovados).
- **Escopo backend:** nenhum — story só frontend (`apps/web`). Guard-rail 1.3.01 e API intactos.
- Fluxo Git: branch `story/2.1-design-system`; commits pequenos com prefixo (`feat`/`chore`/`docs`/`test`); PR no fim (merge é do Renato). Documentar o implementado no `design-system-spec.md`.

## Tasks / Subtasks

> Frontend: cada componente com teste (Vitest). Rode `pnpm --filter web run typecheck/lint/test` e `pnpm run build`. Decisões aprovadas (ver seção "Decisões aprovadas" e DL-037): HSL, restyle AppShell, sonner, new-york+neutral, AgendaGrid casca dia+semana, lucide-react.

- [x] **Task 1 — Setup Tailwind + shadcn + alias (AC1)**
  - [x] Add devDeps: `tailwindcss postcss autoprefixer`; deps: `class-variance-authority clsx tailwind-merge lucide-react` + Radix por componente (via shadcn add).
  - [x] `tailwind.config.ts` (content: `./index.html`, `./src/**/*.{ts,tsx}`; `darkMode: ['selector','[data-theme="dark"]']` — reaproveita o mecanismo da 1.7), `postcss.config.js`.
  - [x] Alias `@/` → `./src`: `tsconfig` (`baseUrl`+`paths`) e `vite.config.ts` (`resolve.alias`, com `@types/node`).
  - [x] `components.json` do shadcn (estilo/base — DECISÃO 4); `lib/utils.ts` (`cn`).
  - [x] RED→GREEN: build/typecheck/lint/test verdes; app existente ainda sobe.

- [x] **Task 2 — Tokens da Sally como tema (AC2)** — *depende da DECISÃO 1*
  - [x] Evoluir `index.css` → `globals.css` (Tailwind `@tailwind base/components/utilities` + as variáveis de tema **no padrão que o shadcn consome**), mantendo `[data-theme="dark"]` e a var de `--primary` por salão.
  - [x] Mapear os tokens da Sally (§2: neutros, acento, **status**, raio, tipografia) para `tailwind.config` (`theme.extend.colors/borderRadius/fontFamily`) e para as variáveis shadcn (`--background/--foreground/--primary/--border/--ring/--card/--muted...`).
  - [x] Ajustar o efeito de tema/cor primária da 1.7 (`AppShell`/theme applier) conforme a DECISÃO 1 (HSL vs. hex direto).
  - [x] RED→GREEN: alternar tema (Perfil) troca claro/escuro; a cor primária do salão aparece nos componentes; teste do provider de tema.

- [x] **Task 3 — Primitivos (AC3)**
  - [x] `Button` (variantes primary/secondary/ghost/danger via `cva`), `Input`, `Select` (Radix), `Dialog` (Modal), `Card` — via shadcn, com os tokens.
  - [x] Custom: `StatusChip` (5 status: pending/confirmed/done/cancelled/noshow — cor + rótulo, "cancelled" com riscado), `EmptyState` (ícone lucide + título + texto + ação), `PageLayout` (título + ação + conteúdo), `Toast` (DECISÃO 3).
  - [x] RED→GREEN: teste de cada componente (render, variantes, acessibilidade básica — roles/labels do Radix).

- [x] **Task 4 — `AgendaGrid` (AC4)**
  - [x] `components/agenda/AgendaGrid.tsx` seguindo o §4 do spec (dia + semana). Props do §4.6 (`view/date/businessHours/appointments/onSelect/onNew`). Pura apresentação.
  - [x] Bloco: borda esquerda por status + `StatusChip`; **altura ∝ duração** (posição/altura por `start`/`end`); ícone de origem (lucide `Pencil`=manual, `MessageCircle`=whatsapp); "Não atribuído" cinza itálico.
  - [x] Header: `‹ data ›`, toggle `[Dia|Semana]`, "Mês — em breve" (desabilitado), filtro `[Todos][WhatsApp][Manual]`.
  - [x] Página de demonstração com dados mock (para visualizar/rota interna) — o preenchimento com dados reais é a Story 3.2.
  - [x] RED→GREEN: teste com mock — blocos posicionados por horário, status/origem corretos, toggle, "Mês" desabilitado.

- [x] **Task 5 — Login refeito (AC5)** e shell (DECISÃO 2)
  - [x] `pages/Login.tsx` refeito com `Card`/`Input`/`Button` no padrão da Sally; mantém `AuthContext.login` e navegação.
  - [x] `AppShell` restyle para Tailwind (DECISÃO 2) — mantém branding/nav/tema/rotas.
  - [x] Atualizar testes afetados (Login; AppShell se restyle).

- [x] **Task 6 — Validação final + doc (AC1–AC5)**
  - [x] `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde (web + api). App sobe; login, tema, branding, `/perfil`, `/configuracoes/identidade` seguem funcionando.
  - [x] Documentar no `design-system-spec.md` o que foi implementado (nomes reais dos componentes, como os tokens viraram config, o mecanismo de tema).

## Dev Notes

### Integração shadcn/Tailwind × CSS atual (responde tua pergunta 1)

- **Tailwind preflight (reset base):** ao adicionar o `@tailwind base`, o reset zera margens/estilos de heading/list. Login será refeito; `AppShell` será restyled (DECISÃO 2). `Perfil`/`ConfiguracoesIdentidade` (inline) continuam funcionando (estilo inline vence) — restyle delas fica para o Épico 3 (não é escopo da 2.1). Validar que não quebram visualmente de forma inaceitável.
- **Dark mode sem reescrever o toggle:** `darkMode: ['selector','[data-theme="dark"]']` faz o Tailwind reagir ao **mesmo** `data-theme` que a 1.7 já seta (`AppShell` efeito + `AuthContext.setTheme`). Zero mudança no mecanismo de tema — só na config.
- **`globals.css`** substitui o `index.css`: contém as diretivas do Tailwind + as variáveis de tema (claro em `:root`, escuro em `[data-theme="dark"]`). `body`/`a` migram para `@layer base`.

### Aplicando os tokens da Sally (responde tua pergunta 3)

- shadcn nomeia cores via variáveis (`--background/--foreground/--primary/--primary-foreground/--card/--border/--ring/--muted/--muted-foreground/--radius...`) e o Tailwind referencia com `hsl(var(--token))`.
- Os tokens da Sally são **hex** e a **cor primária por salão** é injetada em runtime (1.7 seta `--primary` = hex de `companies.primary_color`). **DECISÃO 1** define como casar isso (HSL idiomático vs. hex direto).
- Status (§2.2): tokens dedicados (`--status-*` + fundos tênues) → utilitários/`StatusChip` via `cva`.

### Retrabalho no login/shell existente (responde tua pergunta 2)

- **Login:** refeito (pedido) — sai a versão inline; entra `Card`+`Input`+`Button`. Mantém `AuthContext.login` + navegação; **teste do Login atualizado**.
- **AppShell:** restyle para Tailwind (DECISÃO 2, recomendado — é a casca de tudo). Mantém branding (`useInstallation`), nav (**sem "Pendentes"** — manual-first, DL-036), efeito de tema/cor, `Outlet`. Teste do AppShell atualizado se mudar markup.
- **AuthContext / useInstallation / api.ts / rotas:** sem mudança de lógica (só a var de primary pode mudar de formato — DECISÃO 1).
- **Perfil / ConfiguracoesIdentidade:** fora do escopo da 2.1; seguem funcionando; restyle no Épico 3.

### File structure

- `apps/web/tailwind.config.ts`, `postcss.config.js`, `src/globals.css` (ex-`index.css`), `src/lib/utils.ts`, `components.json`
- `src/components/ui/*` (shadcn: button, input, select, dialog, card, sonner/toast…) + `src/components/StatusChip.tsx`, `EmptyState.tsx`, `PageLayout.tsx`
- `src/components/agenda/AgendaGrid.tsx` (+ tipos do §4.6) + página de demo
- `pages/Login.tsx` (refeito), `components/AppShell.tsx` (restyle)
- `tsconfig.json` (`paths`), `vite.config.ts` (`resolve.alias`), `main.tsx` (import `globals.css`)

### Testing

- Vitest/jsdom já configurado. Classes Tailwind são `className` — testes seguem asseverando roles/labels/texto (não estilos). Radix expõe roles acessíveis (Dialog, Select) — testar por role.
- Atualizar: `Login.test`, `AppShell.test` (se restyle). Novos: testes dos primitivos e do `AgendaGrid` (posição por horário, status/origem, toggle).
- **Nota (rede):** o `shadcn` CLI (`npx shadcn@latest init/add`) baixa componentes da internet — rodar com rede disponível (sandbox desabilitado). Alternativa: adicionar os componentes manualmente.

### References

- [design-system-spec.md] (Sally) — §2 tokens, §3 primitivos, §4 `AgendaGrid` + §4.6 props, §6 inventário. **Fonte visual.**
- [Figma] Agenda—Dia e Login aprovados — https://www.figma.com/design/MwcRbRwteTxofX7MRt966J
- [apps/web/src/index.css] tokens 1.7 · [AppShell.tsx / AuthContext.tsx] tema + branding · [epics.md Épico 2 / Story 2.1] escopo · [.decision-log.md DL-036] grade no Design System.
- [shadcn/ui docs] Vite + Tailwind setup, theming por CSS variables, dark mode por selector.

### Decisões aprovadas (Renato, 2026-07-06 — ver DL-037)

1. **Pipeline de tokens: HSL** (opção a). Variáveis como canais HSL; Tailwind usa `hsl(var(--token))`. O applier da 1.7 converte o hex do salão (`companies.primary_color`) para canais HSL em runtime (helper hex→HSL) — habilita hover/variações da cor por salão. Tokens da Sally convertidos para HSL na config.
2. **Restyle do `AppShell` na 2.1: sim** (consistência da moldura).
3. **Toast: `sonner`.**
4. **Estilo shadcn: `new-york`, base `neutral` sobrescrita pelos tokens da Sally** (identidade Tamarcado, não template genérico).
5. **`AgendaGrid` na 2.1:** casca dia+semana + demo com mock; dados reais na Story 3.2.
6. **`lucide-react`** para ícones (origem Pencil/MessageCircle + EmptyState).

**Reforço do Renato:** aplicar os **tokens da Sally de verdade** (cores/tipografia/raio) — não os defaults do shadcn. Preservar o tema claro/escuro (`users.theme`) e a cor primária por salão (1.7).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia)

### Debug Log References

- `hexToHslTriplet("#6C63FF")` → `"243 100% 69%"` (Math.round de 243.46); ajustado o default do `globals.css` de 244→243.
- shadcn `sonner.tsx` vinha com `next-themes` (mecanismo errado); reescrito para ler `document.documentElement.dataset.theme` (1.7).
- Modificadores de opacidade do Tailwind em cores por CSS var exigem o placeholder `<alpha-value>` → `hsl(var(--x) / <alpha-value>)`.
- `App.test` espera `heading` "Tamarcado" no Login; `CardTitle` do shadcn é `<div>` → usei `<h1>` real.

### Completion Notes List

- **AC1** Base shadcn/ui (new-york) + Tailwind 3.4 + Radix + alias `@/`; app existente segue subindo. Build/typecheck/lint/test verdes.
- **AC2** Tokens da Sally aplicados como CSS vars em canais HSL (não os defaults do shadcn); claro/escuro por `data-theme` (users.theme); cor primária por salão via `hexToHslTriplet` em runtime.
- **AC3** Primitivos: `Button/Input/Select/Dialog/Card/Label` (shadcn) + `StatusChip/EmptyState/PageLayout` + `Toaster` (sonner), tipados e testados.
- **AC4** `AgendaGrid` casca dia/semana (borda+chip, altura ∝ duração, ícones de origem, "Não atribuído" itálico, toggle, "Mês — em breve", filtro); pura apresentação; mock + demo em `/demo`.
- **AC5** Login refeito (Card/Input/Button) preservando `AuthContext.login`; AppShell migrado para Tailwind, sem "Pendentes" (DL-036).
- Validação: web **27/27** (Vitest), typecheck/lint/build verdes. §8 do `design-system-spec.md` documenta spec→arquivos.

### File List

**Novos**
- `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`, `apps/web/components.json`
- `apps/web/src/globals.css`, `apps/web/src/lib/utils.ts`, `apps/web/src/lib/theme.ts` (+ `theme.test.ts`)
- `apps/web/src/components/ui/{button,input,select,dialog,card,label,sonner}.tsx`
- `apps/web/src/components/{StatusChip,EmptyState,PageLayout}.tsx` (+ `.test.tsx`)
- `apps/web/src/components/agenda/{AgendaGrid.tsx,mock.ts,AgendaGrid.test.tsx}`
- `apps/web/src/pages/DesignSystemDemo.tsx`

**Modificados**
- `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- `apps/web/src/pages/Login.tsx`, `apps/web/src/components/AppShell.tsx`
- `apps/web/package.json` (deps), `_bmad-output/planning-artifacts/design-system/design-system-spec.md` (§8)
- `_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/.decision-log.md` (DL-037)

**Removidos**
- `apps/web/src/index.css` (→ `globals.css`)
