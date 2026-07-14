# Ajuste 2.1.02: Restyle da tela de Perfil

Status: review

> **Versionamento (fora de escopo planejado):** ajuste `2.1.NN` vinculado à história
> de origem **2.1 — Design System** (`2-1-design-system.md`). A 2.1 deixou `Perfil`
> (crua, herdada da 1.2/1.7) fora do escopo. Este ajuste aplica os primitivos do
> design system à tela. Frontend puro (`apps/web`), sem backend/contrato.

## Origem

Plano das telas de Configurações/Perfil (2026-07-07). O Perfil é pequeno (nome,
e-mail, toggle de tema) e **não** faz parte da seção Configurações (owner-only) — o
tema é preferência **individual** (UX-DR15). Por isso vira um restyle isolado, sem
depender do épico "Painel de Configurações" nem do design da Sally.

## Acceptance Criteria

1. **(AC1 — Perfil restilado)** Dado a tela de Perfil, quando ela é renderizada, então
   usa `PageLayout` + `Card` + `Button` do design system (não markup inline cru),
   exibindo nome e e-mail do usuário num card e o controle de tema como uma linha
   "Aparência" com o estado atual e um botão de alternância.

2. **(AC2 — Tema preservado)** O mecanismo de tema da 1.7 permanece intacto:
   `setTheme` (`AuthContext`) é chamado com `"dark"`/`"light"`; os textos
   "Tema atual: Claro/Escuro" e "Alternar para claro/escuro" são mantidos (contratos
   dos testes existentes), agora com ícone `Sun`/`Moon` (lucide). Testes verdes.

## Fora de escopo

- Seção **Configurações** (Serviços/Horários/Equipe/Identidade) — épico dedicado à parte.
- **Entrada mobile** para Perfil/Configurações — pendência ligada ao escopo mobile.

## Tasks / Subtasks

- [x] **Task 1 — Restyle `pages/Perfil.tsx` (AC1/AC2)** — `PageLayout`/`Card`/`Button`,
  ícone de tema; preserva strings e `setTheme`.
- [x] **Task 2 — Validação** — `pnpm --filter web run typecheck/lint/test` e `build`
  verdes; testes de Perfil (2) intactos sem alteração de asserções.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Completion Notes

- **AC1** `Perfil` refeito com `PageLayout` + `Card` (nome no `CardTitle`, e-mail no
  `CardDescription`) + linha "Aparência" com `Button` `secondary`.
- **AC2** `setTheme` e os textos preservados; ícone `Sun`/`Moon`. Sem API nova.
- Validação: web **28/28** (Vitest), typecheck/lint/build verdes. Visual não capturado
  aqui (rota protegida, sem backend semeado no ambiente) — reusa primitivos já
  validados nos screenshots da 2.1.

### File List

**Modificados**
- `apps/web/src/pages/Perfil.tsx`
- `_bmad-output/implementation-artifacts/2-1-02-restyle-perfil.md` (novo — esta spec)
