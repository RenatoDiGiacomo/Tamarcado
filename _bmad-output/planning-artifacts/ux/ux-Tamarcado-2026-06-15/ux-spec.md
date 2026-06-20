---
title: "UX Spec: Tamarcado"
status: final
created: 2026-06-15
updated: 2026-06-18
prd: "_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/prd.md"
---

# UX Spec: Tamarcado
## Fluxo Conversacional · Painel Web · App Mobile

---

## 1. Princípios de Design

**1.1 Invisibilidade para a cliente final**
A cliente não sabe que existe um sistema. Ela manda mensagem, uma "Agenda" responde. O produto deve se comportar como se fosse o próprio profissional respondendo — organizado, rápido, nunca robótico.

**1.2 Guia, não pergunte aberto**
O bot nunca faz perguntas abertas onde uma lista fechada resolve. "Qual serviço?" seguida de uma lista numerada. "Qual dia?" seguida de dias disponíveis. A cliente não precisa adivinhar o que responder.

**1.3 Tudo funciona em texto puro**
Nenhuma função do sistema depende de emoji, botão interativo, ou formatação rica. Emojis são zero. Opções são sempre numeradas em texto (`1 - Corte`). A experiência é idêntica em qualquer WhatsApp.

**1.4 Mobile-first, painel incluído**
O painel web é acessado do celular tanto quanto do computador. Layout responsivo com navegação por tabs em mobile e sidebar em desktop. Nenhuma ação crítica exige tela grande.

**1.5 Feedback imediato**
Toda ação do usuário tem resposta visual em menos de 1 segundo (loading state se necessário). O profissional nunca fica em dúvida se a confirmação funcionou.

---

## 2. Tom de Voz

**Público:** profissionais de beleza e suas clientes — mulheres brasileiras, linguagem informal, calorosa, direta.

**Voz do bot:** prestativo, claro, sem exageros. Não é um assistente corporativo. Não é um amigo íntimo. É a recepção organizada de um bom salão.

**Regras de copy:**
- Sem emojis em nenhuma mensagem
- "Você" (não "tu")
- Frases curtas, uma ideia por parágrafo
- Confirmações sempre repetem os dados do agendamento (data, hora, serviço)
- Nunca deixar a cliente sem saber o que fazer a seguir
- Variáveis sempre entre colchetes: `[NOME_CADASTRO]`, `[NOME_INSTALAÇÃO]`, `[SERVIÇO]`, `[DIA_SEMANA]`, `[DD/MM]`, `[HH:MM]`

**Formato de data e hora nas mensagens:**
- Data: `Terça, 17/06` (dia da semana abreviado + dia/mês)
- Hora: `09:00` (24h, dois dígitos)

---

## 3. Fluxo Conversacional do Bot

### 3.1 Diagrama de Estados

```
IDLE ──[intenção detectada]──► SERVIÇO
                                  │
                          [serviço confirmado]
                                  │
                                  ▼
                                 DIA
                                  │
                           [dia confirmado]
                                  │
                                  ▼
                               HORÁRIO
                                  │
                          [horário confirmado]
                                  │
                                  ▼
                         AGUARD. CONFIRMAÇÃO ──[timeout 2h]──► MENSAGEM "EM ANÁLISE"
                            │           │
                    [confirmado]     [recusado]
                            │           │
                            ▼           ▼
                        CONFIRMADO    RECUSADO ──► DIA (volta ao fluxo)

IDLE ──[intenção de cancelar]──► CANCELAMENTO
                                      │
                              [1 agendamento futuro]
                                      │
                                      ▼
                              CONFIRMA CANCELAMENTO
                                      │
                           [sim]      │      [não]
                            │         │         │
                            ▼         │         ▼
                        CANCELADO     │       IDLE
                                      │
                        [2+ agendamentos futuros]
                                      │
                                      ▼
                              SELEÇÃO DE QUAL CANCELAR
                                      │
                                      ▼
                              CONFIRMA CANCELAMENTO
```

---

### 3.2 Mensagens do Bot — Agendamento

---

#### MSG-A01: Primeiro contato (cliente ainda não cadastrada)

*Trigger:* mensagem da cliente com intenção de agendar, número não existe no cadastro.

```
Ola! Aqui e a Agenda da [NOME_INSTALAÇÃO].

Para marcar seu horario, qual servico voce gostaria?

[LISTA_SERVICOS]

Responda com o numero ou o nome do servico.
```

*Nota de implementação:* o cadastro da cliente é criado automaticamente neste momento com número de WhatsApp e nome do perfil. O profissional pode editar o nome no painel.

`[ASSUMPTION]` Usa o nome do perfil WhatsApp como nome inicial no cadastro. O profissional pode corrigir.

---

#### MSG-A02: Contato de cliente já cadastrada (segundo contato em diante)

*Trigger:* mensagem com intenção de agendar, número já existe no cadastro com nome editável.

```
Ola, [NOME_CADASTRO]! Aqui e a Agenda da [NOME_INSTALAÇÃO].

Quer marcar um horario? Qual servico voce gostaria?

[LISTA_SERVICOS]

Responda com o numero ou o nome do servico.
```

---

#### LISTA_SERVICOS — formato padrão

Substituída em todas as mensagens onde aparece:

```
1 - [NOME_SERVICO_1]
2 - [NOME_SERVICO_2]
3 - [NOME_SERVICO_3]
...
```

`[ASSUMPTION]` Se a instalação tiver mais de 8 serviços, exibir apenas os 8 mais recentemente atendidos para aquela cliente (se houver histórico) ou os 8 primeiros cadastrados. Lista paginada é feature futura.

`[ASSUMPTION]` Se a instalação tiver exatamente 1 serviço, o bot pula a seleção e confirma diretamente: "Vou agendar um(a) [SERVIÇO], certo? Responda 1 para sim."

---

#### MSG-A03: Serviço selecionado — apresentação de dias disponíveis

*Trigger:* cliente responde com número válido ou nome reconhecido de serviço.

```
Otimo! Para [SERVIÇO], os proximos dias com horario disponivel sao:

[LISTA_DIAS]

Qual fica melhor para voce?
```

**LISTA_DIAS — formato:**
```
1 - Terca, 17/06
2 - Quarta, 18/06
3 - Sexta, 20/06
4 - Segunda, 23/06
5 - Terca, 24/06
```

`[ASSUMPTION]` Apresentar os próximos 5 dias com disponibilidade. Se houver menos de 5 dias disponíveis nos próximos 30 dias, mostrar os que existem.

---

#### MSG-A04: Sem dias disponíveis

*Trigger:* consulta de disponibilidade retorna zero slots nos próximos 30 dias para o serviço selecionado.

```
No momento nao ha horarios disponiveis para [SERVIÇO].

Entre em contato com [NOME_INSTALAÇÃO] para verificar disponibilidade.
```

---

#### MSG-A05: Dia selecionado — apresentação de horários

*Trigger:* cliente responde com número válido de dia.

```
Em [DIA_SEMANA], [DD/MM], os horarios disponiveis sao:

[LISTA_HORARIOS]

Qual voce prefere?
```

**LISTA_HORARIOS — formato:**
```
1 - 09:00
2 - 10:30
3 - 14:00
4 - 15:30
```

---

#### MSG-A05b: Horário selecionado — confirmação da cliente

*Trigger:* cliente responde com número válido de horário. Bot apresenta o resumo e pede confirmação antes de registrar (estado `AWAITING_CONFIRMATION`). Pré-agendamento **ainda não é criado** neste passo.

```
Confirma agendar [SERVIÇO] em [DIA_SEMANA], [DD/MM] as [HH:MM]?

Responda 1 para confirmar ou 2 para escolher outro horario.
```

*Se a cliente responder "2":* o bot volta à apresentação de horários do dia (MSG-A05) ou de dias (MSG-A03), conforme o ponto do fluxo.

---

#### MSG-A06: Confirmação da cliente recebida — pré-agendamento criado

*Trigger:* cliente responde "1" à MSG-A05b. Só então o sistema cria o pré-agendamento com status *aguardando confirmação* (transação com `FOR UPDATE`).

```
Sua solicitacao foi enviada para [NOME_INSTALAÇÃO].

Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM]
Horario: [HH:MM]

O salao ainda vai confirmar e pode haver ajuste de horario. Assim que [NOME_INSTALAÇÃO] aceitar ou recusar, voce recebe a mensagem aqui.
```

---

#### MSG-A07: Horário tomado (race condition)

*Trigger:* outro cliente confirmou o mesmo slot entre a seleção e o registro.

```
Que pena! Esse horario acabou de ser ocupado.

Os horarios que ainda estao disponiveis em [DIA_SEMANA], [DD/MM] sao:

[LISTA_HORARIOS_ATUALIZADA]

Ou responda "voltar" para escolher outro dia.
```

`[ASSUMPTION]` Se não houver mais horários no dia escolhido, voltar automaticamente para a seleção de dias (MSG-A03 com lista atualizada).

---

### 3.3 Mensagens do Bot — Confirmação e Recusa pelo Profissional

---

#### MSG-B01: Notificação para o profissional (instalação solo)

*Canal:* WhatsApp do profissional.

`[CORRIGIDO — DL-018]` O número do bot é dedicado à Evolution API; o profissional não responde por ele. Confirmação/recusa ocorrem exclusivamente pelo painel web (ver MSG-B04/MSG-B05).

```
Nova solicitacao de agendamento.

Cliente: [NOME_CADASTRO]
Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM]
Horario: [HH:MM]

Acesse o painel para confirmar ou recusar.
```

---

#### MSG-B02: Notificação para o dono/recepção (instalação multi-profissional)

*Canal:* WhatsApp do número de gestão configurado na instalação.

```
Nova solicitacao de agendamento.

Cliente: [NOME_CADASTRO]
Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM]
Horario: [HH:MM]

Acesse o painel para confirmar ou recusar.
```

`[ASSUMPTION]` Em instalações multi-profissional, a notificação via WhatsApp vai para o número configurado como "número de gestão" no setup. O painel também exibe o pendente para dono e funcionário, com badge atualizado por polling (ver NFR-A3/DL-019).

---

#### MSG-B03: *(Removido — DL-018)*

A justificativa de recusa é digitada no modal do próprio painel (ver UX-DR9), não solicitada por mensagem de WhatsApp ao profissional.

---

#### MSG-B04: Confirmação enviada à cliente

*Trigger:* profissional confirma pelo painel web `[CORRIGIDO — DL-018]`.

```
Ta marcado!

Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM]
Horario: [HH:MM]
Com: [NOME_INSTALAÇÃO]
```

---

#### MSG-B05: Recusa enviada à cliente + alternativas

*Trigger:* profissional recusa com justificativa pelo painel web `[CORRIGIDO — DL-018]`.

```
Oi, [NOME_CADASTRO]. [NOME_INSTALAÇÃO] nao consegue atender nesse horario.

Motivo: [JUSTIFICATIVA]

Quer escolher outro dia? Os proximos disponiveis sao:

[LISTA_DIAS]

Responda com o numero do dia ou escreva "nao" para encerrar.
```

---

#### MSG-B06: Timeout de 2 horas (horário comercial) sem resposta

*Trigger:* 2 horas de horário comercial passaram sem confirmação ou recusa.

```
Oi, [NOME_CADASTRO]! Sua solicitacao de [SERVIÇO] em [DIA_SEMANA], [DD/MM] as [HH:MM] ainda esta em analise.

Assim que [NOME_INSTALAÇÃO] confirmar, voce recebe a mensagem aqui.
```

---

### 3.4 Mensagens do Bot — Cancelamento pela Cliente

---

#### MSG-C01: Intenção de cancelar detectada — 1 agendamento futuro

*Trigger:* mensagem com palavras-chave de cancelamento ("cancelar", "desmarcar", "nao posso ir", "nao vou", etc.); cliente tem exatamente 1 agendamento futuro confirmado.

```
Entendi que voce quer cancelar seu horario.

[SERVIÇO] - [DIA_SEMANA], [DD/MM] as [HH:MM]

Confirma o cancelamento?

1 - Sim, cancelar
2 - Nao, manter o horario
```

---

#### MSG-C02: Intenção de cancelar — 2 ou mais agendamentos futuros

*Trigger:* cliente tem mais de 1 agendamento futuro confirmado.

```
Qual horario voce quer cancelar?

[LISTA_AGENDAMENTOS]

Responda com o numero.
```

**LISTA_AGENDAMENTOS — formato:**
```
1 - Corte - Terca, 17/06 as 09:00
2 - Escova - Sexta, 20/06 as 14:00
```

Após seleção, exibir MSG-C01 com o agendamento específico.

---

#### MSG-C03: Cancelamento confirmado — mensagem à cliente

```
Cancelamento confirmado.

Se quiser agendar outro horario, e so mandar mensagem.
```

---

#### MSG-C04: Cliente optou por manter o horário

```
Ok! Seu horario esta mantido.

[SERVIÇO] - [DIA_SEMANA], [DD/MM] as [HH:MM]
```

---

#### MSG-C05: Notificação ao profissional sobre cancelamento pela cliente

*Canal:* WhatsApp do profissional (solo) ou número de gestão (multi).

```
Aviso: [NOME_CADASTRO] cancelou o agendamento.

Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM] as [HH:MM]

O horario foi liberado na agenda.
```

---

#### MSG-C06: Notificação à cliente quando profissional/dono/funcionário cancela pelo painel

*Trigger:* cancelamento iniciado pelo painel web ou app mobile; cliente tem número WhatsApp cadastrado.
*Canal:* WhatsApp da cliente.

```
Oi, [NOME_CADASTRO]. [NOME_INSTALAÇÃO] precisou cancelar seu horario.

Servico: [SERVIÇO]
Data: [DIA_SEMANA], [DD/MM] as [HH:MM]

Quer marcar outro horario? Responda 1 para sim.
```

Se a cliente responder "1": bot inicia o fluxo de agendamento (equivalente a MSG-A02).

*Exceção:* se a cliente não tem WhatsApp cadastrado (agendamento manual sem número, FR-D8), MSG-C06 não é disparada. A comunicação fica por conta de quem realizou o cancelamento.

> **Resolvido:** este comportamento já está coberto pelo **FR-C6** no PRD (incorporado via DL-015) e implementado na Story 2.8 dos épicos. Sem pendência.

---

### 3.5 Fallbacks

---

#### FB-01: Entrada não reconhecida durante seleção de serviço

```
Nao reconheci essa resposta.

Qual servico voce gostaria?

[LISTA_SERVICOS]

Responda com o numero ou o nome do servico.
```

---

#### FB-02: Entrada não reconhecida durante seleção de dia

```
Por favor, escolha um dos dias abaixo:

[LISTA_DIAS]
```

---

#### FB-03: Entrada não reconhecida durante seleção de horário

```
Por favor, escolha um dos horarios disponiveis:

[LISTA_HORARIOS]
```

---

#### FB-04: Entrada não reconhecida durante confirmação de cancelamento

```
Para cancelar o horario, responda 1. Para manter, responda 2.
```

---

#### FB-05: Mensagem fora do fluxo (cliente em flow ativo)

*Trigger:* cliente manda mensagem não relacionada enquanto um fluxo está ativo (ex: manda um áudio, manda uma foto, pergunta outra coisa).

```
Estou aqui para ajudar com seu agendamento.

Quer continuar? Responda 1 para sim ou 2 para comecar de novo.
```

---

#### FB-06: Mensagem não reconhecida (sem fluxo ativo)

*Trigger:* cliente manda mensagem que não aciona nenhuma palavra-chave de agendamento ou cancelamento, e não há fluxo ativo.

```
Ola! Aqui e a Agenda da [NOME_INSTALAÇÃO].

Posso ajudar voce a marcar um horario. Qual servico voce gostaria?

[LISTA_SERVICOS]
```

---

#### FB-07: *(Removido — DL-018)*

Premissa inválida: o profissional não confirma/recusa respondendo ao número do bot (dedicado à Evolution API). Confirmação/recusa de pendentes ocorrem exclusivamente pelo painel web — não há fallback de bot para esse canal.

---

## 4. Painel Web do Profissional

### 4.1 Estrutura de Navegação

**Desktop (sidebar fixa, ≥768px):**
```
┌──────────────────────────────────────────────────────┐
│ [Logo]  [Nome da instalação]          [Usuário] [Sair]│
├──────┬───────────────────────────────────────────────┤
│      │                                               │
│ Agenda│                  [conteúdo]                  │
│      │                                               │
│ Pendentes (3)                                        │
│      │                                               │
│ Clientes                                             │
│      │                                               │
│ Pagamentos                                           │
│      │                                               │
│ Configurações                                        │
│ (só dono)                                            │
│      │                                               │
└──────┴───────────────────────────────────────────────┘
```

**Mobile (tabs no rodapé, <768px):**
```
┌─────────────────────────────────┐
│ [Logo/Nome]             [Avatar]│
│─────────────────────────────────│
│                                 │
│           [conteúdo]            │
│                                 │
│─────────────────────────────────│
│ Agenda  Pendentes  Clientes  +  │
│         (badge)                 │
└─────────────────────────────────┘
```

O "+" abre um menu de ações rápidas: Novo agendamento / Nova cliente / Registrar pagamento.

**Badge de pendentes:** número vermelho sobre o ícone/item "Pendentes" sempre que houver agendamentos com status *aguardando confirmação*. Some quando todos forem resolvidos.

---

### 4.2 Tela: Agenda

**Header da tela:**
```
┌─────────────────────────────────────────────┐
│  < Ter, 17/06 >          [Dia] [Semana] [Mes]│
│  [Todos os profissionais v]    (só dono/func)│
└─────────────────────────────────────────────┘
```

**Indicadores visuais por status:**

| Status | Cor do card | Label |
|---|---|---|
| Aguardando confirmação | Amarelo/laranja | "Pendente" |
| Confirmado | Verde | "Confirmado" |
| Concluído | Cinza | "Concluído" |
| Cancelado | Vermelho claro (riscado) | "Cancelado" |
| Não compareceu | Cinza-escuro | "Não compareceu" |

**Indicadores de origem (FR-K4):**

- Origem `whatsapp`: ícone de balão de chat à esquerda do nome da cliente
- Origem `manual`: ícone de lápis à esquerda do nome da cliente

**Card de agendamento — estrutura:**
```
┌─────────────────────────────────────────────┐
│ [balão] Joana Silva              [Pendente] │
│         Corte · 09:00 – 10:00               │
│         Nao atribuido                [v]    │
└─────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────┐
│ [lapis] Maria das Dores        [Confirmado] │
│         Coloracao · 14:00 – 17:00           │
│         Fernanda                      [v]   │
└─────────────────────────────────────────────┘
```

O `[v]` abre um menu de contexto: Ver detalhes / Confirmar / Recusar / Cancelar / Registrar pagamento / Marcar não compareceu (apenas em agendamentos confirmados; registro manual, sem notificação — FR-D9/DL-023).

**Modal de cancelamento pelo profissional/painel (com WhatsApp cadastrado):**
```
┌─────────────────────────────────────────────┐
│  Cancelar agendamento?                      │
│                                             │
│  Joana Silva · Corte · Ter 17/06 · 09:00   │
│                                             │
│  A cliente sera notificada via WhatsApp     │
│  sobre o cancelamento.                      │
│                                             │
│  [Voltar]        [Confirmar cancelamento]   │
└─────────────────────────────────────────────┘
```

**Modal de cancelamento (cliente sem WhatsApp cadastrado):**
```
┌─────────────────────────────────────────────┐
│  Cancelar agendamento?                      │
│                                             │
│  Ana Costa · Corte · Ter 17/06 · 09:00     │
│                                             │
│  Esta cliente nao tem WhatsApp cadastrado.  │
│  A comunicacao sobre o cancelamento fica    │
│  por sua conta.                             │
│                                             │
│  [Voltar]        [Confirmar cancelamento]   │
└─────────────────────────────────────────────┘
```

Após confirmação: status muda para *Cancelado*, slot liberado, MSG-C06 disparada (se aplicável). Toast: "Agendamento cancelado." ou "Agendamento cancelado. A cliente foi notificada."

**"Nao atribuido":** exibido em itálico e cor neutra (cinza) quando `professional_id` é null. Não é um erro — é o estado esperado para agendamentos via WhatsApp no MVP.

**Visão semana:** grade 7 colunas (seg–dom), linhas por hora. Cards compactos (só nome e horário). Clique abre detalhes.

**Visão mês:** calendário mensal. Cada dia mostra um contador de agendamentos por status (ex: "3 confirmados · 1 pendente"). Clique no dia vai para visão dia.

**Botão de ação flutuante (FAB):** fixo no canto inferior direito — "Novo agendamento". Visível em todas as visões de agenda. (Em mobile, é uma das opções do "+".)

**Filtro de origem (FR-K5):**
Pequeno filtro no header: `[Todos] [WhatsApp] [Manual]`. Filtra os cards exibidos na visão atual.

---

### 4.3 Tela: Pendentes

*Esta tela existe como atalho dedicado e também aparece como seção destacada no topo da Agenda quando há pendentes.*

**Comportamento:** se não há pendentes, exibe estado vazio — "Nenhuma solicitação aguardando. Tudo em dia."

**Com pendentes:**
```
┌─────────────────────────────────────────────┐
│  Aguardando confirmacao (3)                 │
├─────────────────────────────────────────────┤
│                                             │
│  Joana Silva                                │
│  Corte · Terca, 17/06 · 09:00              │
│  Via WhatsApp                               │
│                                             │
│            [Recusar]  [Confirmar]           │
│─────────────────────────────────────────────│
│                                             │
│  Maria Oliveira                             │
│  Escova · Terca, 17/06 · 14:00             │
│  Via WhatsApp                               │
│                                             │
│            [Recusar]  [Confirmar]           │
│─────────────────────────────────────────────│
│                                             │
│  Ana Costa                                  │
│  Coloracao · Quarta, 18/06 · 10:00         │
│  Via WhatsApp                               │
│                                             │
│            [Recusar]  [Confirmar]           │
│                                             │
└─────────────────────────────────────────────┘
```

**Ação Confirmar:** sem modal. Confirmação inline — card muda de status imediatamente para "Confirmado" e some da lista de pendentes. Toast de feedback: "Confirmado. A cliente foi notificada."

**Ação Recusar:** abre modal de justificativa:

```
┌─────────────────────────────────────────────┐
│  Recusar agendamento?                       │
│                                             │
│  Joana Silva · Corte · Terca 17/06 · 09:00 │
│                                             │
│  Motivo da recusa *                         │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│  Este texto sera enviado a cliente.         │
│                                             │
│  [Cancelar]          [Recusar e notificar] │
└─────────────────────────────────────────────┘
```

- Campo obrigatório (não permite enviar vazio)
- Botão "Recusar e notificar" desabilitado até o campo ser preenchido
- Após recusa: card some da lista, toast "Recusado. A cliente foi notificada com o motivo."

---

### 4.4 Tela: Novo Agendamento Manual

*Acessado via FAB ou menu "+".*

```
┌─────────────────────────────────────────────┐
│  Novo agendamento                     [X]  │
├─────────────────────────────────────────────┤
│                                             │
│  Cliente *                                  │
│  [Buscar pelo nome ou numero...]  [+ Nova] │
│                                             │
│  Profissional *          (so dono/func)     │
│  [Selecionar...]                            │
│                                             │
│  Servico *                                  │
│  [Selecionar...]                            │
│                                             │
│  Data *                                     │
│  [DD/MM/AAAA]                               │
│                                             │
│  Horario *                                  │
│  [HH:MM]                                    │
│                                             │
│  Observacoes                                │
│  [Texto livre opcional]                     │
│                                             │
│  Entra como: Confirmado (sem aprovacao)     │
│                                             │
│  [Cancelar]              [Criar agendamento]│
└─────────────────────────────────────────────┘
```

- Campo "Profissional" só aparece para dono e funcionário; profissional vê o próprio nome fixo (sem dropdown)
- Campo "Cliente": busca em tempo real no cadastro por nome ou número. Se não encontrar, link "+ Nova" abre o formulário de nova cliente em modal
- Campo "Data": valida que a data é hoje ou futura
- Campo "Horário": valida que o slot está dentro dos horários de atendimento configurados para o profissional selecionado; avisa (não bloqueia) se o slot já está ocupado
- Texto informativo fixo: "Entra como: Confirmado (sem aprovação)" — deixa claro o comportamento diferente do fluxo de bot
- Após criar: toast "Agendamento criado." + retorno para a agenda no dia criado

**Modal: Nova cliente (dentro do formulário de agendamento):**

```
┌─────────────────────────────────────────────┐
│  Nova cliente                         [X]  │
├─────────────────────────────────────────────┤
│                                             │
│  Nome *                                     │
│  [                              ]           │
│                                             │
│  WhatsApp                                   │
│  [                              ] (opcional)│
│                                             │
│  Observacoes                                │
│  [                              ] (opcional)│
│                                             │
│  [Cancelar]                  [Salvar]       │
└─────────────────────────────────────────────┘
```

Ao salvar: volta para o formulário de agendamento com a nova cliente já selecionada.

---

### 4.5 Tela: Clientes

**Lista:**
```
┌─────────────────────────────────────────────┐
│  Clientes                   [Buscar...]     │
├─────────────────────────────────────────────┤
│  Joana Silva                                │
│  (11) 99999-0000 · 4 agendamentos          │
│─────────────────────────────────────────────│
│  Maria das Dores                            │
│  (11) 98888-1111 · 12 agendamentos         │
│─────────────────────────────────────────────│
│  Ana Costa                                  │
│  Sem WhatsApp · 1 agendamento              │
└─────────────────────────────────────────────┘
```

**Perfil da cliente:**
```
┌─────────────────────────────────────────────┐
│  < Voltar      Joana Silva          [Editar]│
├─────────────────────────────────────────────┤
│  WhatsApp: (11) 99999-0000                  │
│  Cadastrada em: 10/06/2026                  │
│                                             │
│  Observacoes:                               │
│  [Prefere coloracao fria. Alergia a...]     │
│                                             │
│  Historico de agendamentos:                 │
│  ───────────────────────────────────────   │
│  Corte · Seg, 10/06 · 09:00 · Concluido   │
│  Escova · Sex, 06/06 · 14:00 · Cancelado  │
│  Coloracao · Ter, 03/06 · 10:00 · Concluido│
│                                             │
│  [Novo agendamento para esta cliente]       │
└─────────────────────────────────────────────┘
```

---

### 4.6 Tela: Registro de Pagamento

*Acessado via menu de contexto do card de agendamento (botão "...") ou pela listagem da tela de agendamento concluído.*

```
┌─────────────────────────────────────────────┐
│  Registrar pagamento                  [X]  │
├─────────────────────────────────────────────┤
│  Agendamento:                               │
│  Joana Silva · Corte · Ter, 17/06 · 09:00  │
│                                             │
│  Valor *           R$                       │
│  [          ]                               │
│                                             │
│  Forma de pagamento *                       │
│  [Dinheiro                         v]       │
│   - Dinheiro                                │
│   - PIX                                     │
│   - Cartao de debito                        │
│   - Cartao de credito                       │
│   - Outro                                   │
│                                             │
│  [Cancelar]           [Registrar pagamento] │
└─────────────────────────────────────────────┘
```

Após registrar: status do agendamento muda para *Concluído*. Toast: "Pagamento registrado."

---

### 4.7 Tela: Configurações (somente Dono)

**Estrutura:**
```
Configuracoes
├── Servicos
├── Horarios de atendimento
├── Equipe e permissoes
└── Identidade visual
```

**Servicos:**
```
┌─────────────────────────────────────────────┐
│  Servicos                [+ Adicionar]      │
├─────────────────────────────────────────────┤
│  Corte                                      │
│  60 min · R$ 50,00              [Editar] [x]│
│─────────────────────────────────────────────│
│  Coloracao                                  │
│  120 min · R$ 150,00            [Editar] [x]│
│─────────────────────────────────────────────│
│  Escova                                     │
│  45 min · R$ 40,00              [Editar] [x]│
└─────────────────────────────────────────────┘
```

Formulário (Adicionar/Editar):
```
Nome do servico *: [                ]
Duracao *:         [  ] minutos
Preco:             R$ [        ] (opcional)
[Cancelar] [Salvar]
```

**Horarios de atendimento:**
```
┌─────────────────────────────────────────────┐
│  Horarios de atendimento                    │
│  [Fernanda                            v]    │
├─────────────────────────────────────────────┤
│  Segunda   [08:00] ate [19:00]  [x]        │
│  Terca     [08:00] ate [19:00]  [x]        │
│  Quarta    [08:00] ate [19:00]  [x]        │
│  Quinta    [08:00] ate [19:00]  [x]        │
│  Sexta     [08:00] ate [18:00]  [x]        │
│  Sabado    [09:00] ate [14:00]  [x]        │
│  Domingo                        [ ]        │
│                                             │
│  Intervalo entre atendimentos:              │
│  [15 min                          v]        │
│  (folga entre um servico e o proximo)       │
│                                             │
│  [Salvar]                                   │
└─────────────────────────────────────────────┘
```

`[x]` ativado = dia habilitado. `[ ]` desativado = dia bloqueado, sem horários.
Dropdown de profissional no topo (para instalações multi-profissional).

**Equipe e permissoes:**
```
┌─────────────────────────────────────────────┐
│  Equipe                     [+ Convidar]    │
├─────────────────────────────────────────────┤
│  Fernanda Souza                             │
│  Profissional           [Editar permissao]  │
│─────────────────────────────────────────────│
│  Ana Lima                                   │
│  Funcionaria            [Editar permissao]  │
│─────────────────────────────────────────────│
│  voce (Marco)                               │
│  Dono                                [---]  │
└─────────────────────────────────────────────┘
```

Modal de editar permissão:
```
Permissao de Fernanda Souza

( ) Dono
(o) Profissional
( ) Funcionario

[Cancelar] [Salvar]
```

Convidar profissional:
```
Convidar para a equipe

Nome *:       [               ]
Permissao *:  [ Profissional  v]

O convite e enviado por link. O usuario cria a propria senha no
primeiro acesso.

[Cancelar] [Enviar convite]
```

**Identidade visual:**
```
┌─────────────────────────────────────────────┐
│  Identidade visual                          │
├─────────────────────────────────────────────┤
│  Nome da instalacao *                       │
│  [Agenda da Fernanda              ]         │
│                                             │
│  Logo                                       │
│  [Imagem atual]   [Trocar imagem]           │
│  Formatos: JPG, PNG. Tam. max: 2MB.         │
│                                             │
│  Cor primaria                               │
│  [#E91E63] [previa da cor]                  │
│                                             │
│  [Salvar]                                   │
└─────────────────────────────────────────────┘
```

*Nota: tema claro/escuro é configuração individual do usuário, não da instalação. Fica em "Perfil do usuário" (Avatar no header), fora de Configurações.*

---

## 5. App Mobile do Profissional

*Autenticação compartilhada com o painel web. O usuário loga uma vez; a sessão persiste.*

### 5.1 Navegação (tabs no rodapé)

```
[Agenda] [Pendentes (badge)] [Perfil]
```

### 5.2 Tela: Agenda (app mobile)

```
┌──────────────────────────────┐
│  Agenda da Fernanda          │
│  < Ter, 17/06  >             │
│  [Dia]  [Semana]             │
├──────────────────────────────┤
│                              │
│  09:00                       │
│  ┌──────────────────────┐   │
│  │[balao] Joana Silva   │   │
│  │ Corte               │   │
│  │ Nao atribuido        │   │
│  │                [Pendente]│
│  └──────────────────────┘   │
│                              │
│  10:00  (livre)              │
│                              │
│  14:00                       │
│  ┌──────────────────────┐   │
│  │[lapis] Maria Dores   │   │
│  │ Coloracao           │   │
│  │                [Confirmado]│
│  └──────────────────────┘   │
│                              │
└──────────────────────────────┘
```

Toque no card abre detalhes para consulta. `[CORRIGIDO — DL-018]` Confirmar/Recusar não estão disponíveis no app — exclusivos do painel web.

### 5.3 Tela: Pendentes (app mobile)

`[CORRIGIDO — DL-018]` Tela somente leitura: lista os agendamentos *aguardando confirmação* para consulta. Sem ações de Confirmar/Recusar no app — tratamento é exclusivo do painel web.

```
┌──────────────────────────────┐
│  Aguardando confirmacao (2)  │
├──────────────────────────────┤
│                              │
│  Joana Silva                 │
│  Corte                       │
│  Terca, 17/06 · 09:00       │
│                              │
│  Trate pelo painel web       │
│  ──────────────────────────  │
│                              │
│  Ana Costa                   │
│  Coloracao                   │
│  Quarta, 18/06 · 10:00      │
│                              │
│  Trate pelo painel web       │
│                              │
└──────────────────────────────┘
```

### 5.4 Tela: Perfil (app mobile)

```
┌──────────────────────────────┐
│  Meu perfil                  │
├──────────────────────────────┤
│  Nome: Fernanda Souza        │
│  Permissao: Profissional     │
│  Instalacao: Agenda Fernanda │
│                              │
│  Tema: [Claro] [Escuro]      │
│                              │
│  [Sair]                      │
└──────────────────────────────┘
```

---

## 6. Estados Vazios e Edge Cases

### 6.1 Estados vazios principais

| Tela | Mensagem |
|---|---|
| Agenda sem agendamentos no dia | "Nenhum agendamento hoje. Use o botao para criar um." |
| Pendentes sem pendentes | "Nenhuma solicitacao aguardando. Tudo em dia." |
| Clientes sem clientes cadastradas | "Nenhuma cliente cadastrada ainda. Os agendamentos via WhatsApp criam o cadastro automaticamente." |
| Historico de cliente sem agendamentos | "Nenhum agendamento registrado para esta cliente." |

### 6.2 Comportamentos esperados não óbvios

- **Agendamento cancelado pelo profissional via painel:** o sistema notifica a cliente via WhatsApp (MSG-C06) se ela tiver número cadastrado, e oferece reagendamento imediato. Se não tiver número (agendamento manual sem WhatsApp, FR-D8), sem notificação automática — responsabilidade de quem cancelou. Simetria com FR-C3 (cliente cancela → profissional é notificado). Coberto por FR-C6 (PRD) e Story 2.8.
- **Horário comercial do timeout:** o contador de 2h pausa fora de 08h–19h seg–sáb e retoma no próximo horário comercial. Um agendamento feito às 18h50 tem até as 10h50 do dia seguinte para ser respondido (10 min no dia atual + 10h00 no dia seguinte em horário comercial). `[ASSUMPTION: QA-1 em aberto]`
- **Race condition de slot:** o aviso de "esse horário acabou de ser ocupado" (MSG-A07) aparece somente se o slot foi tomado entre a escolha e o registro — não durante a navegação da lista. Slots são verificados em tempo real no momento do registro.
- **Cliente sem WhatsApp faz cancelamento:** não se aplica — cancelamento via bot só é possível para clientes com número de WhatsApp ativo. Cancelamento de clientes sem WhatsApp é feito pelo profissional/dono no painel.

---

*Workspace: `_bmad-output/planning-artifacts/ux/ux-Tamarcado-2026-06-15/`*
*PRD fonte: `_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/prd.md`*
*Próximos passos: bmad-create-architecture (Winston) · bmad-create-epics-and-stories*
