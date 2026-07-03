# Design System — Tamarcado (Story 2.1)

Status: draft (proposta da Sally, para revisão do Renato antes da implementação)
Data: 2026-07-03
Contexto: Épico 2 (Design System) — base de UI para as telas full-stack dos Épicos 3–5. Formaliza os tokens iniciados na Story 1.7 e entrega a casca da grade de agenda (`AgendaGrid`, DL-036).

> Doc vivo — pode ser alterado na revisão. Fonte de verdade do visual; a Amelia implementa a partir daqui.

---

## 1. Direção visual

Palavras-guia: **calmo, confiável, respirável**. O painel deve parecer a própria profissional atendendo — organizado, caloroso, nunca robótico (ux-spec.md §1).

- Cantos arredondados, espaçamento generoso, tipografia limpa (`system-ui`).
- **Um único acento** — a cor primária do salão (`--primary`, entregue pela 1.7). Pinta ação (botões, toggle ativo, FAB, "hoje"). Não compete com as cores de status.
- **Cores de status são semânticas e fixas** (não mudam por salão). A recepcionista aprende uma vez.
- **Nunca cor sozinha:** todo status = cor **+ rótulo em texto** (acessibilidade / leitura de relance).
- **Foco de teclado sempre visível** (anel de 2px na cor primária).

## 2. Tokens

Evolução do `apps/web/src/index.css` da Story 1.7 (que já tem claro/escuro via `data-theme`).

### 2.1 Neutros (já existem) e acento
`--bg`, `--fg`, `--surface`, `--border`, `--muted` (claro/escuro) · `--primary` (cor do salão, definida em runtime a partir de `companies.primary_color`).

### 2.2 Status (novos) — cor sólida (chip/borda) + fundo tênue (card)

| Status | Token | Cor sólida | Fundo do card | Rótulo | Observação |
|---|---|---|---|---|---|
| Pendente | `--status-pending` | Âmbar `#F59E0B` | âmbar ~8% | "Pendente" | só usado com o bot (Épico 6) |
| Confirmado | `--status-confirmed` | Verde `#16A34A` | verde ~8% | "Confirmado" | |
| Concluído | `--status-done` | Cinza `#6B7280` | cinza ~6% | "Concluído" | |
| Cancelado | `--status-cancelled` | Vermelho `#DC2626` | vermelho ~6% | "Cancelado" | texto **riscado** |
| Não compareceu | `--status-noshow` | Cinza-escuro `#374151` | cinza-escuro ~8% | "Não compareceu" | |

> No manual-first a agenda só produz confirmado/concluído/cancelado/não compareceu. O token "pendente" nasce pronto para o Épico 6.

### 2.3 Espaçamento, raio, tipografia, elevação, foco

- **Espaçamento** (escala): `4 · 8 · 12 · 16 · 24 · 32` (px).
- **Raio:** `6px` controles · `10px` cards · `14px` modais.
- **Tipografia:** `system-ui`. Escala: `12 (legenda) · 14 (corpo) · 16 (ênfase) · 20 (título de seção) · 28 (título de página)`. Peso 400/600.
- **Elevação (sombra):** sutil, só em Modal e FAB. Cards usam borda, não sombra.
- **Foco:** anel `2px var(--primary)` + offset. Nunca remover outline sem substituir.

## 3. Primitivos

Cada componente: tipado (TS), testado (Vitest), usando **só** tokens (sem cor hardcoded), respeitando tema claro/escuro.

| Componente | Papel | Variantes / estados |
|---|---|---|
| `Button` | ação | `primary` (acento), `secondary` (contorno), `ghost` (texto), `danger` (vermelho); hover / disabled / loading |
| `Input` | texto | label acima, erro abaixo, foco com anel |
| `Select` | escolha | dropdown; mesmo padrão de label/erro |
| `Modal` | diálogo | overlay + título + corpo + ações à direita (`[Voltar] [Ação]`) — base dos modais de cancelamento e "+ Nova cliente" |
| `Card` | contêiner | borda + raio; sem sombra |
| `PageLayout` | moldura de tela | título + ação no topo + área de conteúdo |
| `StatusChip` | status | cor sólida + rótulo (nunca só cor) |
| `ContextMenu` | menu `[▾]` | ações contextuais do card de agendamento |
| `EmptyState` | estado vazio (UX-DR17) | ícone/ilustração + texto + ação |
| `Toast` | feedback (UX-DR19) | canto, some sozinho, confirma a ação em texto |

## 4. `AgendaGrid` — componente central (DL-036)

A "casca" da grade nasce aqui pronta. A Story 3.2 apenas a **popula** com dados (recebe `appointments[]` + faixa de horário por props; **sem** fetch nem regra de negócio).

### 4.1 Header (comum às visões)

```
┌──────────────────────────────────────────────────────────┐
│  ‹  Ter, 17/06  ›     [ Dia │ Semana ]   ( Mês — em breve)│
│  [ Todas as profissionais ▾ ]      [Todos][WhatsApp][Manual]│
└──────────────────────────────────────────────────────────┘
```
- Toggle **Dia/Semana** ativo agora; **Mês desabilitado ("em breve")** — é o `3.2.NN`.
- Filtro de profissional só para dono/gestão (FR-D2). Filtro de origem `[Todos][WhatsApp][Manual]` (FR-K5).

### 4.2 Visão Dia — eixo de horas; blocos com altura ∝ duração

```
        ┌──────────────────────────────────────────────┐
 08:00  │                                              │
        │ ┃ ✎ Maria das Dores            Confirmado    │  ← borda verde
 09:00  │ ┃ Coloração · 09:00–12:00 · Fernanda   [▾]   │
 10:00  │ ┃                                            │
        │──────────────────────────────────────────────│
 11:00  │ ┃ 💬 Joana Silva                Pendente     │  ← borda âmbar (Épico 6)
        │ ┃ Corte · 11:00–12:00 · Não atribuído  [▾]   │
 12:00  │                                              │
        └──────────────────────────────────────────────┘
                                          ( + Novo agendamento )  ← FAB
```

### 4.3 Visão Semana — 7 colunas (seg–dom); cards compactos; "hoje" com realce

```
        Seg 16   Ter 17   Qua 18   Qui 19   Sex 20   Sáb 21   Dom 22
 08:00                    ┌──────┐
 09:00  ┌──────┐          │✎Maria│  ┌──────┐
 10:00  │💬Ana │          │Color.│  │✎Rita │
 11:00  └──────┘          └──────┘  └──────┘
```

### 4.4 Card de agendamento (anatomia)

- Borda esquerda na cor do status + fundo tênue do status.
- Ícone de origem à esquerda do nome: 💬 balão (`whatsapp`) / ✎ lápis (`manual`) — FR-K4.
- Linha 1: `[origem] Nome da cliente ................ [StatusChip]`
- Linha 2: `Serviço · HH:MM–HH:MM · Profissional` (ou **"Não atribuído"** em itálico cinza quando `professional_id` nulo).
- `[▾]` → `ContextMenu`: Ver detalhes / Cancelar / Registrar pagamento / Marcar não compareceu (as ações de bot — confirmar/recusar — só aparecem no Épico 6).

### 4.5 Estados e responsivo

- **Vazio (UX-DR17):** "Nenhum agendamento neste dia" + botão "Novo agendamento".
- **Desktop:** grade cheia (sidebar da 1.7 à esquerda).
- **Mobile (<768px):** **Dia** por padrão; semana rola horizontalmente; FAB vira item do "+" no rodapé (UX-DR7, já na 1.7).

### 4.6 Contrato do componente (reforça DL-036)

```ts
type AgendaView = "dia" | "semana";
interface AgendaAppointment {
  id: string; clientName: string; serviceName: string;
  start: string; end: string;                 // "HH:MM"
  status: "pending" | "confirmed" | "done" | "cancelled" | "noshow";
  origin: "whatsapp" | "manual";
  professionalName: string | null;            // null → "Não atribuído"
}
interface AgendaGridProps {
  view: AgendaView;
  date: string;                               // dia de referência
  businessHours: { start: string; end: string };
  appointments: AgendaAppointment[];
  onSelect?(id: string): void;
  onNew?(): void;                             // FAB
}
```
`AgendaGrid` é **pura apresentação** — sem `fetch`, sem regra. Design System é dono da aparência; a Story 3.2 é dona dos dados.

## 5. Decisões em aberto (para o Renato)

1. **Estilo do status no card:** borda esquerda + chip (proposto, discreto) vs. card inteiro tingido (mais chamativo). *(Recomendo borda + chip.)*
2. **Densidade da agenda:** altura ∝ duração (rico, mostra buracos) vs. lista compacta por horário (cabe mais). *(Recomendo proporcional — impressiona na demo.)*
3. **Mês:** desabilitado "em breve" (honesto) vs. escondido até `3.2.NN`. *(Recomendo "em breve".)*
4. **Estados vazios:** ilustração leve (charme, mais trabalho) vs. ícone simples + texto (rápido). *(Recomendo ícone + texto no MVP.)*

## 6. Referências

- [ux-spec.md §4.2 Tela: Agenda] — status/cores, card, dia/semana/mês, FAB, filtro de origem.
- [ux-spec.md §1] — tom "parece a própria profissional".
- [epics.md — Épico 2 / Story 2.1] — escopo (tokens + primitivos + `AgendaGrid`).
- [.decision-log.md DL-036] — grade no Design System; DL-034/1.7 — tokens de tema iniciais.
- [apps/web/src/index.css] — tokens de tema da Story 1.7 (ponto de partida).
