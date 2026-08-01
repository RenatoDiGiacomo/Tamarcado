# UX — Painel no celular (Épico 7, Stories 7.2 / 7.3)

**Autora:** Sally (UX) · **Data:** 2026-07-30 · **Status:** spec para implementação (handoff Amelia)
**Escopo:** o **mesmo** `apps/web` no celular (≤ 412px), com **cara de app nativo** e **usável com uma mão**. Não é app separado (**DL-051**): é responsividade + PWA do painel existente, com **paridade total de ações** com o desktop.

> **Regra-mãe deste documento:** todo padrão mobile abaixo é uma **camada responsiva** sobre os componentes atuais. Nada aqui pode exigir componente que **quebre o desktop** nem biblioteca nova — só tokens da Sally + shadcn/Radix já presentes. Onde um componente muda de forma no celular, ele **mantém a forma de desktop em ≥ 768px** (breakpoint `md`).

---

## 0. Decisões pré-handoff (Renato, 2026-07-30)

Definições que fecham o desenho antes de ir para a Amelia:

1. **Tab bar = 4 abas + FAB central:** `Agenda · Pendentes · [FAB +] · Clientes · Configurações`. **Configurações é aba** (uso frequente — é onde se ajusta o **horário de atendimento dos profissionais**, que muda toda semana), **não** fica só no avatar.
2. **FAB vai DIRETO para “Novo agendamento”** — sem sheet “Criar” intermediário. É a ação dominante do dia; “Nova cliente” já tem botão próprio dentro de Clientes. Se surgirem mais ações de criação (ex.: Registrar pagamento com o “Financeiro”), reavaliamos um menu.
3. **Avatar no AppBar → Perfil** (identidade, tema, Sair, versão). Perfil é **uso raro**, por isso mora no avatar, **não** na tab bar.
4. **Corte de escopo em duas levas** — ver **§11**. Primeira leva = casca + sheets essenciais + toolbar única + Configurações usável. Overlap, multi-profissional, linha de “agora”, sheet de filtros e Perfil completa vão para **7.2.NN** (segunda leva). Critério: overlap/multi-prof resolvem **agenda cheia**, problema que ainda não temos; prioridade é **parecer app** e ser usável no dia a dia.
5. **Protótipo clicável da primeira leva** (incluindo Configurações) **antes** do handoff, para validar o “cara de app”.
6. **Botão Sair = ícone (logout) em vermelho** — ver **§8.1**.

> **RISCO DE HANDOFF (obrigatório):** o **Bottom Sheet substitui o `Dialog` compartilhado**, usado por **todas** as telas do desktop. Não basta afirmar que não quebra — **a Amelia entrega screenshot do desktop ANTES/DEPOIS** de cada tela afetada (ver §9). Verificação visual, não promessa.

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
- **Sem o nome do estabelecimento no AppBar** — a dona já sabe em qual estabelecimento está (é o dela); o nome/logo/cor vivem **só em Perfil**, onde ela confere quando quer. Fica **apenas o título da tela** + avatar. *(O caso em que o nome faria sentido — um usuário gerenciar mais de um estabelecimento — não existe hoje: cada usuário pertence a uma company só. Se surgir, reavaliamos.)*

### 4.2 Tab bar (4 abas) + FAB direto (resolve #2)

**Problema hoje:** “+ Novo agendamento” flutuante **e** o FAB “+” na tab bar fazem a mesma coisa; o de cima fica cortado pela barra.

**Proposta — 4 abas + FAB central, e o FAB vai DIRETO para Novo agendamento:**
```
┌───────────────────────────────────────┐
│                                         │
│   agenda / conteúdo da tab              │
│                                         │
├───────┬───────┬───────┬───────┬────────┤
│ Agenda│Penden.│  ⊕    │Client.│ Config │  ← 4 abas + FAB central elevado
│  ▣    │  ▢(2) │ (FAB) │  ▢    │  ⚙     │
└───────┴───────┴───────┴───────┴────────┘  ↑ safe-area
```
- **Remove** o botão flutuante “+ Novo agendamento” da tela de Agenda. **Sobra o FAB central** como **única** entrada de criação.
- **FAB → abre DIRETO o sheet de Novo agendamento** (§6.3). **Sem** menu “Criar” intermediário: criar agendamento é a ação dominante do dia; “Nova cliente” já tem botão próprio dentro de **Clientes**. Um menu de duas opções para sempre escolher a mesma seria um toque desperdiçado. (Se entrar “Registrar pagamento” com o Financeiro, reavaliamos um menu — anotado.)
- **Tamanho do FAB: 44px** (visível **e** alvo de toque na mesma medida). Não descer abaixo disso (mínimo Apple HIG / WCAG — mão menor pede alvo **alcançável**, não menor). O 56px inicial dominava a tela.
- **Ícone: `calendar-plus`** (calendário com “+”), não o “+” genérico — diz **novo agendamento**. **Evitar relógio com “+”** (parece adicionar horário de funcionamento, que é outra coisa e vive em Configurações).
- **Alinhamento vertical:** o centro do círculo do FAB alinha com o **centro da LINHA DOS ÍCONES** dos vizinhos (Agenda/Pendentes/Clientes/Config), **ignorando a altura dos rótulos**. Centrar no bloco inteiro (ícone + rótulo) faz o FAB **parecer pendurado** abaixo da fileira; alinhá-lo ao ícone o faz **ler como parte da mesma fileira** (~8–10px mais alto). Não pode sobrepor os rótulos dos vizinhos, e o alvo de 44px não invade o alvo de Pendentes/Clientes.
- **FAB não cobre o conteúdo:** alinhado à fileira, o FAB **quase não projeta** acima da barra (~2px), então o container rolável leva só uma **folga pequena + `env(safe-area-inset-bottom)`** (a altura da tab bar já é descontada pelo layout). Assim o **último card da agenda cheia** nunca fica coberto ao rolar até o fim (era um bug do painel atual).
- **4 abas:** **Agenda · Pendentes (badge) · Clientes · Configurações** (com o FAB no centro, entre Pendentes e Clientes). **Configurações é aba** — uso frequente (horário de atendimento dos profissionais muda toda semana). Ver §4.5.
- **Perfil NÃO é aba** — mora no **avatar** do AppBar (§4.4), uso raro.
- Badge de pendentes: pastilha numérica no ícone de Pendentes (já existe).

### 4.3 Versão (resolve #5)

**Problema hoje:** `v1.0b` flutua fixo sobre o conteúdo (canto inferior direito), em cima da agenda.

**Proposta:** no celular, **remover** a versão flutuante e mostrá-la **dentro de Perfil** (linha “Sobre · v1.0b”). No **desktop, mantém** o canto inferior direito (lá não atrapalha). É uma troca responsiva: `hidden` no mobile, visível em Perfil.

### 4.4 Perfil (destino do avatar — mínima na 1ª leva — resolve #1 e #5)

Acessada **só pelo avatar** do AppBar (uso raro). **Primeira leva = versão mínima:** identidade, tema, versão, Sair. (A Perfil “completa” — mais preferências — fica na 2ª leva, §11.)
```
┌───────────────────────────────────────┐
│  ‹  Perfil                             │  ← volta para a tela anterior
├───────────────────────────────────────┤
│  [logo]  Salão Teste                   │  ← identidade do estabelecimento
│                                        │
│  Dono Teste                            │  ← usuário
│  dono@tamarcado.dev · Dono             │
│  ───────────────────────────────────  │
│  Tema         ( Claro  ◐ Escuro )      │  ← toggle (já é pref. individual)
│  Sobre                        v1.0b    │  ← versão vem pra cá (resolve #5)
│  ───────────────────────────────────  │
│  [ ⤶  Sair ]                           │  ← ícone vermelho + rótulo (§8.1)
└───────────────────────────────────────┘
```
- Reúne o que saiu do topo: **nome/role**, **tema**, **versão**, **Sair**.
- **Não** repete “Configurações” aqui — Configurações é **aba** (§4.5). Perfil fica enxuta.
- **Sair**: ícone de logout em **vermelho (token danger)** + rótulo “Sair”, largura total, alcance de polegar. Diferenciação de destrutivo real em **§8.1**.

### 4.5 Configurações no celular (aba — foco horários do profissional)

**Motivo de ser aba:** ajustar o **horário de atendimento dos profissionais** é rotina semanal do salão — uso frequente, não esporádico.

```
┌───────────────────────────────────────┐
│  Configurações                    (RD) │
│  [ Identidade | Serviços | Horários |  │  ← abas roláveis horizontalmente
│    Equipe ]  (segmented com scroll)    │     (mesmas seções do desktop)
├───────────────────────────────────────┤
│  Horários de atendimento               │
│  Profissional: [ Fernanda ▾ ]          │
│  ───────────────────────────────────  │
│  Seg  ◉  09:00 – 18:00        ✎        │
│  Ter  ◉  09:00 – 18:00        ✎        │
│  Qua  ○  (fechado)                     │
│  ...                                    │
│  ───────────────────────────────────  │
│  [           Salvar           ]        │  ← sticky no rodapé
└───────────────────────────────────────┘
```
- **Navegável e usável no celular:** as abas de config (Identidade, Serviços, Horários, Equipe) viram um **segmented rolável na horizontal** (não quebra linha), reaproveitando as telas existentes.
- **Horários** é a jornada-alvo: seletor de **profissional**, lista de dias com **toggle** de aberto/fechado e **intervalo editável** (edição em **bottom sheet**, §6). **Salvar** sticky no rodapé.
- Só o que já existe no desktop; sem recurso novo — só o **layout mobile** das mesmas seções.

---

## 5. Tela: Agenda (mobile) — **calendário do mês + LISTA do dia** (redesenho)

> **Redesenho (Sally + Renato, 2026-07-31), a partir de referências de apps de agendamento reais.** A 1ª leva da 7.2 entregou a **casca** (AppBar, tab bar, FAB, sheets), mas a agenda em si continuou sendo a **grade de horário do desktop espremida**, que **não funciona em 412px**: desenha 08:00–18:00 inteiro mesmo num dia com um agendamento só — gasta a tela com horas vazias. **Nas referências de mercado nenhum app de agendamento usa grade no celular; todos usam lista.** Para "onde tenho espaço livre" o fluxo já é o **Novo agendamento**, que mostra os horários disponíveis.

### 5.1 DECISÃO ESTRUTURAL — dois componentes para a mesma rota

**No mobile a agenda é LISTA; no desktop continua GRADE.** São **dois componentes distintos** para a rota `/`, **não** um componente só tentando servir aos dois:

| Breakpoint | Componente | Forma |
|---|---|---|
| Mobile (< md) | **`AgendaList`** *(novo)* | calendário do mês + lista do dia |
| Desktop (≥ md) | **`AgendaGrid`** *(atual, inalterado)* | grade de horário (funciona bem no PC) |

- A página `Agenda` **escolhe o componente por breakpoint** (o `useMediaQuery`/`DESKTOP_QUERY` que a casca já usa). Uma renderiza `AgendaList`, a outra `AgendaGrid`.
- **Isto precisa estar escrito** (e é o motivo desta seção): sem a decisão explícita, a implementação volta a "uma grade responsiva" — exatamente o problema atual. **Grade espremida não é responsividade; é a tela errada no celular.**
- **Compartilham** o mesmo carregamento de dados (`GET /appointments`), o mesmo mapa de status/`StatusChip` (3.7) e o **mesmo detalhe em bottom sheet** (§6.1). Só a **apresentação da lista de agendamentos** difere.

### 5.2 Layout do `AgendaList` (mobile)

```
┌───────────────────────────────────────┐
│  Agenda                           (RD) │  ← AppBar (só título + avatar)
├───────────────────────────────────────┤
│  ‹        Julho 2026            ›       │  ← navegação de mês
│   S   T   Q   Q   S   S   D            │  ← cabeçalho de semana
│      1   2   3   4   5   6             │
│   7   8   9  10  11 [12] 13            │  ← [12] = dia selecionado (destaque)
│  14  15  16  17  18  19  20            │
│  21  22  23  24 •25  26  27            │  ← • = ponto: dia TEM agendamento
│  28  29  30  31                        │
├───────────────────────────────────────┤
│  [ Dia | Semana ]                      │  ← toolbar única (mantida)
├───────────────────────────────────────┤
│  Sex, 25/07                            │  ← cabeçalho do dia (na visão Dia)
│  ┌─────────────────────────────────┐   │
│  │ 09:30  Maria das Dores    ● Conf.│   │  ← card da LISTA
│  │ 09:30–10:30 · Corte             │   │
│  │ Fernanda                         │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 11:00  João Souza      ● Pendente│   │
│  │ 11:00–11:30 · Barba             │   │
│  │ Não atribuído                    │   │
│  └─────────────────────────────────┘   │
└───────────────────────────────────────┘
```

**Comportamento:**
- **Calendário do mês (topo):** grade compacta `S T Q Q S S D`. **Dia selecionado em destaque** (preenchido, cor primária); **hoje** contornado; **ponto/indicador** nos dias que têm agendamento. **`‹ ›` navega meses.** Tocar num dia seleciona-o e a lista abaixo atualiza.
- **Toolbar única mantida — `Dia | Semana`:**
  - **Dia** (default): lista dos agendamentos do **dia selecionado**, ordenados por horário.
  - **Semana:** lista da **semana** do dia selecionado, **agrupada por dia** (cabeçalhos `Seg 21/07`, `Ter 22/07`…), cada grupo com seus cards. O calendário destaca a semana inteira.
- **Sem grade de horário, sem horas vazias.** A lista mostra **só o que existe**.
- Tocar num card → **detalhe em bottom sheet** (§6.1, inalterado).

### 5.3 Card da lista

Cada item é um card (não uma faixa proporcional à duração) com:
- **Horário** em destaque (início; o intervalo `09:30–10:30` na 2ª linha).
- **Nome da cliente** (1 linha, truncado).
- **Serviço**.
- **Profissional** — nome, ou **"Não atribuído"** em itálico cinza.
- **Status** — o **badge existente** da 3.7 (`StatusChip`: pendente/confirmado/concluído/cancelado/não compareceu).
- Ícone de origem (balão WhatsApp / lápis manual / link) como hoje, discreto.

### 5.4 Empty state — ilustrado e compacto

Quando o dia selecionado não tem nada: **estado vazio ilustrado, pequeno** — um ícone/ilustração leve + uma linha ("Nenhum agendamento neste dia") + atalho para o Novo agendamento. **Não ocupa meia tela** (o atual é grande demais): fica logo abaixo da toolbar, deixando o calendário e o resto respirando.

```
┌───────────────────────────┐
│        (ilustração)        │  ← compacta
│  Nenhum agendamento hoje   │
│  [ + Novo agendamento ]    │  ← opcional; o FAB já cobre
└───────────────────────────┘
```

### 5.5 Sheet de filtros — *(2ª leva, 7.2.NN)*

Filtro por **origem** (Todos/WhatsApp/Manual) e, quando houver mais de um profissional, por **profissional** — acionado por um ícone `⚲` na toolbar, abrindo um sheet. **Fora desta entrega.**

### 5.6 Fora de escopo (segue na 7.2.NN)

Overlap **"+N"**, **multi-profissional com chips coloridos** e **linha de "agora"** eram melhorias da *grade* para dias cheios. Com a **lista**, a maioria perde sentido (a lista já lida bem com dia cheio, rolando). Ficam registradas na **7.2.NN** caso voltem a fazer sentido; **não** entram neste redesenho.

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
- **FAB “+” abre DIRETO este sheet de Novo agendamento** (sem menu “Criar” no meio). “Editar/Remarcar” chega pelo detalhe (§6.1). É **um bottom sheet** com o formulário atual (cliente com busca + “+ Nova”, serviço, data/hora, profissional só p/ owner/gestão), **rolável**, com **“Agendar/Salvar” sticky no rodapé**. Sem botão flutuante duplicado.

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

### 8.1 Botão Sair — ícone + rótulo, vermelho *danger* (mobile e desktop)

Trocar o texto puro “Sair” por **ícone de logout (porta/seta saindo) em vermelho**, para diferenciar das demais ações. Regras:

- **Cor:** usar **o token `--destructive` do design system** (não um vermelho avulso). Aplicar **no ícone** (e no rótulo, se ficar melhor), não como botão preenchido.
- **Desktop:** **ícone + rótulo “Sair”** — o ícone em vermelho, o texto em peso normal. Há espaço de sobra; o público **não é técnico** (dona de salão de 50 anos não tem obrigação de reconhecer o pictograma), então **não** usar ícone sozinho aqui.
- **Mobile (dentro de Perfil):** **ícone + rótulo** também — é uma lista, o espaço horizontal existe.
- **Se em algum ponto ficar só ícone:** obrigatório `aria-label="Sair"` e **alvo ≥ 44×44px**.
- **Diferenciar de destrutivo real:** “Cancelar agendamento” é destrutivo de verdade e usa **botão preenchido `destructive`**. **Sair NÃO é destrutivo** (é reversível — basta logar de novo). Então Sair é um **item de lista / botão ghost** com **ícone vermelho + texto**, visualmente **mais leve** que o botão preenchido de cancelar. Mesma família de cor (token danger), pesos diferentes: preenchido = apaga dado; ghost com ícone = sai da sessão.
- Vale para os dois: o **AppShell desktop** (rodapé da sidebar, onde hoje está “Sair”) e a **Perfil mobile**.

### 8.2 Geral

- **Alvos ≥ 44×44px**; espaçamento generoso entre ações destrutivas e primárias.
- **Thumb zone:** toda ação primária no rodapé do sheet/tela; navegação no rodapé.
- **Safe-area:** `padding-bottom: env(safe-area-inset-bottom)` na tab bar e nos rodapés sticky dos sheets.
- **Foco & teclado:** sheets prendem o foco (Radix já faz), fecham no `Esc`/voltar do Android; primeiro campo recebe foco em formulários.
- **Movimento:** `prefers-reduced-motion` troca slide por fade.
- **Contraste:** herda tokens claro/escuro; status por **cor + texto** (nunca só cor).
- **Toque vs. hover:** nada depende de hover; estados ativos visíveis no toque.

---

## 9. Impacto no desktop (garantia de não-quebra) — **verificação obrigatória**

> **RISCO CRÍTICO:** o **Bottom Sheet substitui o `Dialog` compartilhado**, que hoje é usado por **todas** as telas do desktop (detalhe/novo/editar/cancelar do agendamento, aceite de convite, modais de Configurações, etc.). Mexer nele mexe em **todo mundo**. **Não basta afirmar “não quebra”** — a Amelia precisa **provar**:
> - **Screenshot ANTES/DEPOIS do DESKTOP** (≥768px) de **cada tela que usa `Dialog`** hoje. Entregar no PR.
> - Se o refactor tornar o Sheet responsivo (sheet no mobile, Dialog no desktop), a versão desktop deve sair **pixel-equivalente** à atual.
> - Rodar a suíte (os testes que exercitam os modais atuais devem passar sem alteração de expectativa que mascare regressão visual).

- **Bottom Sheet = mesmo componente do Dialog**, só muda apresentação em `md:`. Em ≥768px, renderiza **idêntico** ao Dialog de hoje. Zero mudança visual no desktop — **comprovado por screenshot**, não por promessa.
- **AppBar/Tab bar/FAB** já são o **branch mobile** do `AppShell` (`isDesktop === false`); o desktop usa o branch da sidebar, **não tocado**.
- **Toolbar consolidada, filtros em sheet, versão em Perfil**: mudanças no **render mobile**; o desktop mantém suas duas barras/versão no canto (ou adota o filtro em popover — decisão de desktop à parte, fora deste escopo).
- **Sem lib nova**: Sheet sobre `@radix-ui/react-dialog` (já dependência); segmented/select/toast já existem.

---

## 10. Handoff — o que a Amelia toca (orientativo, não código)

| Área | Arquivo(s) atuais | Mudança |
|---|---|---|
| Casca mobile | `components/AppShell.tsx` (branch mobile) | AppBar slim = **só título + avatar** (sem nome do salão); tab bar de **4 abas** (Agenda·Pendentes·Clientes·**Configurações**) + FAB central **44px, ícone `calendar-plus`**, abre **direto** Novo agendamento; **padding inferior no scroller** (overhang FAB + safe-area) p/ não cobrir o último card; remover versão flutuante no mobile |
| Bottom Sheet | **novo** `components/ui/sheet.tsx` | wrapper responsivo sobre `@radix-ui/react-dialog`; **sheet no mobile, Dialog no desktop** (ver §9 — screenshots obrigatórios) |
| Agenda (casca) | `pages/Agenda.tsx`, `AgendaGrid` | **toolbar única** (data + Dia/Semana); remover 2ª barra de filtro e botão flutuante; “Mês em breve” oculto no mobile *(já entregue na 7.2)* |
| **Agenda mobile = LISTA** | **novo `AgendaList`** + `pages/Agenda.tsx` escolhe por breakpoint | calendário do mês (dots) + **lista do dia** (não grade); empty state compacto; detalhe em bottom sheet. Desktop segue `AgendaGrid` **inalterado**. Ver **§5** (decisão estrutural: dois componentes, não um responsivo) |
| Ações | `pages/Agenda.tsx`, `Pendentes.tsx`, `NovoAgendamento.tsx` | trocar `Dialog` por `ActionSheet` responsivo (detalhe, confirmar/recusar, novo/editar, cancelar) |
| Configurações | `pages/Configuracoes*.tsx` | abas em **segmented rolável** no mobile; foco na tela **Horários** (profissional + dias + intervalo), Salvar sticky; edição de intervalo em sheet |
| Perfil | `pages/Perfil.tsx` | **mínima**: identidade do estabelecimento + usuário + tema + versão + **Sair** (§8.1). **Sem** linha de Configurações (é aba) |
| Sair | `AppShell.tsx` (desktop) + `Perfil.tsx` (mobile) | ícone logout **danger** + rótulo “Sair” (§8.1) |
| Versão | `lib/version.ts` (uso) | mobile: mostrar em Perfil; desktop: manter canto |

---

## 11. Escopo em duas levas

### 11.1 PRIMEIRA LEVA — vai para a Amelia agora (Story 7.2)
- [ ] **AppBar enxuta** com avatar (→ Perfil); nome/Sair/versão saem do topo.
- [ ] **Tab bar de 4 abas** (Agenda·Pendentes·Clientes·Configurações) + **FAB central**; FAB **direto** em Novo agendamento; **sem** botão flutuante duplicado; nada cortado pela barra.
- [ ] **Bottom sheets**: detalhe do agendamento, confirmar/recusar, novo/editar. (Cancelar reusa o mesmo padrão.)
- [ ] **Toolbar única sticky** (data + Dia/Semana); “Mês em breve” oculto no mobile; **sem** a 2ª barra de filtro.
- [ ] **Versão** movida para **Perfil** (fora do conteúdo).
- [ ] **Perfil mínima**: identidade, tema, versão, **Sair** (ícone danger, §8.1).
- [ ] **Configurações navegável e usável** no celular (foco em **Horários do profissional**).
- [ ] **Paridade**: confirmar/recusar/criar/cancelar/remarcar funcionam no celular.
- [ ] **Sair** com ícone danger + rótulo (mobile **e** desktop, §8.1).
- [ ] **Desktop comprovadamente intacto** — screenshots antes/depois das telas que usam `Dialog` (§9).

### 11.2 SEGUNDA LEVA — registrar como **7.2.NN** para não perder
- [ ] **Overlap** lado-a-lado + indicador **“+N”** (agenda cheia).
- [ ] **Timeline mesclada multi-profissional** com chips coloridos + **filtro por profissional**.
- [ ] **Linha de “agora”** + auto-scroll ao horário atual.
- [ ] **Sheet de filtros** por origem/profissional (ícone `⚲` na toolbar).
- [ ] **Perfil completa** (mais preferências).

**Critério do corte:** overlap e multi-profissional resolvem **agenda cheia** — problema que ainda não temos. Prioridade da 1ª leva é o **app parecer app** e ser **usável no dia a dia**.

**Fora de qualquer leva (anotado):** modo **Lista** para dias cheios; **subdomínio por marca**; “Registrar pagamento” (volta com “Financeiro”). Empacotamento **PWA** (manifest/ícone/offline) é a **Story 7.1**, separada.

---

## 12. Decisões fechadas (antes eram perguntas abertas)

- **Perfil no avatar, não como tab** — a tab é **Configurações** (uso frequente: horários dos profissionais). Perfil é raro → avatar. *(Fecha a pergunta anterior “Perfil como tab e/ou avatar”.)*
- **FAB direto** (sem menu “Criar”). *(Fecha a dúvida do menu de criação.)*
