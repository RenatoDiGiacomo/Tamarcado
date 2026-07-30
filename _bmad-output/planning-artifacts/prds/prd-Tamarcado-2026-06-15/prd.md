---
title: "PRD: Tamarcado"
status: final
created: 2026-06-15
updated: 2026-06-15
---

# PRD: Tamarcado
## Sistema de Agendamentos via WhatsApp para Profissionais de Beleza

---

## 1. Visão

**O que é:** Tamarcado é um SaaS de agendamentos para profissionais de beleza no Brasil que opera inteiramente dentro do WhatsApp para a cliente — sem app, sem link, sem redirecionamento.

**Insight central:** as clientes já marcam horário pelo WhatsApp. Todo dia, manualmente. O Tamarcado não muda esse comportamento; automatiza-o.

**Para o profissional:** o WhatsApp para de ser fonte de interrupção e passa a ser uma agenda que se autogestiona. Um bot assume o fluxo de agendamento; o profissional confirma em dois toques.

**O nome:** "Tamarcado" é "tá marcado" — a confirmação que toda cliente quer ouvir, entregue automaticamente.

---

## 2. Problema

Profissionais autônomos de beleza no Brasil acumulam três papéis simultaneamente: prestador de serviço, atendente e gestor de agenda. O sistema vigente é WhatsApp manual:

1. Cliente manda mensagem; profissional responde quando pode
2. Negociação de data/hora por troca de mensagens
3. Compromisso registrado na memória ou em papel

**Consequências diretas:**
- Mensagens sem resposta a tempo → cliente agenda com o concorrente antes de receber retorno
- Duplo agendamento por ausência de agenda centralizada
- Profissional refém do celular durante atendimentos
- Ausência de histórico de clientes: serviços anteriores, preferências, frequência

**Por que as soluções existentes não resolvem:** pedem que a cliente saia do WhatsApp — um app novo, um link, um formulário. A fricção do redirecionamento é a principal causa de abandono. O Tamarcado não pede isso.

---

## 3. Contexto de Lançamento

- **Prazo-alvo do MVP:** 90 dias a partir de 15/06/2026 (entrega até 13/09/2026)
- **Meta de validação:** 5 profissionais pagantes dentro da janela do MVP
- **Go-to-market:** venda consultiva direta (door-to-door), sem marketing digital no lançamento
- **Onboarding:** instalação e configuração realizadas por Renato presencialmente; não há self-service no MVP
- **Restrição operacional:** custo de infraestrutura total ≤ R$130/mês na fase de lançamento

---

## 4. Usuários

### 4.1 Profissional Autônoma — Fernanda (persona principal)

Fernanda, 32 anos, cabeleireira há 8 anos. Atende em cabine alugada em salão compartilhado. 8–15 clientes por semana. Usa o WhatsApp pessoal para tudo. Perde clientes toda vez que está atendendo e não responde mensagem de agendamento a tempo.

**Objetivo:** nunca mais perder cliente por falta de resposta rápida, sem precisar aprender nada novo.

**Acesso ao produto:** painel web (gestão completa), acessível também no celular — responsivo e instalável como PWA, com funcionalidade completa (DL-051).

### 4.2 Dono de Salão — Marco (persona secundária)

Marco, 45 anos, dono de salão com 3 profissionais. Cada uma agenda pelo próprio WhatsApp; Marco não tem visibilidade de nada. Clientes ligam perguntando disponibilidade; ele não sabe responder sem acionar cada profissional individualmente.

**Objetivo:** visibilidade da operação sem mudar o jeito que as profissionais trabalham.

**Acesso ao produto:** painel web com visão consolidada de todos os profissionais.

### 4.3 Funcionário / Recepcionista

Gerencia a operação do dia a dia do salão: recebe clientes, confirma e cancela agendamentos na agenda, registra pagamentos ao final do serviço. Não possui agenda de atendimento própria.

**Acesso ao produto:** painel web com permissões operacionais (sem acesso a configurações ou relatórios financeiros).

### 4.4 Cliente Final

Qualquer pessoa que já manda mensagem no WhatsApp do profissional para marcar horário. O Tamarcado não exige nenhuma ação nova dela — o bot responde onde ela já está.

**Acesso ao produto:** WhatsApp (exclusivamente).

---

## 5. Métricas de Sucesso

### Validação (primeiros 90 dias)
- 5 profissionais ativos pagantes via venda consultiva direta
- Taxa de conclusão do fluxo de agendamento via bot ≥ 70% (clientes que iniciam o fluxo e chegam à confirmação)
- Profissional acessa o painel web pelo menos 3× por semana sem suporte ativo
- Zero cancelamentos por bug crítico no fluxo do WhatsApp

### Crescimento (6 meses)
- 25–50 profissionais ativos; MRR de R$2.500–7.500 (mix de tiers autônomo/salão)
- Churn mensal < 5%
- NPS de profissionais ≥ 50

### Sinal qualitativo de produto funcionando
- Profissional relata que "não precisa mais ficar no celular respondendo agendamento"
- Cliente conclui agendamento sem precisar de intervenção humana do profissional

**Contra-métricas (alertas de produto quebrando):**
- Taxa de conclusão do fluxo de bot < 50% → fluxo confuso ou com falhas
- Profissional confirmando manualmente pelo WhatsApp pessoal em paralelo ao sistema → adoção falsa
- Tempo médio de resposta do bot > 5 segundos → problema de infraestrutura

---

## 6. Jornadas Principais

### UJ-1: Cliente Agenda via WhatsApp

**Protagonista:** Joana, 28 anos, cliente da Fernanda há 2 anos.

Joana manda mensagem para o número da Fernanda: "Oi, quero marcar um corte." O bot assume a conversa e se apresenta imediatamente com o nome da instalação: "Olá! Aqui é a Agenda da Fernanda. Vamos marcar seu horário?" *(FR-J2)* O bot pergunta qual serviço. Joana responde "corte". O bot apresenta os dias com horários disponíveis. Joana escolhe sexta-feira. O bot mostra os horários livres na sexta. Joana escolhe 9h. O bot confirma a solicitação: "Solicitação enviada! Aguarde a confirmação da Fernanda."

Fernanda recebe notificação no WhatsApp: "Nova solicitação — Joana, corte, sexta 14/06 às 9h. Confirmar?" Fernanda responde em dois toques. Joana recebe: "Tá marcado! Corte com a Fernanda — sexta-feira, 14/06 às 9h."

### UJ-2: Profissional Recusa com Justificativa

**Protagonista:** Fernanda

Fernanda recebe solicitação de agendamento, mas tem um compromisso pessoal no horário — um evento que não está no sistema. Ela recusa e digita a justificativa: "Estou fora nesse dia." O bot notifica Joana: "A Fernanda não está disponível nesse horário (Estou fora nesse dia). Quer escolher outro horário?" O bot reabre o fluxo e apresenta os próximos horários disponíveis.

### UJ-3: Cliente Cancela via WhatsApp

**Protagonista:** Joana

Na quinta-feira, Joana manda mensagem: "Oi, preciso cancelar meu horário de amanhã." O bot identifica que ela tem um agendamento confirmado na sexta às 9h, apresenta os dados e pergunta: "Confirma cancelamento do corte de sexta 14/06 às 9h?" Joana confirma. O bot responde "Cancelamento confirmado. Até a próxima!" e envia notificação automática para Fernanda: "Joana cancelou o corte de sexta às 9h. Horário liberado."

### UJ-4: Dono Aprova Agendamentos do Salão

**Protagonista:** Marco

Marco abre o painel web de manhã e vê três agendamentos com status *aguardando confirmação* — chegaram pelo bot do WhatsApp durante a noite e o fim de semana. Cada um mostra cliente, serviço e horário, mas sem profissional atribuído. Marco revisa os três: dois ele confirma diretamente no painel (o salão tem horário disponível em ambos os casos); um ele recusa — o horário não funciona — e registra a justificativa. O bot notifica as clientes: as duas confirmadas recebem "Tá marcado!" com os dados; a recusada recebe o motivo e uma sugestão de outras datas.

No dia do atendimento, a recepcionista sabe que o horário das 10h está confirmado para uma cliente. Ela anota internamente qual das três profissionais vai atender — isso não está no sistema ainda, é decisão operacional. A cliente chega, é atendida, e a recepcionista registra o pagamento no painel ao fim do serviço *(FR-F1)*.

*Contraste com a instalação solo (UJ-1 e UJ-2):* Fernanda aprova diretamente do próprio WhatsApp, sem painel. Marco e a recepcionista aprovam pelo painel, com visão consolidada.

---

## 7. Glossário

| Termo | Definição neste documento |
|---|---|
| **Instalação** | Uma instância do Tamarcado provisionada para um cliente (profissional autônomo ou salão). Cada instalação é um tenant independente com dados isolados. |
| **Pré-agendamento** | Sinônimo informal para agendamento com status *aguardando confirmação* — registrado pelo bot após a cliente escolher o horário, antes da confirmação do profissional. |
| **Origem** | Campo obrigatório em todo agendamento. Enum: `whatsapp` (criado pelo bot), `manual` (criado pelo painel web), `app` (reservado para uso futuro). |
| **Tenant** | Unidade de isolamento de dados. Cada instalação é um tenant; dados de tenants distintos não se cruzam em nenhuma operação do sistema. |
| **Horário comercial** | Para fins do timeout de confirmação (FR-B6): 08h–19h, segunda a sábado. Sujeito a revisão por instalação (QA-1). |

---

## 8. Requisitos Funcionais

### FR-A: Bot de Agendamento (WhatsApp — inbound da cliente)

**FR-A1.** O sistema reconhece mensagens de clientes com intenção de agendar e inicia o fluxo sem intervenção do profissional. No MVP, a detecção de intenção é baseada em correspondência de palavras-chave e frases configuráveis por instalação (ex: "marcar", "agendar", "horário", "quero um corte"). Mensagens que não correspondem a nenhuma palavra-chave recebem o tratamento de FR-A7.

**FR-A2.** O fluxo percorre três etapas em sequência:
1. **Serviço desejado** — cliente escolhe dentre os serviços configurados na instalação
2. **Dia disponível** — bot apresenta os próximos dias com pelo menos um slot livre (dentro dos horários de atendimento configurados); cliente escolhe um dia
3. **Horário disponível** — bot apresenta os horários livres no dia escolhido; cliente escolhe um horário

**FR-A3.** Um slot é considerado disponível quando pelo menos um profissional da instalação tem aquele horário livre em sua agenda (não há agendamento já alocado e o horário está dentro dos dias/faixas configurados em FR-G2). O bot não identifica nem exibe qual profissional ficará disponível.

**FR-A4.** Ao cliente confirmar o horário: o sistema registra o pré-agendamento com status *aguardando confirmação* e `professional_id` nulo — sem atribuição de profissional. O sistema envia notificação a dono e funcionário (em instalações multi-profissional) ou ao próprio profissional (em instalações solo).

**FR-A5.** Se nenhum horário estiver disponível no dia escolhido: o bot apresenta outros dias com disponibilidade e aguarda nova escolha da cliente.

**FR-A6.** O sistema garante atomicidade na criação do agendamento: dois clientes concorrendo pelo mesmo slot resultam em apenas um pré-agendamento registrado; o outro recebe resposta de indisponibilidade imediatamente. *(ver NFR-C1)*

**FR-A7.** O bot responde a entradas não reconhecidas com mensagem de fallback e redireciona ao passo atual do fluxo. O conteúdo exato da mensagem de fallback é definido por Sally (UX) durante o design do fluxo conversacional.

**FR-A8.** Um agendamento no MVP corresponde a um único serviço por vez.

`[ASSUMPTION]` A notificação (FR-A4) é enviada via WhatsApp: para instalações solo, no número do profissional; para instalações multi-profissional, no número do dono ou num número de gestão configurado. Os dados incluem: cliente, serviço, data, horário e ação de confirmar/recusar.

---

### FR-B: Confirmação e Recusa pelo Profissional

**FR-B1.** Dono e funcionário recebem notificação de nova solicitação com: nome da cliente, serviço, data e horário. Em instalações solo, a notificação vai para o próprio profissional. O agendamento aparece na agenda como *aguardando confirmação* sem profissional atribuído.

**FR-B2.** Dono, funcionário ou profissional (em instalações solo) confirma ou recusa a solicitação pelas **telas do painel**. O número de WhatsApp do bot é dedicado à Evolution API — o profissional **não** consegue responder por esse número para confirmar (limitação do **canal WhatsApp**, que permanece). O painel é acessível **também no celular** (responsivo/PWA), com as **ações completas** — **não** há restrição de "somente leitura" *(ver FR-H2; **DL-051** revoga a limitação de app read-only de **DL-018**; a premissa do canal WhatsApp segue válida)*.

**FR-B3.** Se confirmado: o sistema atualiza o status para *confirmado* e envia mensagem de confirmação automática à cliente com os dados completos do agendamento.

**FR-B4.** Se recusado: o sistema exige justificativa obrigatória antes de registrar a recusa. Sem justificativa, a recusa não é processada.

**FR-B5.** Após recusa com justificativa: o bot notifica a cliente com o motivo informado e sugere outras datas e horários disponíveis para que ela escolha uma alternativa.

**FR-B6.** O profissional tem 2 horas em horário comercial para confirmar ou recusar. Se o prazo expirar sem resposta, o bot notifica a cliente: "Seu horário está em análise. Você receberá uma confirmação em breve." O status do agendamento permanece *aguardando confirmação* — sem cancelamento automático no MVP.

`[ASSUMPTION]` "Horário comercial" = 08h–19h, segunda a sábado. Mensagens recebidas fora desse intervalo pausam o contador; ele retoma no próximo horário comercial. *(ver QA-1)*

---

### FR-C: Cancelamento

**FR-C1.** A cliente pode cancelar um agendamento enviando mensagem no WhatsApp com intenção de cancelar.

**FR-C2.** O bot identifica a intenção, apresenta os dados do agendamento vigente para confirmação da cliente. Se a cliente tiver mais de um agendamento futuro, o bot pergunta qual deseja cancelar.

**FR-C3.** Após confirmação da cliente: o sistema cancela o agendamento (status: *cancelado*), libera o slot na agenda e envia notificação automática ao profissional com os dados do cancelamento e o horário liberado.

**FR-C4.** Dono, profissional e funcionário podem cancelar agendamentos pelo painel web, respeitando a matriz de permissões. *(ver FR-I2)*

**FR-C5.** Não há política de antecedência mínima para cancelamento no MVP.

**FR-C6.** Quando dono, profissional ou funcionário cancelar um agendamento pelo painel (desktop ou celular), o sistema envia notificação automática via WhatsApp à cliente informando o cancelamento e oferecendo reagendamento imediato — se a cliente tiver número de WhatsApp cadastrado. Se não houver número cadastrado (agendamento manual sem WhatsApp, ver FR-D8), nenhuma notificação é disparada e a comunicação fica por conta de quem realizou o cancelamento.

---

### FR-D: Painel Web — Agenda

**FR-D1.** O painel exibe a agenda em três visões: dia, semana e mês.

**FR-D2.** Dono e funcionário visualizam a agenda de todos os profissionais da instalação na mesma tela. Profissional visualiza apenas a própria agenda.

**FR-D3.** Cada entrada na agenda exibe: nome da cliente, serviço, horário, status do agendamento (*aguardando confirmação* / *confirmado* / *cancelado* / *concluído* / *não compareceu*) e indicador de origem. *(ver FR-K4)*

**FR-D4.** O painel permite cancelar agendamentos, respeitando a matriz de permissões. *(ver FR-I2)*

**FR-D5.** Dono e funcionário podem criar agendamentos manualmente pelo painel, selecionando: profissional, serviço, data, horário e cliente. Profissional pode criar agendamentos manuais apenas para si próprio. *(ver FR-I2)*

**FR-D6.** Agendamentos criados manualmente entram com status *confirmado* automaticamente — quem cria pelo painel já sabe que o horário está garantido; não passa por fluxo de confirmação.

**FR-D7.** No cadastro de agendamento manual, o campo de contato WhatsApp do cliente é opcional — o profissional pode atender clientes que chegam pessoalmente ou por ligação sem número de WhatsApp cadastrado.

**FR-D8.** Agendamentos manuais cujo cadastro de cliente não possui número de WhatsApp não disparam nenhuma notificação automática para a cliente. A comunicação com a cliente é responsabilidade de quem criou o agendamento.

**FR-D9.** O painel permite marcar manualmente um agendamento *confirmado* como *não compareceu* (no-show), respeitando a matriz de permissões (FR-I2). No MVP é registro informativo: sem automação (nenhuma detecção automática de falta), sem notificação à cliente. O status habilita futuro relatório de faltas. *(ver DL-023)*

---

### FR-E: Painel Web — Clientes

**FR-E1.** O painel mantém cadastro de clientes com: nome, contato WhatsApp e data do primeiro agendamento.

**FR-E2.** Cada cadastro de cliente exibe o histórico completo de agendamentos: serviço, data, status e profissional.

**FR-E3.** É possível adicionar observações livres ao cadastro de uma cliente (preferências, alergias, histórico de serviço).

**FR-E4.** No cadastro manual de cliente (criado pelo painel), o campo **nome** é obrigatório. Contato WhatsApp, e-mail e demais campos são opcionais.

`[ASSUMPTION]` Clientes são cadastradas automaticamente na primeira interação via WhatsApp, usando o nome do perfil e o número como dados iniciais. Não há cadastro manual obrigatório antes do primeiro agendamento via bot.

---

### FR-F: Painel Web — Pagamentos

**FR-F1.** O painel permite registrar manualmente o recebimento de pagamento por agendamento: valor e forma de pagamento. A forma de pagamento é selecionada via dropdown com as opções: **Dinheiro / PIX / Cartão de débito / Cartão de crédito / Outro**.

**FR-F2.** Dono: visualiza registros de pagamento de todos os profissionais e pode registrar pagamento de qualquer agendamento.

**FR-F3.** Profissional: visualiza e registra pagamentos apenas dos próprios agendamentos.

**FR-F4.** Funcionário: registra pagamentos de qualquer agendamento; **não** visualiza relatórios financeiros consolidados nem totais por profissional.

**FR-F5.** Não há integração com gateway de pagamento no MVP. O registro é manual e informativo (sem conciliação automática, sem emissão de recibo).

---

### FR-G: Painel Web — Configurações

**FR-G1.** O dono configura os serviços oferecidos: nome, duração e preço de cada serviço.

**FR-G2.** O dono configura os horários de atendimento por profissional: dias da semana ativos e faixa de horário (início e fim).

**FR-G3.** O dono configura o intervalo entre agendamentos consecutivos (tempo de folga para o profissional entre um serviço e o seguinte).

**FR-G4.** O dono gerencia os profissionais da instalação: convidar novo usuário, ativar e desativar acesso.

**FR-G5.** O dono define e altera o nível de permissão de cada usuário (dono / profissional / funcionário).

**FR-G6.** O dono acessa as configurações de personalização da instalação. *(ver FR-J)*

---

### FR-H: Acesso mobile do painel (responsivo/PWA)

> *Reformulado por **DL-051** (revoga **DL-018** e o "app mobile somente leitura"). O acesso mobile é o **próprio painel**, responsivo e instalável como PWA, com **funcionalidade completa** — não um app nativo separado de leitura.*

**FR-H1.** No celular, o painel exibe a agenda do usuário autenticado em visões de dia e semana.

**FR-H2.** No celular, o painel lista **e trata** os agendamentos com status *aguardando confirmação*: **confirmar e recusar** estão disponíveis (as mesmas ações do desktop) *(ver FR-B2; **DL-051** revoga a leitura-apenas de **DL-018**)*.

**FR-H3.** *(**Reabilitado por DL-051** — a recusa está disponível no celular por ser a mesma tela do painel; havia sido removido por DL-018.)*

**FR-H4.** O painel é **instalável como PWA** (adicionar à tela inicial) em iOS e Android; **sem app nativo separado** no MVP.

**Nota MVP:** acesso mobile = **painel responsivo instalável**, com **funcionalidade completa** (não somente leitura) — o profissional visualiza a agenda, e confirma/recusa/cria/cancela/remarca como no desktop. Agendamentos criados pelo celular usam a origem `manual` (as mesmas telas do painel). A origem `app` no enum de FR-K1 fica **sem uso** (reservada). A criação por bot WhatsApp segue com origem `whatsapp`.

**Superado por DL-051:** confirmar/recusar e criar pelo celular **deixam de ser "feature futura"** — são as mesmas telas do painel, agora responsivas/PWA, sem mudança de backend (os endpoints já existem — ver FR-B2). A evolução futura remanescente é apenas empacotamento (ex.: subdomínio por marca), não paridade de ações.

---

### FR-I: Permissões e Controle de Acesso

**FR-I1.** O controle de acesso é modelado em **dois eixos independentes** por usuário (ver DL-022):

1. **Nível de acesso** — o que o usuário pode fazer no sistema. Três valores fixos: **Dono**, **Gestão** e **Básico**.
2. **Atende clientes** — se o usuário tem agenda de atendimento própria. Booleano: **sim** / **não**.

Os eixos são combináveis livremente — papéis **não** são mutuamente exclusivos. Uma mesma pessoa pode acumular função administrativa e agenda de atendimento. Exemplos:

| Pessoa | Nível de acesso | Atende clientes |
|---|---|:---:|
| Dona que também atende | Dono | sim |
| Manicure que também recepciona | Gestão | sim |
| Recepcionista pura (caixa) | Gestão | não |
| Profissional puro | Básico | sim |

O atributo **atende clientes** determina se o usuário aparece no cálculo de disponibilidade do bot e pode ser atribuído como `professional_id` de um agendamento — independentemente do nível de acesso.

> **Mapa de compatibilidade de termos:** ao longo deste PRD, onde se lê *"funcionário"* entenda **nível de acesso Gestão**; onde se lê *"profissional"* entenda **usuário que atende clientes** (tipicamente nível Básico, mas Dono e Gestão também podem atender). As regras de "próprios" vs. "todos" nos demais FRs seguem o nível de acesso conforme a matriz FR-I2.

**FR-I2.** Matriz de permissões por **nível de acesso**:

| Capacidade | Dono | Gestão | Básico |
|---|:---:|:---:|:---:|
| Ver a própria agenda (se atende clientes) | ✓ | ✓ | ✓ |
| Ver agenda de outros que atendem | ✓ | ✓ | ✗ |
| Criar agendamento manualmente | ✓ todos | ✓ todos | ✓ próprios |
| Confirmar/recusar agendamentos | ✓ todos | ✓ todos | ✓ próprios |
| Cancelar agendamentos pelo painel | ✓ todos | ✓ todos | ✓ próprios |
| Cadastrar e visualizar clientes | ✓ | ✓ | ✓ |
| Registrar pagamento recebido | ✓ todos | ✓ todos | ✓ próprios |
| Visualizar relatórios financeiros consolidados | ✓ | ✗ | ✗ |
| Configurar serviços, horários e intervalos | ✓ | ✗ | ✗ |
| Gerenciar usuários e permissões | ✓ | ✗ | ✗ |
| Configurar personalização da instalação | ✓ | ✗ | ✗ |

> *"próprios"* para o nível Básico = agendamentos cujo `professional_id` é o próprio usuário ou está não atribuído (nulo). O eixo **atende clientes** não altera a matriz acima (que rege o nível de acesso); ele apenas define se o usuário possui agenda própria e entra na disponibilidade.

**FR-I3.** Uma instalação tem exatamente um usuário com nível de acesso **Dono**. O nível Dono não pode ser removido sem transferência prévia para outro usuário.

**FR-I4.** Os dados de cada instalação (profissionais, clientes, agendamentos, pagamentos) são completamente isolados das demais instalações. Um usuário autenticado não pode acessar dados de outra instalação. *(ver NFR-S1)*

---

### FR-K: Rastreabilidade de Origem

**FR-K1.** Todo agendamento registra obrigatoriamente sua origem: `whatsapp` (iniciado pela cliente via bot), `manual` (criado por dono, profissional ou funcionário pelo painel — desktop **ou** celular, por serem as mesmas telas, DL-051) ou `app` (reservado — sem uso no MVP).

**FR-K2.** Agendamentos com origem `manual` registram o identificador do usuário criador (dono, profissional ou funcionário) para fins de auditoria.

**FR-K3.** O status inicial do agendamento é determinado pela origem:
- `whatsapp` → entra com status *aguardando confirmação* (exige confirmação do profissional)
- `manual` → entra com status *confirmado* (quem cria pelo painel já garantiu o horário)

**FR-K4.** A agenda exibe a origem de cada agendamento de forma visualmente distinguível — ícone ou indicador de cor diferente para origem `whatsapp` vs. `manual`.

**FR-K5.** A agenda oferece filtro por origem de agendamento.

---

### FR-J: Personalização e Identidade

**FR-J1.** Cada instalação possui identidade visual própria: nome do profissional/salão, logotipo e cor primária.

**FR-J2.** O bot de WhatsApp assina as mensagens com o nome da instalação — a cliente interage com "a Agenda da Cris" ou "o Studio Ana", não com uma plataforma genérica.

**FR-J3.** O painel (desktop e celular) exibe o nome e o logotipo da instalação.

**FR-J4.** O painel web suporta tema claro e escuro, selecionável pelo próprio usuário nas preferências.

**FR-J5.** A personalização é configurada por Renato durante o setup presencial. Não há editor visual self-service no MVP.

---

## 9. Requisitos Não-Funcionais

### NFR-A: Desempenho

**NFR-A1.** O bot deve responder a mensagens da cliente em até 3 segundos em condições normais de operação.

**NFR-A2.** As páginas do painel web devem carregar em até 2 segundos em conexão 4G.

**NFR-A3.** O painel detecta novos agendamentos pendentes via polling em segundo plano, a cada 15–30 segundos, sem nunca recarregar a página inteira: a atualização afeta somente o badge de pendentes e dispara um toast de aviso, preservando modais abertos e texto em edição. Evolução futura: substituir por push em tempo real (WebSocket/SSE) quando o volume de instalações justificar — sem necessidade de reescrever a fonte de verdade *(ver DL-019)*.

---

### NFR-C: Confiabilidade

**NFR-C1.** O sistema deve garantir atomicidade na criação de agendamentos. Dois clientes concorrendo pelo mesmo slot devem resultar em exatamente um pré-agendamento registrado; o outro cliente recebe resposta de indisponibilidade imediatamente.

**NFR-C2.** O sistema deve monitorar a conectividade com o provider de WhatsApp e alertar Renato em caso de queda ou falha de entrega de mensagem.

**NFR-C3.** Em caso de falha temporária do provider de WhatsApp, o sistema deve registrar as mensagens recebidas e processá-las assim que a conectividade for restaurada, sem perda de contexto de fluxo em andamento.

---

### NFR-S: Segurança e Privacidade

**NFR-S1.** Os dados de cada instalação são isolados por identificador de tenant. Nenhuma consulta ao banco de dados pode retornar dados de outra instalação como efeito colateral.

**NFR-S2.** Dados de clientes finais (nome, número de WhatsApp, histórico de serviços) são tratados conforme a LGPD. O sistema não compartilha dados de clientes entre instalações.

**NFR-S3.** Autenticação no painel (desktop e celular) deve utilizar mecanismo seguro com controle de sessão e expiração de token.

---

### NFR-O: Operação e Extensibilidade

**NFR-O1.** O custo total de infraestrutura na fase de lançamento deve ser mantido em até R$130/mês, compartilhado entre todos os tenants ativos.

**NFR-O2.** A arquitetura deve acomodar crescimento no número de tenants sem reescrita dos componentes centrais.

**NFR-O3.** O sistema deve abstrair a integração com o provider de WhatsApp de forma que a troca de provider (ex: de Evolution API para Cloud API Meta) não exija alteração na lógica de negócio. No MVP, opera com um único provider ativo por instalação, definido durante o setup.

**NFR-O4.** O mesmo princípio de abstração se aplica ao gateway de pagamento: a troca de gateway deve ser possível sem impacto no core do produto. (Não há gateway integrado no MVP; o princípio se aplica quando a feature for implementada.)

---

## 10. Fora do Escopo — MVP

Os itens abaixo são explicitamente excluídos do MVP. Qualquer demanda que se enquadre aqui é tratada como épico futuro.

**Funcionalidades de produto:**
- Atribuição de profissional específico a agendamentos originados pelo bot (`professional_id` é nullable no MVP; atribuição é operacional, não digital)
- Auto-confirmação de agendamentos via bot (configuração futura: "confirmar automaticamente se houver slot livre, sem aprovação manual")
- Integração com IA/LLM no fluxo do WhatsApp ou no painel web
- Pagamento dentro do fluxo do WhatsApp (PIX ou cartão via bot)
- Sinal/adiantamento configurável pelo profissional
- Cancelamento automático por timeout do profissional (sem resposta → cancelamento)
- Lembretes proativos de agenda (aviso antecipado ao cliente antes do horário)
- Múltiplos serviços no mesmo agendamento (combos)
- Política de antecedência mínima para cancelamento
- Lista de espera para horários ocupados
- Folga/ausência pontual de profissional por data específica (bloquear um dia sem mudar o padrão semanal — exige tabela de ausências; ver `addendum.md` §C.8)

**Infraestrutura e canal:**
- Segundo provider de WhatsApp e seleção de provider pelo profissional/cliente
- Integração com outros canais (Instagram DM, Telegram, e-mail, SMS)

**Painel e relatórios:**
- Relatórios financeiros avançados (faturamento por período, por serviço, projeções)
- Integração com gateway de pagamento (Asaas/PIX no painel — apenas registro manual no MVP)
- Editor visual self-service de personalização (nome/logo/cores editáveis pelo profissional sem Renato)

**Distribuição:**
- Marketplace ou descoberta de profissionais
- Self-service de onboarding (instalação sem intervenção de Renato)

---

## 11. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Bloqueio/banimento do número WhatsApp quando usando provider não-oficial (Evolution API) | Médio | Alto | Monitoramento contínuo de conectividade (NFR-C2); procedimento documentado de recuperação de número; avaliar Cloud API Meta para clientes que exigem número dedicado |
| Profissional usar o Tamarcado mas manter WhatsApp manual em paralelo | Alto | Alto | Onboarding presencial com demonstração do fluxo completo; acompanhamento semanal nos primeiros 30 dias de cada cliente |
| Profissional não confirmar agendamentos a tempo — cliente abandona | Alto | Médio | Bot notifica cliente "em análise" para segurar o contato; timeout de 2h em horário comercial calibrado para urgência real |
| Race condition não resolvida → duplo agendamento | Baixo | Alto | Atomicidade garantida por transação com lock (NFR-C1); coberto por teste de concorrência antes do go-live |
| Custo de infraestrutura por tenant crescer acima de R$130/mês no início | Baixo–Médio | Médio | Monitorar custo por tenant ativo a cada 5 clientes novos; ajustar pricing antes de escalar |
| Concorrente lança feature equivalente de bot WhatsApp | Médio | Médio | Velocidade de execução é vantagem atual; MVP no ar em 90 dias; tração e NPS são o diferencial sustentável |

---

## 12. Questões em Aberto

| # | Questão | Impacto | Responsável | Revisão |
|---|---|---|---|---|
| QA-1 | Horário comercial para contagem do timeout de 2h definido como 08h–19h seg–sáb. Confirmar se há variação por instalação (ex: salões que operam aos domingos ou com horário estendido). | Baixo — afeta configurações; não bloqueia arquitetura | Renato | Antes do épico de configurações |
| QA-2 | ~~Funcionário pode ter agenda de atendimento própria (acumulando papel de profissional) ou os papéis são mutuamente exclusivos?~~ **RESOLVIDA (DL-022):** Papéis NÃO são mutuamente exclusivos. Modelo de dois eixos independentes — *nível de acesso* (Dono/Gestão/Básico) + *atende clientes* (sim/não). Ver FR-I1/FR-I2 reescritos. | — | — | Fechada em 2026-06-18 |
| QA-3 | O número WhatsApp associado à instalação é o número pessoal do profissional ou um número dedicado para o bot? A resposta impacta diretamente a escolha de provider por cliente. | Alto — define a configuração de infraestrutura de WhatsApp | Renato | Antes do épico de WhatsApp provider |
| QA-4 | ~~Em instalações multi-profissional: quando a cliente manda mensagem para o número do salão, como o bot identifica o profissional de destino do agendamento?~~ **RESOLVIDA (DL-013):** O bot não identifica nem atribui profissional. O agendamento entra sem `professional_id`. Atribuição de profissional é feature futura. | — | — | Fechada em 2026-06-15 |

---

*Workspace: `_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/`*
*Log de decisões: `.decision-log.md`*
*Decisões arquiteturais e roadmap de produto: `addendum.md`*
