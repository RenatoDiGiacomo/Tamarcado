# Addendum — PRD Tamarcado

Conteúdo que complementa o PRD mas não pertence ao corpo principal: decisões arquiteturais, análises de opções, roadmap de produto e observações de profundidade técnica. Destinado principalmente a Winston (arquitetura) e para referência de Renato nas decisões de implementação.

---

## A. Decisões Arquiteturais

### A.1 Monolito Modular (não microsserviços)

**Decisão:** Backend em NestJS organizado como monolito modular.

**Justificativa:** domínio novo, dev solo, sem carga de produção para justificar a complexidade operacional de microsserviços (orquestração, service discovery, latência inter-serviço, deploys independentes). Modularidade interna do NestJS (módulos com fronteiras claras) permite extrair serviços futuramente sem reescrita, se a necessidade surgir.

**Implicação para arquitetura:** definir fronteiras de módulo desde o início (ex: módulo de agendamento, módulo de WhatsApp, módulo de pagamento, módulo de auth/tenant) para não criar um monolito de espaguete.

---

### A.2 Multi-tenancy via `company_id`

**Decisão:** banco MySQL único compartilhado entre todos os tenants, com isolamento por coluna `company_id` em todas as tabelas de dados.

**Justificativa:** custo de R$130/mês total inviabiliza um banco por cliente. `company_id` como discriminador é o padrão mais simples para multi-tenancy shared-schema. Risco de vazamento entre tenants é mitigado por: (a) coluna obrigatória em todas as queries de domínio, (b) middleware de NestJS que injeta e valida `company_id` em cada request autenticado.

**Para Winston revisar:** estratégia de índices compostos `(company_id, ...)` em todas as tabelas de alto volume; política de backup e restore por tenant.

---

### A.3 Abstração de Provider WhatsApp

**Decisão:** interface `WhatsAppProvider` com duas implementações planejadas:

| Provider | Quando usar | Status no MVP |
|---|---|---|
| Evolution API (self-hosted) | Profissional já tem número pessoal estabelecido que quer manter | Implementar e ativar |
| Cloud API oficial Meta | Número novo dedicado; cliente exige conformidade ou estabilidade garantida | Implementar como módulo plugável; ativar por instalação conforme perfil |

**No MVP:** apenas um dos dois providers é ativado por instalação, definido por Renato no setup. A escolha é feita com base no perfil do primeiro lote de clientes.

**Implicação de produto (ver QA-3 no PRD):** se o profissional usa o número pessoal → Evolution API. Se a instalação usa número dedicado → Cloud API Meta (setup mais burocrático: Meta Business, CNPJ, aprovação de template de mensagens).

**Para Winston:** definir o contrato da interface `WhatsAppProvider` (métodos: `sendMessage`, `onIncomingMessage`, `getConnectionStatus`) de forma que ambos os providers sejam substituíveis sem alterar os módulos de agendamento ou notificação.

---

### A.4 Abstração de Gateway de Pagamento

**Decisão:** interface `PaymentGateway` abstrata, mesma lógica da abstração de WhatsApp.

**No MVP:** sem integração real. O registro de pagamento é manual no painel. A abstração é preparada para quando o PIX e o cartão entrarem no fluxo (épico futuro).

**Provider provável:** Asaas (já avaliado; suporta PIX, split, assinatura recorrente — alinhado com o modelo de mensalidade do Tamarcado).

---

## B. Projeção de Custo de Infraestrutura (referência)

Estimativa para fase de lançamento (até ~10 clientes):

| Item | Referência de custo |
|---|---|
| VPS (backend + banco) | R$50–80/mês |
| Evolution API self-hosted | R$0 (no mesmo VPS) |
| Armazenamento de logos/assets | R$5–10/mês |
| **Total estimado** | **R$55–90/mês** |

Confortavelmente dentro da restrição de R$130/mês. Monitorar custo por tenant ativo a cada 5 clientes novos; se custo/tenant subir acima de R$15/mês, reavaliar tier de infraestrutura.

IA (quando entrar): Haiku 4.5 (~R$30–70/mês por profissional com uso intensivo de bot). A mensalidade atual (R$99–300/mês) já absorve esse custo com margem.

---

## C. Roadmap de Produto — Épicos Futuros

Itens confirmados como fora do MVP, com contexto de por que foram adiados:

### C.1 IA no Fluxo do WhatsApp
Interpretação de linguagem natural no bot (hoje o fluxo é estruturado/guiado). Substituiria o fluxo de perguntas sequenciais por uma conversa mais natural ("Quero marcar cabelo na quinta à tarde" → sistema interpreta diretamente).

**Por que é futuro:** custo de IA por conversa é real (~R$30–70/mês por profissional pesado). A mensalidade atual suporta, mas é melhor validar o produto sem a complexidade e custo de IA primeiro.

### C.2 Pagamento dentro do WhatsApp
PIX ou cartão configurável dentro do fluxo de agendamento (sinal/adiantamento).

**Por que é futuro:** adiciona complexidade de integração com gateway, reconciliação, política de reembolso em cancelamento. Não é o problema que o MVP resolve.

### C.3 Lembretes Proativos
Aviso automático para a cliente antes do horário agendado ("Olá Joana, lembrando seu corte amanhã às 9h com a Fernanda!").

**Por que é futuro:** feature muito desejada mas não bloqueia a proposta central do MVP.

### C.4 Combos de Serviços
Múltiplos serviços no mesmo agendamento (ex: pé+mão, sobrancelha+cílios).

**Por que é futuro:** comum no ramo; adiado para não complicar o modelo de dados e o fluxo do bot no MVP.

### C.4-bis Atribuição de Profissional a Agendamentos via Bot

No MVP, `professional_id` é nullable. Agendamentos originados pelo bot entram sem profissional atribuído — a atribuição acontece operacionalmente (dono ou funcionário decide e informa ao profissional). O modelo de dados deve suportar `professional_id` opcional desde o início para permitir atribuição futura sem migração de schema.

**Quando implementar:** após validar o fluxo sem atribuição com os primeiros 5 clientes. A pergunta é se os profissionais sentem falta de visibilidade no dashboard ("não sei se esse horário é meu") ou se a atribuição operacional é suficiente.

### C.5 Segundo Provider de WhatsApp e Seleção pelo Cliente
Permitir que o profissional escolha o provider (Evolution API vs. Cloud API) no painel, sem intervenção de Renato.

**Por que é futuro:** requer UI de configuração de provider + suporte a migração de número. No MVP, a escolha é feita no setup por Renato.

### C.6 Cancelamento Automático por Timeout
Se o profissional não responder em 2h, o agendamento é automaticamente cancelado e o cliente notificado.

**Por que é futuro:** cancelamento automático sem decisão humana tem risco de experiência negativa (profissional pode estar legítima e temporariamente indisponível). No MVP, o comportamento é mais seguro: bot avisa "em análise".

### C.7 Política de Antecedência Mínima para Cancelamento
Cancelamento só permitido até X horas antes do horário.

**Por que é futuro:** não bloqueia a validação do MVP; adicionar essa lógica depois é simples.

### C.8 Folga/Ausência Pontual por Data Específica
Marcar um profissional como indisponível em **uma data específica** (ex: não atende em 15/07), como exceção pontual — **sem** alterar o padrão semanal dele.

**Distinção importante (não confundir com a Story 1.6):** o `professional_schedules.is_active` e o padrão semanal (dias/faixas) da 1.6 servem para a disponibilidade **recorrente** e mudanças de **longo prazo/permanentes** (gravidez, licença, doença prolongada, mudança de rotina por outro emprego). A folga pontual é uma **exceção de curto prazo numa data específica** — a agenda recorrente continua igual, só aquele dia é bloqueado.

**Implicação de arquitetura:** exige uma **tabela nova de ausências/bloqueios por data** (ex.: `professional_absences` com `company_id`, `professional_id`, `date` [ou intervalo `start_date`/`end_date`], `reason` opcional; índice liderado por `company_id`). O `AvailabilityService` (Épico 2) passaria a subtrair, além dos slots ocupados por agendamentos, os dias com bloqueio pontual. Modelar como camada **aditiva** sobre o padrão semanal — não altera `professional_schedules`.

**Por que é futuro:** o MVP resolve a disponibilidade recorrente (1.6) e a agenda; a folga pontual é refinamento de UX operacional que só compensa quando houver demanda real. A tese "camada aditiva de bloqueios por data" mantém a migração futura barata (não mexe no schema da 1.6).

**Quando implementar:** priorizar quando os primeiros clientes reais pedirem — provável gatilho: profissional que precisa "fechar" um dia específico (folga, viagem, consulta) sem bagunçar o padrão semanal.

---

## D. Tese de Longo Prazo

O WhatsApp é o sistema operacional do relacionamento com cliente no Brasil. Quem construir a melhor experiência de serviço *dentro* do WhatsApp — não ao redor dele — captura o mercado que as ferramentas de link externo e app dedicado nunca vão alcançar.

Se o MVP validar a tese (fluxo 100% WhatsApp resolve agenda para autônomos de beleza), o Tamarcado tem um caminho natural de expansão: IA no fluxo conversacional (6–12 meses), pagamento PIX via bot (6–12 meses), expansão para outros segmentos de serviço pessoal (barbearias, clínicas de estética, personal trainers, 12–24 meses).
