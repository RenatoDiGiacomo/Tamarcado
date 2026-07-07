# Ajuste 2.1.01: Ajustes de UX pós-2.1 (Login, Agenda, Menu)

Status: review

> **Versionamento (fora de escopo planejado):** ajuste `2.1.NN` vinculado à história
> de origem **2.1 — Design System** (`2-1-design-system.md`). Refinamentos de UX
> percebidos na revisão visual após o merge da 2.1; não altera contrato de dados
> nem backend. Frontend puro (`apps/web`).

## Origem

Revisão visual do Renato após mergear a 2.1 no `main`. O design system ficou bom;
estes são ajustes finos de usabilidade sobre a casca já entregue.

## Acceptance Criteria

1. **(AC1 — Login: mostrar/ocultar senha)** Dado o campo de senha do Login, quando
   clico no ícone de olho (lucide `Eye`/`EyeOff`) à direita do campo, então a senha
   digitada alterna entre oculta e visível; o botão tem `aria-label` ("Mostrar
   senha"/"Ocultar senha") e `aria-pressed`, sem quebrar o fluxo de `AuthContext.login`.

2. **(AC2 — Agenda: respiro no topo)** Dado o `AgendaGrid`, quando o primeiro
   agendamento começa no início do expediente, então há um respiro (`GRID_PAD_TOP`)
   acima da primeira linha para o bloco não colar no topo da grade — nas visões dia e
   semana, com rótulos de hora, linhas e blocos alinhados.

3. **(AC3 — Agenda: scroll com cabeçalho fixo)** Dado um dia lotado (validado com
   mock de 12 agendamentos, 08h–20h), quando a grade excede a altura disponível, então
   o corpo da grade rola verticalmente (`max-h-[70vh] overflow-y-auto`) enquanto o
   cabeçalho de controles (data ‹ ›, toggle Dia/Semana, "Mês — em breve", filtro de
   origem) permanece fixo acima do corpo rolável. Na visão semana, a linha de dias
   (Seg–Dom) é `sticky` no topo do corpo rolável.

4. **(AC4 — Menu lateral: ícones)** Dado a navegação do `AppShell`, quando os itens
   são renderizados, então cada um exibe um ícone lucide antes do rótulo — Agenda
   (`CalendarDays`), Clientes (`Users`), Pagamentos (`CreditCard`), Configurações
   (`Settings`) — na sidebar desktop e na barra inferior mobile.

## Fora de escopo (decisão do Renato — ver "Pergunta 5")

- Restyle das telas **Perfil** e **Configurações → Identidade** (ainda cruas, inline,
  herdadas da 1.7). Ver seção abaixo — proposta de tratar num ajuste dedicado `2.1.02`.

## Pergunta 5 — Quando entra o restyle de Perfil e Configurações?

**Achado:** a spec da 2.1 (§ Dev Notes) diz que o restyle dessas telas "fica para o
Épico 3". Ao conferir o `epics.md`, as stories do **Épico 3 (3.1–3.4) são todas de
agendamento** (base de dados, agenda, agendamento manual, cancelamento) — **nenhuma**
restila Perfil/Configurações. Ou seja: hoje **não há story concreta** que cubra o
embelezamento dessas duas telas. É exatamente o risco que o Renato levantou ("telas
feias soltas no meio do sistema bonito").

**Recomendação:** criar um ajuste dedicado **`2.1.02 — restyle Perfil + Configurações`**
(mesma origem 2.1, mesmo padrão X.Y.NN), aplicando `PageLayout`/`Card`/`Input`/`Button`/
`Label` do design system às duas telas existentes. São telas pequenas e já funcionais
(só trocam o markup cru por primitivos), então é um ajuste barato e fecha o gap visual
antes do Épico 3. **Aguarda confirmação do Renato** para eu abrir a spec/branch `2.1.02`.

## Tasks / Subtasks

- [x] **Task 1 — Login: toggle de senha (AC1)** — `pages/Login.tsx` + teste.
- [x] **Task 2 — AgendaGrid: respiro no topo (AC2)** — `GRID_PAD_TOP` aplicado a
  gutter/linhas/blocos (dia e semana).
- [x] **Task 3 — AgendaGrid: scroll + cabeçalho fixo (AC3)** — corpo rolável
  `max-h-[70vh]`; controles fora do scroll; linha de dias `sticky` na semana. Mock
  `MOCK_APPOINTMENTS_FULL_DAY` (12×, 08–20h) + seção na demo `/demo`.
- [x] **Task 4 — AppShell: ícones lucide (AC4)** — sidebar + barra inferior.
- [x] **Task 5 — Validação** — `pnpm --filter web run typecheck/lint/test` e `build`
  verdes; revisão visual por screenshots da `/demo` e `/login`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Completion Notes

- **AC1** Ícone de olho no campo de senha (Eye/EyeOff), acessível; teste do toggle.
- **AC2** `GRID_PAD_TOP = 12px` de respiro acima do 1º horário (dia e semana).
- **AC3** Corpo da grade rolável (`max-h-[70vh]`) com cabeçalho de controles fixo;
  linha de dias `sticky` na semana. Validado com dia cheio (08–20h) — scroll confirmado
  por screenshot (corpo clipa, cabeçalho permanece).
- **AC4** Ícones lucide nos itens de menu (desktop + mobile).
- Validação: web **28/28** (Vitest), typecheck/lint/build verdes.

### File List

**Modificados**
- `apps/web/src/pages/Login.tsx` (+ `Login.test.tsx`)
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/agenda/AgendaGrid.tsx`
- `apps/web/src/components/agenda/mock.ts`
- `apps/web/src/pages/DesignSystemDemo.tsx`
- `_bmad-output/implementation-artifacts/2-1-01-ajustes-ux.md` (novo — esta spec)
