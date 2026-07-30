# UX — Painel no celular (Épico 7, Stories 7.2 / 7.3)

**Autora:** Sally (UX) · **Data:** 2026-07-30 · **Status:** spec para implementação (handoff Amelia)
**Escopo:** o **mesmo** `apps/web` no celular (≤ 412px), com **cara de app nativo** e **usável com uma mão**. Não é app separado (**DL-051**): é responsividade + PWA do painel existente, com **paridade total de ações** com o desktop.

> **Regra-mãe deste documento:** todo padrão mobile abaixo é uma **camada responsiva** sobre os componentes atuais. Nada aqui pode exigir componente que **quebre o desktop** nem biblioteca nova — só tokens da Sally + shadcn/Radix já presentes. Onde um componente muda de forma no celular, ele **mantém a forma de desktop em ≥ 768px** (breakpoint `md`).

---

## 1. Princípios

1. **Conteúdo primeiro.** A agenda aparece com o mínimo de cromo acima dela. Controles secundários viram gestos/sheets, não barras fixas.
2. **Polegar manda.** Ação primária de cada tela mora na **faixa inferior** (thumb zone). Alvos de toque ≥ 44px. Respeitar `env(safe-area-inset-bottom)`.
3. **Um app só.** Presença nativa por comportamento (sheets, tab bar, transições), não por chrome pesado. Desktop intocado.
4. **Paridade (DL-051).** Tudo que o desktop faz — confirmar, recusar, criar, cancelar, remarcar, atribuir profissional — se faz no celular, nas mesmas telas.

---

## 2. Componentes — reutilizados e o 1 novo

| Componente | Origem | Uso mobile |
|---|---|---|
| **AppBar enxuta** | restyle do header mobile do `AppShell` | topo slim: título da tela + avatar |
| **Tab bar + FAB** | `AppShell` (nav inferior) | navegação + 1 ação de criar |
| **Bottom Sheet** | **novo `ui/sheet.tsx`**, sobre `@radix-ui/react-dialog` (já é dependência — mesma primitiva do `Dialog`) | todas as ações do celular |
| **Dialog** | `ui/dialog.tsx` | **permanece** no desktop; ver §3 |
| **Segmented** (Dia/Semana) | estilo já usado na `AgendaGrid` | período |
| Select, Button, Input, Card, Label | shadcn existentes | formulários dentro dos sheets |
| **Toast** | `sonner` (já instalado) | feedback de mutação |
| Avatar (iniciais) | Button + tokens, sem lib | identidade no topo |

> **O único componente novo** é o **Bottom Sheet** — e ele NÃO é uma lib: é um wrapper do `@radix-ui/react-dialog` que já usamos no `Dialog`. Ver §3 para como ele é o **mesmo** componente do desktop, só mudando a apresentação por breakpoint.

---

## 3. Bottom Sheet — o padrão de ação do celular (resolve #3)

**Decisão:** no celular, **modais viram bottom sheets** (deslizam de baixo). No desktop, o **mesmo** componente renderiza como o `Dialog` centralizado de hoje. Isso se faz com **um** componente responsivo (`ActionSheet`) que troca posição/animação em `md:` — sem duplicar telas e sem quebrar o desktop.

```
Celular (≤767px)                     Desktop (≥768px)
┌───────────────────────────┐        (inalterado — Dialog central)
│                           │        ┌───────────────┐
│      (conteúdo atrás,     │        │   ▢ Título    │
│       escurecido)         │        │   ...conteúdo │
│                           │        │   [ Ação ]    │
├───────────────────────────┤        └───────────────┘
│  ══  (alça / grabber)     │ ← 90vh máx.
│  Título do sheet          │
│  ─────────────────────    │
│  conteúdo rolável         │
│  ...                      │
│                           │
│ ┌───────────────────────┐ │
│ │      Ação primária    │ │ ← sticky no rodapé (thumb zone)
│ └───────────────────────┘ │
└───────────────────────────┘  ↑ safe-area-inset-bottom
```

**Comportamento (mobile):**
- Entra deslizando de baixo; sai por **swipe-down**, tap no scrim, botão voltar do Android, ou `Esc`.
- **Alça (grabber)** no topo indica “arraste para fechar”.
- Cantos **superiores arredondados** (`--radius`), largura total, **altura máx. ~90vh**, conteúdo **rola dentro** do sheet (o fundo não rola).
- **Ação primária** = botão **largura total, fixo no rodapé** do sheet, acima da safe-area. Ações destrutivas (Cancelar/Recusar) em `destructive`/`outline`, nunca como primária acidental.
- Um sheet por vez. Fluxos com passo extra (ex.: Recusar → motivo) **empurram** um segundo painel dentro do mesmo sheet (transição lateral), não abrem outro sheet por cima.
- Respeitar `prefers-reduced-motion` (troca o slide por fade).

**Onde se aplica:** detalhe do agendamento, confirmar, recusar (motivo), novo/editar agendamento, cancelar (motivo), registrar pagamento (quando “Financeiro” voltar).

---

## 4. Casca do app — AppBar + Tab bar (resolve #1, #2, #5)

### 4.1 AppBar enxuta (topo)

**Problema hoje:** “Salão Teste | Dono Teste | Sair” toma a faixa toda com info de baixo uso; nome e Sair fixos no topo.

**Proposta:**
```
┌───────────────────────────────────────┐
│  Agenda                           (RD) │  ← 52px, hairline embaixo
└───────────────────────────────────────┘
```
- **Esquerda:** **título da tela** (“Agenda”, “Pendentes”, “Clientes”) — orientação, cara de app.
- **Direita:** **avatar circular** com as iniciais do usuário (`RD`). É o acesso a **Perfil/menu**.
- **Some do topo:** nome por extenso e “Sair” — migram para **Perfil** (§4.4).
- Borda inferior **hairline** (`border-border`), não a faixa grossa `border-primary` de hoje — leitura mais limpa/app.
- A **identidade do estabelecimento** (nome + logo) aparece no **Perfil** e no topo da tela **Agenda** (subtítulo pequeno), não como chrome fixo em toda tela.

### 4.2 Tab bar + FAB único (resolve #2)

**Problema hoje:** “+ Novo agendamento” flutuante **e** o FAB “+” na tab bar fazem a mesma coisa; o de cima fica cortado pela barra.

**Proposta — uma ação de criar só, no FAB central:**
```
┌───────────────────────────────────────┐
│                                         │
│   agenda / conteúdo da tab              │
│                                         │
├───────┬───────┬───────┬───────┬────────┤
│ Agenda│Penden.│  ⊕    │Client.│ Perfil │  ← tab bar, FAB central elevado
│  ▣    │  ▢(2) │ (FAB) │  ▢    │  (RD)  │
└───────┴───────┴───────┴───────┴────────┘  ↑ safe-area
```
- **Remove** o botão flutuante “+ Novo agendamento” da tela de Agenda. **Sobra o FAB central** como **única** entrada de criação.
- **FAB “+”** abre um **bottom sheet de ação rápida** (não um menu que some atrás da barra):
  ```
  ┌───────────────────────────┐
  │  ══                        │
  │  Criar                     │
  │  ─────────────────────     │
  │  🗓  Novo agendamento   ›  │
  │  👤  Nova cliente       ›  │
  └───────────────────────────┘
  ```
  Só ações que **existem hoje**. “Registrar pagamento” **fica fora** enquanto Pagamentos/“Financeiro” estiver oculto (consistente com o ajuste 2.1.04). Quando voltar, entra como 3ª linha.
- **Tabs:** Agenda · Pendentes (badge) · **FAB** · Clientes · **Perfil**. Perfil vira **tab** (além do avatar no topo — os dois levam ao mesmo lugar; redundância proposital, um pro polegar, outro pro topo). Configurações fica **dentro de Perfil** (owner), não na tab bar (é raro no dia a dia).
- Badge de pendentes: pastilha numérica no ícone de Pendentes (já existe).

### 4.3 Versão (resolve #5)

**Problema hoje:** `v1.0b` flutua fixo sobre o conteúdo (canto inferior direito), em cima da agenda.

**Proposta:** no celular, **remover** a versão flutuante e mostrá-la **dentro de Perfil** (linha “Sobre · v1.0b”). No **desktop, mantém** o canto inferior direito (lá não atrapalha). É uma troca responsiva: `hidden` no mobile, visível em Perfil.

### 4.4 Perfil (novo destino de identidade — resolve #1 e #5)

```
┌───────────────────────────────────────┐
│  Perfil                           (RD) │
├───────────────────────────────────────┤
│  [logo]  Salão Teste                   │  ← identidade do estabelecimento
│                                        │
│  Dono Teste                            │  ← usuário
│  dono@tamarcado.dev · Dono             │
│  ───────────────────────────────────  │
│  Tema         ( Claro  ◐ Escuro )      │  ← toggle (já é pref. individual)
│  Configurações do estabelecimento   ›  │  ← só owner (leva às abas de config)
│  Sobre                        v1.0b    │
│  ───────────────────────────────────  │
│  [           Sair            ]         │  ← destrutivo-leve, largura total
└───────────────────────────────────────┘
```
- Reúne o que saiu do topo: **nome/role**, **tema**, **Configurações** (owner), **versão**, **Sair**.
- “Sair” **largura total no rodapé**, alcance de polegar.

---

## 5. Tela: Agenda (mobile) — resolve #4 e #6

### 5.1 Toolbar consolidada (resolve #4)

**Problema hoje:** duas barras empilhadas (Dia/Semana/Mês **e** Todos/WhatsApp/Manual) antes da agenda.

**Proposta — uma linha de controle, sticky, e a grade já visível:**
```
┌───────────────────────────────────────┐
│  Agenda                           (RD) │
│  Salão Teste                           │  ← subtítulo pequeno (identidade)
├───────────────────────────────────────┤
│  ‹  Qui, 30/07  ›     [Dia|Semana]  ⚲ │  ← toolbar única, sticky
├───────────────────────────────────────┤
│  ── agora ───────────────────  09:12   │  ← linha de “agora”
│  08 ─────────────────────────────────  │
│  09 ┌─────────────────────────────┐    │
│     │● Maria das Dores  09:30–10:30│   │
│     │  Corte · Não atribuído       │   │
│     │                    Confirmado│   │
│  10 └─────────────────────────────┘    │
│  11 ─────────────────────────────────  │
│  ...                                    │
└───────────────────────────────────────┘
```
- **Uma barra**: navegação de data (`‹ [Qui, 30/07] ›`) + **segmented Dia/Semana**. **“Mês — em breve” some no mobile** (é ruído; volta quando existir).
- O filtro **Todos/WhatsApp/Manual** deixa de ser barra fixa: vira o **ícone de filtro `⚲`** na mesma linha. Toca → **bottom sheet de filtros** (§5.2). Quando um filtro está ativo, o ícone ganha **ponto/《badge》** e um **chip removível** aparece logo abaixo da toolbar (`WhatsApp ✕`), pra ficar óbvio que há filtro e dar como limpar.
- Toolbar **sticky** ao rolar; a grade rola sob ela.

### 5.2 Sheet de filtros

```
┌───────────────────────────┐
│  ══   Filtrar agenda       │
│  ─────────────────────     │
│  Origem                    │
│  ( Todos ) WhatsApp  Manual│  ← segmented
│  Profissional              │  ← só multi-profissional (§5.4)
│  [ Todos os profissionais ▾]│
│  ─────────────────────     │
│  [ Limpar ]   [ Aplicar ]  │
└───────────────────────────┘
```
- Reúne **origem** e (quando houver mais de um profissional) **profissional** num lugar só. Isso evita empilhar controles na tela.

### 5.3 Grade — dias cheios (resolve #6, parte 1)

- **Mantém a timeline de coluna única** (08:00–18:00 ou o horário de funcionamento configurado) — é o padrão certo pro celular; multi-coluna não cabe em 412px.
- Melhorias de densidade:
  - **Linha de “agora”** (hora atual) + **auto-scroll** para o horário atual ao abrir o Dia.
  - Cards ocupam a **altura proporcional à duração** (como hoje), com layout compacto: nome (1 linha, truncado), `serviço · profissional`, faixa de status à direita.
  - **Barra de cor à esquerda** por **status** (amarelo/pendente, verde/confirmado, cinza/concluído, vermelho/cancelado, etc. — tokens `--status-*`).
  - **Sobreposição no mesmo horário** (encaixe/overbooking, permitido por D1): dois cards **lado a lado** em meia-largura; **3+**, mostram 2 + pílula **“+N”** que abre um **sheet-lista** daquele horário.
  - **Estado vazio** por período (já existe) — manter.
- **Densidade alternativa (futuro, não bloqueia 7.2):** um toggle **Lista** (agendamentos em lista cronológica compacta) para dias muito cheios. Fica anotado como evolução; a timeline é a entrega primária.

### 5.4 Multi-profissional (resolve #6, parte 2)

- **Default:** timeline **única com todos os profissionais mesclados**. Cada card mostra um **chip do profissional** (nome curto + cor por profissional) para diferenciar. “Não atribuído” em itálico cinza (como hoje).
- **Filtrar por profissional:** no sheet de filtros (§5.2), selector **“Todos os profissionais ▾”** → escolher um deixa a timeline **só daquele profissional** (leitura limpa num salão cheio). O chip removível aparece na toolbar (`Fernanda ✕`).
- **Por que não colunas paralelas:** não cabem legíveis em 412px e brigam com o toque. A combinação **mescla + filtro por profissional** dá a visão geral e o foco individual, sem coluna horizontal.
- Confirmar um pendente que exige escolher profissional continua igual ao desktop, dentro do sheet de confirmação (§6.2).

---

## 6. Ações — todas em bottom sheet (paridade DL-051)

### 6.1 Detalhe do agendamento (toque no card)
```
┌───────────────────────────┐
│  ══                        │
│  Maria das Dores   [balão] │  ← nome + ícone origem
│  Confirmado                │  ← badge status
│  ─────────────────────     │
│  Corte · 09:30–10:30       │
│  Profissional: Não atrib.  │
│  Cliente: (11) 9xxxx-xxxx  │
│  ─────────────────────     │
│  [ Editar ]                │  ← ações conforme status/permite
│  [ Remarcar ]              │
│  [ Cancelar ]  (destrutivo)│
└───────────────────────────┘
```
- Ações variam por status/permissão (mesma lógica do desktop). **Pendente** troca o bloco por Confirmar/Recusar (§6.2). Botões **largura total**, empilhados, primário embaixo.

### 6.2 Confirmar / Recusar (Pendentes e detalhe) — paridade
```
Confirmar                         Recusar (passo 2, empurra no mesmo sheet)
┌───────────────────────────┐     ┌───────────────────────────┐
│  ══  Confirmar solicitação │     │  ‹ Recusar                 │
│  Maria · Corte · 09:30     │     │  Motivo (obrigatório)      │
│  Profissional (opcional)   │     │  [__________________]      │
│  [ Sem preferência    ▾ ]  │     │  [__________________]      │
│  ─────────────────────     │     │  ─────────────────────     │
│  [      Confirmar      ]   │     │  [   Recusar   ] (destr.)  │
└───────────────────────────┘     └───────────────────────────┘
```
- **Confirmar:** select opcional de profissional (Story 3.5) embutido; primário “Confirmar”.
- **Recusar:** **empurra** um painel de motivo **dentro do mesmo sheet** (não abre outro); “Recusar” **desabilitado** até o motivo ter conteúdo (regra atual). Feedback por **toast** (sonner).

### 6.3 Novo / Editar agendamento (resolve #2 + #3)
- Aberto pelo **FAB → “Novo agendamento”** (ou “Editar/Remarcar” no detalhe). É **um bottom sheet** com o formulário atual (cliente com busca + “+ Nova”, serviço, data/hora, profissional só p/ owner/gestão), **rolável**, com **“Agendar/Salvar” sticky no rodapé**. Sem botão flutuante duplicado.

### 6.4 Cancelar
- Bottom sheet com o texto condicional de notificação (tem/não tem WhatsApp — UX-DR18) e **motivo**; primário destrutivo “Cancelar agendamento”.

---

## 7. Tela: Pendentes (mobile) — Story 7.3 (paridade)

```
┌───────────────────────────────────────┐
│  Pendentes                        (RD) │
├───────────────────────────────────────┤
│  ┌─────────────────────────────────┐  │
│  │ Maria das Dores      Pelo link  │  │  ← origem (link/whatsapp)
│  │ Corte · Qui 30/07 · 09:30       │  │
│  │ [ Confirmar ]   [ Recusar ]     │  │  ← ações inline OU abre sheet
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ João Souza           WhatsApp   │  │
│  │ ...                              │  │
│  └─────────────────────────────────┘  │
│  (vazio) → estado vazio padronizado    │
└───────────────────────────────────────┘
```
- Lista de cards com **Confirmar/Recusar** (as **mesmas ações** do desktop — DL-051 revoga o “somente leitura”). Confirmar/Recusar abrem os sheets do §6.2.
- Badge da tab reflete o contador (polling existente).

---

## 8. Acessibilidade & uma-mão

- **Alvos ≥ 44×44px**; espaçamento generoso entre ações destrutivas e primárias.
- **Thumb zone:** toda ação primária no rodapé do sheet/tela; navegação no rodapé.
- **Safe-area:** `padding-bottom: env(safe-area-inset-bottom)` na tab bar e nos rodapés sticky dos sheets.
- **Foco & teclado:** sheets prendem o foco (Radix já faz), fecham no `Esc`/voltar do Android; primeiro campo recebe foco em formulários.
- **Movimento:** `prefers-reduced-motion` troca slide por fade.
- **Contraste:** herda tokens claro/escuro; status por **cor + texto** (nunca só cor).
- **Toque vs. hover:** nada depende de hover; estados ativos visíveis no toque.

---

## 9. Impacto no desktop (garantia de não-quebra)

- **Bottom Sheet = mesmo componente do Dialog**, só muda apresentação em `md:`. Em ≥768px, renderiza **idêntico** ao Dialog de hoje. Zero mudança visual no desktop.
- **AppBar/Tab bar/FAB** já são o **branch mobile** do `AppShell` (`isDesktop === false`); o desktop usa o branch da sidebar, **não tocado**.
- **Toolbar consolidada, filtros em sheet, versão em Perfil**: mudanças no **render mobile**; o desktop mantém suas duas barras/versão no canto (ou adota o filtro em popover — decisão de desktop à parte, fora deste escopo).
- **Sem lib nova**: Sheet sobre `@radix-ui/react-dialog` (já dependência); segmented/select/toast já existem.

---

## 10. Handoff — o que a Amelia toca (orientativo, não código)

| Área | Arquivo(s) atuais | Mudança |
|---|---|---|
| Casca mobile | `components/AppShell.tsx` (branch mobile) | AppBar slim (título+avatar), tab bar com Perfil, FAB→sheet de criar, remover versão flutuante no mobile |
| Bottom Sheet | **novo** `components/ui/sheet.tsx` | wrapper responsivo sobre `@radix-ui/react-dialog`; usado onde hoje há `Dialog` no fluxo mobile |
| Agenda | `pages/Agenda.tsx`, `AgendaGrid`, filtros | toolbar única + `⚲` filtros em sheet; linha de “agora”; chip de profissional; overlap “+N”; remover botão flutuante |
| Ações | `pages/Agenda.tsx`, `Pendentes.tsx`, `NovoAgendamento.tsx` | trocar `Dialog` por `ActionSheet` responsivo (detalhe, confirmar/recusar, novo/editar, cancelar) |
| Perfil | `pages/Perfil.tsx` | identidade do estabelecimento + usuário + tema + Configurações(owner) + versão + Sair |
| Versão | `lib/version.ts` (uso) | mobile: mostrar em Perfil; desktop: manter canto |

---

## 11. Aceite por story

**Story 7.2 — paridade de ações no celular**
- [ ] Sem botão de criar duplicado: só o FAB; nada cortado pela tab bar.
- [ ] Detalhe/novo/editar/cancelar em **bottom sheet** (swipe-down, primário no rodapé, safe-area).
- [ ] Confirmar/recusar/criar/cancelar/remarcar **funcionam** no celular (mesmos endpoints).
- [ ] Toolbar da Agenda **consolidada** em uma linha; filtros em sheet; “Mês em breve” oculto no mobile.
- [ ] AppBar enxuta (título+avatar); nome/Sair/versão em Perfil.
- [ ] Desktop **idêntico** ao de hoje (Dialog central, sidebar, versão no canto).

**Story 7.3 — consulta/estado no celular**
- [ ] Agenda dia/semana legível; linha de “agora”; auto-scroll ao horário atual.
- [ ] Multi-profissional: timeline mesclada com chip de profissional + filtro por profissional.
- [ ] Dias cheios: overlap lado-a-lado / “+N”; estados vazios padronizados.
- [ ] Pendentes com Confirmar/Recusar (paridade), badge no tab.

**Fora do escopo (anotado):** modo **Lista** para dias cheios; **subdomínio por marca**; “Registrar pagamento” (volta com “Financeiro”). Empacotamento PWA (manifest/ícone/offline) é a **Story 7.1**, separada.

---

## 12. Pergunta aberta para o Renato

- **Perfil como tab E avatar** (redundância proposital) ou **só avatar** no topo? Proponho os dois (polegar + topo); confirmar antes de a Amelia fechar a tab bar.
