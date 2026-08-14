---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/addendum.md"
  - "_bmad-output/planning-artifacts/architecture/arch-Tamarcado-2026-06-15/architecture.md"
  - "_bmad-output/planning-artifacts/ux/ux-Tamarcado-2026-06-15/ux-spec.md"
---

# Tamarcado - Epic Breakdown

## Overview

Este documento decompõe os requisitos do PRD, da UX Design Spec e da Arquitetura em épicos e histórias implementáveis para o MVP do Tamarcado (entrega até 13/09/2026).

## Requirements Inventory

### Functional Requirements

**FR-A: Bot de Agendamento (WhatsApp — inbound da cliente)**

- FR-A1: Reconhecer mensagens com intenção de agendar via correspondência de palavras-chave/frases configuráveis por instalação; iniciar fluxo sem intervenção do profissional.
- FR-A2: Fluxo em 3 etapas: serviço → dia disponível (bot apresenta) → horário disponível (bot apresenta).
- FR-A3: Slot disponível = pelo menos 1 profissional livre no horário; bot não revela qual profissional.
- FR-A4: Ao confirmar horário, registra pré-agendamento com status *aguardando confirmação* e `professional_id` nulo; notifica dono/funcionário (multi) ou profissional (solo).
- FR-A5: Sem disponibilidade no dia escolhido → bot apresenta outros dias.
- FR-A6: Atomicidade na criação — dois clientes concorrendo pelo mesmo slot resultam em 1 pré-agendamento; o outro recebe indisponibilidade imediata (ver NFR-C1).
- FR-A7: Fallback para entradas não reconhecidas, redirecionando ao passo atual do fluxo.
- FR-A8: Um agendamento = um único serviço (MVP). *(Evolução multi-serviço — DL-040: N agendamentos agrupados por `group_id` (UUID nullable, aditivo), encadeados no tempo; preserva `AvailabilityService`/`price_snapshot`/D4. O bot vira carrinho — ver Stories 6.2/6.3.)*
- `[ASSUMPTION]` Notificação FR-A4 via WhatsApp: solo → número do profissional; multi → número do dono/gestão configurado.

**FR-B: Confirmação e Recusa pelo Profissional**

- FR-B1: Notificação de nova solicitação com nome, serviço, data, horário; aparece na agenda como *aguardando confirmação* sem profissional atribuído.
- FR-B2: Confirmação/recusa pelas **telas do painel** — não pelo WhatsApp do bot (o número é dedicado à Evolution API; o profissional não responde por ele). O painel é acessível **também no celular** (responsivo/PWA — DL-051), com as **ações completas**: não há restrição de "somente leitura" (a premissa do canal WhatsApp segue; a limitação do app mobile de DL-018 foi **revogada**).
- FR-B3: Confirmado → status *confirmado* + mensagem de confirmação automática à cliente.
- FR-B4: Recusa exige justificativa obrigatória; sem justificativa, recusa não processada.
- FR-B5: Recusa com justificativa → bot notifica cliente com motivo e sugere outras datas/horários.
- FR-B6: Timeout de 2h em horário comercial sem resposta → bot notifica cliente "em análise"; status permanece *aguardando confirmação* (sem cancelamento automático no MVP).
- `[ASSUMPTION]` Horário comercial = 08h–19h, seg–sáb. Contador pausa fora do horário comercial e retoma no próximo (ver QA-1).

**FR-C: Cancelamento**

- FR-C1: Cliente cancela enviando mensagem com intenção de cancelar no WhatsApp.
- FR-C2: Bot identifica intenção, apresenta dados do agendamento para confirmação; se houver múltiplos futuros, pergunta qual cancelar.
- FR-C3: Confirmado o cancelamento → status *cancelado*, slot liberado, notificação automática ao profissional.
- FR-C4: Dono, profissional e funcionário podem cancelar pelo painel web respeitando matriz de permissões (FR-I2).
- FR-C5: Sem política de antecedência mínima no MVP.
- FR-C6: Cancelamento via painel/app por dono/profissional/funcionário → notificação WhatsApp automática à cliente (se número cadastrado) com cancelamento e oferta de reagendamento imediato. Sem número cadastrado → sem notificação (consistente com FR-D8).

**FR-D: Painel Web — Agenda**

- FR-D1: Agenda em três visões: dia, semana, mês.
- FR-D2: Dono/funcionário veem agenda de todos os profissionais; profissional vê só a própria.
- FR-D3: Cada entrada exibe cliente, serviço, horário, status e indicador de origem (FR-K4).
- FR-D4: Painel permite cancelar agendamentos respeitando matriz de permissões (FR-I2).
- FR-D5: Dono/funcionário criam agendamento manual para qualquer profissional; profissional só para si (FR-I2).
- FR-D6: Agendamento manual entra com status *confirmado* automaticamente (sem fluxo de aprovação).
- FR-D7: Campo de WhatsApp da cliente é opcional no agendamento manual.
- FR-D8: Agendamento manual sem WhatsApp da cliente não dispara notificação automática; comunicação é responsabilidade de quem criou.
- FR-D9: Marcar manualmente um agendamento *confirmado* como *não compareceu* (no-show) no painel, respeitando a matriz de permissões. Informativo no MVP (sem automação, sem notificação à cliente); habilita relatório de faltas futuro (DL-023).

**FR-E: Painel Web — Clientes**

- FR-E1: Cadastro com nome, contato WhatsApp e data do primeiro agendamento.
- FR-E2: Histórico completo de agendamentos por cliente (serviço, data, status, profissional).
- FR-E3: Observações livres no cadastro da cliente.
- FR-E4: No cadastro manual, nome é obrigatório; WhatsApp/e-mail/demais campos opcionais.
- `[ASSUMPTION]` Clientes cadastradas automaticamente na 1ª interação via WhatsApp (nome do perfil + número); sem cadastro manual obrigatório prévio.

**FR-F: Painel Web — Pagamentos**

- FR-F1: Registro manual de pagamento por agendamento — valor + forma de pagamento via dropdown (Dinheiro/PIX/Cartão débito/Cartão crédito/Outro).
- FR-F2: Dono visualiza e registra pagamento de todos os profissionais.
- FR-F3: Profissional visualiza/registra só os próprios.
- FR-F4: Funcionário registra pagamentos de qualquer agendamento; sem acesso a relatórios financeiros consolidados.
- FR-F5: Sem integração com gateway no MVP — registro manual e informativo.

**FR-G: Painel Web — Configurações**

- FR-G1: Dono configura serviços (nome, duração, preço).
- FR-G2: Dono configura horários de atendimento por profissional (dias + faixa de horário).
- FR-G3: Dono configura intervalo entre agendamentos consecutivos.
- FR-G4: Dono gerencia profissionais (convidar, ativar/desativar acesso).
- FR-G5: Dono define/altera nível de permissão de cada usuário.
- FR-G6: Dono acessa configurações de personalização da instalação (ver FR-J).

**FR-H: Acesso mobile do painel (responsivo/PWA)** *(reformulado por DL-051 — antes "App Mobile do Profissional, somente leitura")*

- FR-H1: Agenda do usuário autenticado em visões dia/semana, **no painel responsivo pelo celular** (mesma tela do desktop).
- FR-H2: Lista **e tratamento** dos pendentes (confirmar/recusar) pelo celular — as mesmas telas do painel (DL-051; revoga a restrição de "somente leitura" de DL-018).
- FR-H3: *(**Reabilitado por DL-051** — a recusa está disponível no celular por ser a mesma tela Pendentes do painel; havia sido removido por DL-018.)*
- FR-H4: **Instalável como PWA** (adicionar à tela inicial) em iOS e Android; **sem app nativo separado** no MVP.
- Nota MVP: acesso mobile = **painel responsivo instalável**, com **funcionalidade completa** (não somente leitura). Agendamentos criados pelo celular usam a mesma origem/telas do painel (origem `manual`), não uma origem `app` à parte.

**FR-I: Permissões e Controle de Acesso**

- FR-I1: Controle de acesso em dois eixos independentes (DL-022): **nível de acesso** (Dono/Profissional/~~Básico~~) + **atende clientes** (sim/não). Papéis não são mutuamente exclusivos — uma pessoa pode acumular função administrativa e agenda própria. "Atende clientes" determina quem entra na disponibilidade e pode ser `professional_id`. *(**Revisado — DL-062, 2026-08-12:** o papel **"Básico" é aposentado** (ficam **Dono/Profissional**); soma-se o eixo de **visibilidade de MÓDULO** — quem não tem acesso não vê o menu — controlado por **toggles por pessoa** na tela de Equipe. O eixo "atende clientes" permanece.)*
- FR-I2: Matriz de permissões por nível de acesso (ver tabela no PRD): Dono e Profissional agem sobre todos; ~~Básico só sobre os próprios/não atribuídos~~. Só Dono vê relatórios consolidados, configura sistema e gerencia usuários. *(**Revisado — DL-062:** a matriz de **ações** permanece; soma-se o eixo de **visibilidade de MÓDULO** (Financeiro/Dashboard/Equipe são menus próprios e só aparecem para quem tem o toggle). **Profissional por padrão** vê **só os próprios agendamentos e as clientes que atende** — sem Financeiro/Dashboard/admin. Toggles por pessoa (só o Dono, OFF por padrão); o **Dono não pode remover o próprio acesso**; bloqueio **também no backend**.)*
- FR-I3: Exatamente um usuário com nível Dono por instalação; não pode ser removido sem transferência prévia.
- FR-I4: Isolamento completo de dados entre instalações (ver NFR-S1).

**FR-J: Personalização e Identidade**

- FR-J1: Identidade visual própria por instalação (nome, logo, cor primária).
- FR-J2: Bot assina mensagens com nome da instalação.
- FR-J3: Painel web e app exibem nome e logo da instalação.
- FR-J4: Painel suporta tema claro/escuro, selecionável pelo usuário.
- FR-J5: Personalização configurada por Renato no setup presencial; sem editor self-service no MVP.

**FR-K: Rastreabilidade de Origem**

- FR-K1: Todo agendamento registra origem obrigatória: `whatsapp` / `manual` / `app` (reservado, não usado no MVP).
- FR-K2: Origem `manual` registra o usuário criador para auditoria.
- FR-K3: Status inicial por origem — `whatsapp` → *aguardando confirmação*; `manual` → *confirmado*.
- FR-K4: Agenda exibe origem de forma visualmente distinguível (ícone/cor).
- FR-K5: Agenda oferece filtro por origem.

### NonFunctional Requirements

- NFR-A1: Bot responde a mensagens em até 3 segundos em condições normais.
- NFR-A2: Páginas do painel carregam em até 2 segundos em 4G.
- NFR-A3: Painel detecta novos pendentes via polling em segundo plano (15–30s), sem nunca recarregar a página — atualiza só o badge de pendentes e dispara toast, preservando modais abertos e texto em edição. Evolução futura: WebSocket/SSE (ver DL-019).
- NFR-C1: Atomicidade garantida na criação de agendamentos — concorrência pelo mesmo slot resulta em exatamente 1 registro; o outro recebe indisponibilidade imediata.
- NFR-C2: Monitoramento de conectividade com o provider WhatsApp; alerta a Renato em caso de queda/falha de entrega.
- NFR-C3: Falha temporária do provider WhatsApp → mensagens recebidas são registradas e processadas na volta da conectividade, sem perda de contexto de fluxo em andamento.
- NFR-S1: Isolamento por tenant — nenhuma query pode retornar dados de outra instalação como efeito colateral.
- NFR-S2: Dados de clientes finais tratados conforme LGPD; sem compartilhamento entre instalações.
- NFR-S3: Autenticação segura no painel e app, com controle de sessão e expiração de token.
- NFR-O1: Custo total de infraestrutura ≤ R$130/mês na fase de lançamento, compartilhado entre tenants.
- NFR-O2: Arquitetura acomoda crescimento de tenants sem reescrita dos componentes centrais.
- NFR-O3: Abstração do provider WhatsApp — troca de provider não exige alteração na lógica de negócio.
- NFR-O4: Mesmo princípio de abstração para gateway de pagamento (sem integração no MVP).

### Additional Requirements

*(extraídos de architecture.md e addendum.md)*

- Monorepo com `pnpm` workspaces: `apps/api` (NestJS), `apps/web` (React+Vite), `packages/shared-types`, `packages/shared-utils`. *(O antigo `apps/mobile` (React Native+Expo) foi **descartado por DL-051** — o acesso mobile passou a ser o próprio `apps/web` responsivo/PWA, não um app nativo separado. Ver Épico 7.)* Sem starter template de terceiros — estrutura definida do zero pela arquitetura (ver architecture.md seção 2).
- Backend como monolito modular NestJS com módulos de fronteira clara: Auth, Tenant, Users, Clients, Services, Schedules, Appointments, Notifications, WhatsApp, Payments, Reports, Installation.
- Modelo de dados MySQL 8 completo: `companies`, `users`, `clients`, `salon_services`, `professional_services`, `professional_schedules`, `appointments`, `payments`, `whatsapp_conversations` — com índices compostos liderados por `company_id`.
- Multi-tenancy: `TenantMiddleware` injeta `company_id` via `AsyncLocalStorage`; `TenantAwareRepository<T>` aplica filtro automático em toda query.
- Campo `timezone` por tenant em `companies` (default `America/Sao_Paulo`) — toda lógica de data/hora deve ler esse campo, nunca usar timezone global hardcoded.
- Campo `evolution_instance_name` por tenant — **só relevante em DEV** (Evolution é dev-only, DL-054). Em produção (Cloud API oficial), a identificação é pelo `phone_number_id`/número dedicado do tenant.
- Interface `WhatsAppProvider` (`sendMessage`, `getConnectionStatus`, `registerIncomingMessageHandler`). **Produção = WhatsApp Cloud API oficial da Meta** (o provider ativo). **Evolution API só para DESENVOLVIMENTO**, com número descartável — nunca produção (**DL-054**, 2026-08-10: a Meta baniu APIs não oficiais em 2026; o número em risco é o do cliente). A abstração permanece — é ela que torna a troca de provider barata (NFR-O3).
- Interface `PaymentGateway` (`createCharge`, `getChargeStatus`, `refund`) com `NullPaymentGateway` no MVP (lança `NotImplementedException`).
- Atomicidade de slot via transação MySQL com `SELECT ... FOR UPDATE` no momento da criação do agendamento via bot.
- **Scheduler de tarefas em MySQL (DL-056, substitui BullMQ/Redis):** tabela `scheduled_tasks` (`type`, `appointment_id`, `due_at`, `status` pending/done/cancelled, `executed_at`) + rotina **a cada minuto** (cron in-process, ex.: `@nestjs/schedule`) que executa o que venceu (`due_at <= agora`) e marca `done`; muda de estado antes do disparo → `cancelled`. Cobre `appointment_timeout` (6.5) e o lembrete (6.10). Dentro da própria API, sem serviço novo; visível/corrigível por SQL e sobrevive a reinício.
- `ConversationStateService`: estado de conversa do bot **direto no MySQL** (`whatsapp_conversations`, fonte de verdade) — **sem Redis** (DL-056).
- LGPD: campo `is_deleted` (soft delete) em `clients` e `appointments`; mecanismo de anonimização/hard delete sob solicitação do titular (procedimento manual no MVP, mas viabilizado pela arquitetura — ver architecture.md seção 3.10).
- Três ambientes: Dev (Docker Compose local, zero custo), Staging (local na máquina do desenvolvedor, build de produção via `docker-compose.staging.yml`, zero custo — staging em nuvem é evolução futura, ver ADR-010), Produção (VPS brasileiro — Hostinger preferencial ou HostGator, datacenter São Paulo, PM2 + Nginx + Certbot, ≤ R$130/mês — ver ADR-009).
- CI/CD via GitHub Actions: `ci.yml` (lint, typecheck, test, build) em todo push/PR; `deploy.yml` (SSH deploy + PM2 restart) em push para `main`.
- Backup diário de MySQL via cron → armazenamento R2/S3-compatible.
- Autenticação JWT (access 15 min + refresh 7 dias) com `JwtAuthGuard` e `RolesGuard` aplicando a matriz de permissões (FR-I2).
- Teste de carga simples no VPS antes do go-live, medindo conversas WhatsApp simultâneas suportadas; definir limite de alerta para escalar.
- `professional_id` nullable em `appointments` desde o schema inicial — suporta atribuição futura sem migração (addendum C.4-bis); validar necessidade após os primeiros 5 clientes.
- Provider WhatsApp definido por Renato no setup de cada instalação, sem UI de troca pelo cliente (addendum A.3). **Em produção é sempre a Cloud API oficial (Meta); Evolution só em dev** (DL-054) — não é mais "um vs. o outro" por instalação em produção.
- Confirmar/recusar pendentes via endpoints REST compartilhados (`PATCH /appointments/:id/confirm` e `/refuse`), consumidos pelas **telas do painel** — disponíveis **também no celular** (painel responsivo/PWA — DL-051). Não há app nativo separado nem paridade reduzida: as mesmas ações do desktop valem no mobile, sem mudança de backend.
- Notificação de pendentes no painel via polling REST (`GET /appointments/pending-count`, intervalo 15–30s, em background, sem reload) — ver NFR-A3, ADR-011, DL-019. WebSocket/SSE é evolução futura.

### UX Design Requirements

*(extraídos de ux-spec.md)*

- UX-DR1: Implementar a máquina de estados completa do bot (IDLE → SERVIÇO → DIA → HORÁRIO → AGUARD. CONFIRMAÇÃO → CONFIRMADO/RECUSADO; IDLE → CANCELAMENTO → CONFIRMA CANCELAMENTO) conforme diagrama da seção 3.1.
- UX-DR2: Implementar a biblioteca completa de mensagens de agendamento do bot (MSG-A01 a MSG-A07), incluindo regra de pular seleção quando há só 1 serviço e paginação de até 8 serviços. Inclui o passo de confirmação da cliente "1 sim / 2 não" (MSG-A05b, estado `AWAITING_CONFIRMATION`): após escolher o horário, a cliente confirma "Confirma agendar [serviço] em [dia] às [hora]?" antes de o pré-agendamento ser criado; "2" volta à seleção. Só com "1" o pré-agendamento é gravado e a cliente recebe "foi enviado ao salão, pode haver ajuste, você será avisada do aceite/recusa" (MSG-A06).
- UX-DR3: Implementar as mensagens de notificação ao profissional/dono sobre nova solicitação (MSG-B01 solo / MSG-B02 multi — ambas direcionam **ao painel**, sem "1/2" pelo WhatsApp; premissa do canal mantida sob DL-051, antes citada como DL-018) e as mensagens enviadas à cliente como resultado da decisão tomada **no painel** (que agora inclui o celular via PWA): confirmação (MSG-B04), recusa com alternativas (MSG-B05), timeout (MSG-B06). MSG-B03 e FB-07 removidos (justificativa de recusa é digitada no modal do painel, não via WhatsApp). `[OK — corrigido no ux-spec.md]` Distinção importante: o "1/2" da cliente (confirmando o próprio agendamento, MSG-A05b/UX-DR2) é mantido; o que foi removido é o "1/2" do profissional.
- UX-DR4: Implementar mensagens de cancelamento pela cliente (MSG-C01 a MSG-C06), incluindo seleção entre múltiplos agendamentos futuros (MSG-C02) e exceção de cliente sem WhatsApp (MSG-C06).
- UX-DR5: Implementar os fallbacks do bot FB-01 a FB-06, incluindo mensagem fora do fluxo (FB-05). `[CORRIGIDO — DL-018; premissa do canal mantida por DL-051]` FB-07 (profissional respondendo texto livre em vez de 1/2) **segue removido** — o profissional não confirma/recusa pelo WhatsApp do bot; ele trata pelas telas do painel (agora também no celular, via PWA). O que DL-051 revoga é a limitação de "app somente leitura", **não** essa premissa do canal WhatsApp.
- UX-DR6: Aplicar regras de copy globalmente: zero emojis, "você" não "tu", frases curtas, datas no formato `Dia, DD/MM`, horas em `HH:MM` 24h, variáveis sempre entre colchetes.
- UX-DR7: Navegação responsiva do painel — sidebar fixa em desktop (≥768px), tabs no rodapé em mobile (<768px) com menu "+" de ações rápidas e badge numérico vermelho de pendentes. Badge é atualizado por polling em segundo plano (15–30s, ver NFR-A3/DL-019), permanece visível até o salão tratar o pendente (nunca resetado por reload de página), e a chegada de um novo pendente dispara um toast momentâneo além da atualização do badge.
- UX-DR8: Tela Agenda — visões dia/semana/mês; indicadores de cor por status (amarelo/pendente, verde/confirmado, cinza/concluído, vermelho riscado/cancelado); ícone de origem (balão = whatsapp, lápis = manual); filtro por origem (`[Todos] [WhatsApp] [Manual]`); FAB "Novo agendamento"; label "Não atribuído" em itálico cinza quando `professional_id` nulo.
- UX-DR9: Tela Pendentes — confirmação inline sem modal (toast de feedback); recusa abre modal com campo de justificativa obrigatório (botão desabilitado até preenchido).
- UX-DR10: Tela Novo Agendamento Manual — busca de cliente em tempo real com criação inline via modal "+ Nova"; campo Profissional só visível para dono/funcionário; validação de data (hoje ou futura) e aviso (não bloqueio) de slot já ocupado; texto fixo "Entra como: Confirmado (sem aprovação)".
- UX-DR11: Tela Clientes — lista com busca, perfil exibindo WhatsApp, data de cadastro, observações editáveis e histórico completo de agendamentos com atalho "Novo agendamento para esta cliente".
- UX-DR12: Tela Registro de Pagamento — modal com dropdown de forma de pagamento (5 opções fixas) e atualização do agendamento para status *Concluído* ao salvar.
- UX-DR13: Tela Configurações (somente Dono) — 4 subseções: Serviços (CRUD com duração/preço), Horários de atendimento (por profissional, toggle de dia + intervalo entre atendimentos), Equipe e permissões (convite por link, troca de papel via radio), Identidade visual (nome, logo upload, cor primária).
- UX-DR14: Fluxo de convite de equipe — link de convite enviado, usuário cria a própria senha no primeiro acesso.
- UX-DR15: Tema claro/escuro como preferência individual do usuário (tela "Perfil", não em Configurações da instalação).
- UX-DR16: Acesso mobile = **painel responsivo instalável (PWA)**, com a **mesma navegação** do painel (UX-DR7: tabs no rodapé em <768px, com badge numérico de pendentes) e as **mesmas ações**. `[REVOGADO — DL-018 → DL-051]` Cai a antiga restrição "Tab Pendentes é somente leitura": no celular, Pendentes **confirma/recusa** como no desktop. Não há app nativo de 3 tabs separado; é o próprio painel no celular, com **paridade total** de ações.
- UX-DR17: Estados vazios padronizados para Agenda, Pendentes, Clientes e Histórico de cliente (textos especificados na seção 6.1).
- UX-DR18: Modal de cancelamento com texto condicional — aviso de notificação automática se cliente tem WhatsApp cadastrado; aviso de "comunicação por sua conta" se não tem.
- UX-DR19: Toast de feedback padronizado para toda ação de mutação (confirmar, recusar, cancelar, criar agendamento, registrar pagamento) — sempre com confirmação textual do que aconteceu.

### FR Coverage Map

> **Repriorização manual-first (DL-035, 2026-07-02):** o antigo Épico 2 (bot+painel) foi separado. A base de agendamento (painel/manual) vem primeiro; o bot foi adiado. Novos números de épico abaixo.

**Funcionais:**
- FR-A1–A8 → **Épico 6** (fluxo de agendamento via bot)
- FR-B1/B2/B4 → **Épico 5B** (pendentes pelo painel: aparecem na agenda + confirmar/recusar — DL-049)
- FR-B3/B5/B6 → **Épico 6** (notificar a cliente na confirmação/recusa + timeout de 2h — via bot)
- FR-C1–C3, C5, C6 → **Épico 6** (cancelamento via bot + notificação à cliente); FR-C4 (cancelar pelo painel) → **Épico 3**
- FR-D1–D9 → **Épico 3** (agenda do painel + agendamento manual + marcação de não compareceu)
- FR-E1–E4 → **Épico 4** (cadastro e histórico de clientes)
- FR-F1–F5 → **Épico 5** (registro manual de pagamentos)
- FR-G1–G6 → **Épico 1** (configurações da instalação)
- FR-H1, FR-H2, FR-H3, FR-H4 → **Épico 7** (painel responsivo instalável/PWA, **funcionalidade completa** — DL-051; FR-H3 **reabilitado**)
- FR-I1–I4 → **Épico 1** (permissões e isolamento de tenant)
- FR-J1, FR-J3, FR-J4, FR-J5 → **Épico 1** (identidade visual, tema); FR-J2 → **Épico 6** (assinatura do bot)
- FR-K1–K5 → **Épico 3** (rastreabilidade de origem, exibida na agenda)

**Não-funcionais:**
- NFR-A1 (resposta do bot ≤3s) → **Épico 6**
- NFR-A2 (painel ≤2s em 4G) → **Épico 1** (shell/transversal ao painel)
- NFR-A3 (contador de pendentes) → **Épico 5B** (contador na 5B.3)
- NFR-C1 (atomicidade na criação de agendamento) → **Épico 3** (base) / reforçada no fluxo concorrente do bot no **Épico 6**
- NFR-C3 (resiliência do WhatsApp — não perder mensagem) → **Épico 6** (mínimo na 6.8); **NFR-C2 (monitoramento/alertas) → ROADMAP** com Financeiro/Dashboard (**DL-058**)
- NFR-S1–S3 (isolamento, LGPD, autenticação) → **Épico 1**
- NFR-O1 (custo ≤R$130/mês), NFR-O2 (escalabilidade de tenants) → **Épico 1**
- NFR-O3 (abstração do provider WhatsApp) → **Épico 6**
- NFR-O4 (abstração do gateway de pagamento) → **Épico 5**

**Design System (Épico 2):** base de UI (tokens/tema + componentes) que sustenta as telas full-stack dos Épicos 3–5 — sem FRs próprios; habilita UX-DR8–DR13, DR17, DR19.

## Epic List

### Épico 1: Fundação, Configuração da Instalação e Controle de Acesso
Estabelece o alicerce sobre o qual todo o resto roda e entrega ao dono o controle completo da sua instalação. Inclui o scaffold do monorepo, multi-tenancy com isolamento por `company_id`, autenticação JWT, os três ambientes (dev/staging local/produção), CI/CD e backup. No nível de produto, o dono cria a conta da empresa, configura serviços (nome/duração/preço), horários de atendimento por profissional, intervalo entre atendimentos, convida e gerencia a equipe com a matriz de permissões, e personaliza a identidade visual (nome, logo, cor, tema claro/escuro). Ao fim, existe uma instalação configurada, segura e isolada — pré-requisito técnico de todos os épicos seguintes, e já entrega valor: o salão está cadastrado e parametrizado.
**FRs cobertas:** FR-G1–G6, FR-I1–I4, FR-J1, FR-J3, FR-J4, FR-J5
**NFRs:** NFR-A2, NFR-S1, NFR-S2, NFR-S3, NFR-O1, NFR-O2
**UX-DRs:** UX-DR7 (shell de navegação responsivo), UX-DR13, UX-DR14, UX-DR15

### Épico 2: Design System
Base de UI apresentável — tokens de tema (claro/escuro, cor primária da instalação, iniciados na Story 1.7) e componentes reutilizáveis (Button, Input, Select, Modal, Card, PageLayout, EmptyState, Toast). É o que faz as telas full-stack dos Épicos 3–5 saírem bonitas e consistentes — requisito de venda (salões compram pelo visual). Sem FRs próprios; habilita UX-DR8–DR13, DR17, DR19.
**UX-DRs:** UX-DR17 (estados vazios), UX-DR19 (toasts), base para UX-DR8–DR13

### Épico 3: Agendamento manual (painel) — núcleo vendável sem WhatsApp
O coração vendável do MVP **sem** depender do bot. Entrega a **base de agendamento** (tabelas `clients` base e `appointments` + o `AvailabilityService`, **extraídos** das antigas stories de bot — DL-035), a **agenda do painel** (dia/semana, cores por status, origem, marcar não compareceu), o **agendamento manual** (escolher profissional/serviço/data/horário, cliente inline) e o **cancelamento pelo painel**. Full-stack (API + telas React). Vendável sozinho; o bot pluga em cima depois.
**FRs cobertas:** FR-D1–D9, FR-C4, FR-K1–K5 · **NFRs:** NFR-C1 (atomicidade base)
**UX-DRs:** UX-DR8, UX-DR10, UX-DR17, UX-DR19

### Épico 4: Gestão de Clientes
O salão mantém o cadastro de clientes com histórico e observações, transformando dados soltos de agendamento em relacionamento. Estende a tabela `clients` (base criada no Épico 3) com os campos de cadastro; cobre listagem/busca, cadastro manual, histórico de agendamentos, observações livres e o atalho "novo agendamento para esta cliente". Full-stack.
**FRs cobertas:** FR-E1–E4
**UX-DRs:** UX-DR11, UX-DR17

### Épico 5: Financeiro *(renomeado de "Registro de Pagamentos" — DL-060; escopo AMPLIADO — DL-061/DL-062)*
O salão registra manualmente o recebimento por agendamento e passa a ter **visão de gestão**. **Ampliado (DL-061) em duas levas:** **1ª leva** — **Financeiro** (menu próprio: valor + **forma de pagamento OPCIONAL** + situação **pago/pendente**; Recebimentos por período; **exportação CSV+PDF**; situação financeira em Clientes) e **Dashboard** (faturamento dia/semana/mês, atendimentos, clientes, fluxo/semana — leitura + exportação); **2ª leva** — **Equipe** vira menu próprio com **remuneração** (comissão %/fixo, por serviço/profissional, salário diário/semanal/mensal, previsão→real) e **"quanto gastei com a equipe"** no Dashboard. **Permissões (DL-062):** visibilidade de módulo + papéis Dono/Profissional + toggles por pessoa. A abstração `PaymentGateway`/`NullPaymentGateway` segue preparada sem integração ativa. Full-stack. **Roadmap (DL-061):** o bloco **sobe para ANTES do Épico 6**.
**FRs cobertas:** FR-F1–F5 · **NFRs:** NFR-O4
**UX-DRs:** UX-DR12

### Épico 5B: Agendamento pela Cliente (link público) — antes do bot
A cliente agenda sozinha por um **link público** (`/agendar/{slug}`), **sem WhatsApp** e **sem login**. O agendamento entra **pendente** na agenda; o estabelecimento contata a cliente pelo telefone e **confirma** no painel (se não confirmar, **cancela manual** — 3.4). Constrói a **fundação de pendentes** que o bot (Épico 6) reusa. **Escopo fechado em 3 stories (DL-049); rótulo "5B" para não renumerar 6/7.** Máquina de status com gatilho manual (DL-046); página **neutra** (DL-048), **mobile-first**. **Sem expiração automática de pendente / sem status "expirado".**
**FRs cobertas:** FR-B1/B2/B4 · **NFRs:** NFR-A3, NFR-C1, NFR-S1/S2 · **UX-DRs:** UX-DR9

### Épico 6: Ciclo de Agendamento via WhatsApp (Bot) — o diferencial, depois da base
Adiado para depois do produto manual estar vendável (DL-035). A cliente agenda e cancela pelo WhatsApp; o salão trata os **pendentes** pelo painel. Cobre a abstração `WhatsAppProvider` sobre a **WhatsApp Cloud API oficial (Meta)** (DL-054; Evolution só dev), a máquina de estados (`whatsapp_conversations`, **estado e jobs agendados no MySQL, sem Redis/BullMQ** — DL-056), o fluxo de agendamento via bot (**uma conversa = um serviço**; carrinho multi-serviço é fast-follow — DL-055), a notificação ao salão + confirmação/recusa de pendentes, o timeout de 2h, o cancelamento via bot, a notificação à cliente no cancelamento pelo painel (FR-C6) e a resiliência do provider. **Gated por plano:** o WhatsApp só liga no plano **Pró** (DL-057). Consome a base do Épico 3 (não recria tabelas de agendamento). **Já entregues pelo 5B:** notificação ao salão + confirmar/recusar (antiga 6.4) e polling de pendentes (antiga 6.9). **Movido ao roadmap:** monitoramento/alertas (antiga 6.8, DL-058).
**FRs cobertas:** FR-A1–A8, FR-B3/B5/B6 *(FR-B1/B2/B4 migraram para o Épico 5B — pendentes pelo painel)*, FR-C1–C3, FR-C5, FR-C6, FR-J2
**NFRs:** NFR-A1, NFR-A3, NFR-C1 (concorrência), NFR-C2, NFR-C3, NFR-O3
**UX-DRs:** UX-DR1–DR6, UX-DR9, UX-DR18

### Épico 7: Acesso mobile — painel responsivo instalável (PWA) — ✅ 1ª leva ENTREGUE
O dono/profissional opera o **painel completo pelo celular**, instalável como **PWA** (adicionar à tela inicial), com as **mesmas ações** do desktop (confirmar/recusar pendentes, criar/cancelar/remarcar, clientes, configurações). **Não** é app nativo somente leitura — **revoga DL-018 e o P7 do plano 5B (DL-051)**. **Motivo:** muitos estabelecimentos-alvo não têm computador; sem ação completa no celular o produto não é vendável para esse perfil. **Atualização (DL-060, 2026-08-11):** a **1ª leva está no `main` e sai da fila** — a antiga priorização "ANTES do Épico 5/6" (DL-051) está **cumprida/vencida**. A **2ª leva (7.2.NN)** passa à faixa de **updates contínuos** (ver Roadmap). Ordem atual em **## Roadmap — ordem de execução**.
**FRs cobertas:** FR-H1, FR-H2, FR-H3, FR-H4
**UX-DRs:** UX-DR7 (navegação mobile do painel), UX-DR16, UX-DR17

---

## Roadmap — ordem de execução (redesenhado 2026-08-11 DL-060; revisado 2026-08-12 DL-061/DL-062)

> **Revisa a priorização do DL-051** (que punha o Épico 7 antes do 5 e do 6): a **1ª leva do Épico 7 já está no `main`** e o **VPS foi contratado**. Os números de épico **não mudam** — isto é a **ordem de trabalho**.
> **Revisão DL-061 (2026-08-12):** o antigo item "Dados e Gestão" (que vinha **depois** do Épico 6) foi **reorganizado em duas levas e movido para ANTES do Épico 6**. Motivo: a falta de **Financeiro** já **custou um cliente**, enquanto o Épico 6 depende de um bloqueio externo (verificação de negócio na Meta) que **não avança com código nosso**.

**0. ✅ Épico 7 (1ª leva) — ENTREGUE, fora da fila.** PWA + painel-app no celular + agenda em lista + estados (PRs #51–#59). A **2ª leva (7.2.NN)** vai para a faixa de **updates contínuos** (item 6).

**1. Infraestrutura — AGORA.** VPS **Hostinger KVM 2**, **Ubuntu 24.04**, domínio **tamarcado.tec.br**. Stack **ADR-009**: **Nginx + PM2 + MySQL + Certbot**. Inclui:
- **Restrição de `/api/platform/*` por IP** (fecha a pendência de deploy dos endpoints pré-tenant 1.9/1.9.01).
- **CD por SSH acionado manualmente** — **não** automático a cada merge.
- **Backup antes de cada deploy** + **migrations no deploy** + **caminho de rollback** documentado.

**2. E-mail transacional.** Destrava a **recuperação de senha** (hoje bloqueador; mitigada pela 1.9.01). **Serviço externo** (Brevo/Resend), **não** caixa de e-mail comum.

**3. Financeiro + Dashboard + Equipe + Permissões** *(bloco novo, DUAS LEVAS — DL-061/DL-062; **sobe para antes do Épico 6**):*
- **3a — 1ª leva (fecha venda): Financeiro + Dashboard.**
  - **Financeiro** (vira **menu próprio**): registrar pagamento no agendamento (**valor**; **forma de pagamento OPCIONAL**; **situação pago/pendente**); **Recebimentos** por período (total recebido/pendente); **exportação CSV + PDF**; **situação financeira da cliente** em Clientes.
  - **Dashboard** (somente leitura + exportação): faturamento por **dia/semana/mês**, quantidade de atendimentos, total de clientes, média de fluxo/semana. *(Sem "relatório anual" no 1º momento.)*
  - **Permissões (DL-062):** visibilidade de **módulo** (não só de ação); papéis **Dono/Profissional** (Básico aposentado); toggles por pessoa **"Pode ver Financeiro/Dashboard"** (só o Dono, OFF por padrão); quem não tem acesso **não vê o menu**; bloqueio **também no backend**.
- **3b — 2ª leva (custo da equipe): Equipe.**
  - **Equipe sai de Configurações e vira menu próprio** — também **fonte de dado financeiro**.
  - **Remuneração por profissional:** comissão (%) **ou** valor fixo (ambos existem); comissão por **serviço** ou por **profissional** (ambos reais); **salário fixo** diário/semanal/mensal; **fixo + comissão coexistem**.
  - **Modelo previsão → real** (sistema calcula, estabelecimento registra o pago); **"quanto gastei com a equipe"** no Dashboard.
  - *(Fora desta leva, evolução: **metas / faixas de comissão**.)*

**4. Épico 6 — WhatsApp** (Cloud API oficial, DL-054 a DL-058). **Pré-requisito não-técnico:** a **verificação de negócio na Meta precisa COMEÇAR antes do código** (leva dias, não depende de dev) — **começar em paralelo já**, pois é o gargalo.

**5. Monitoramento do bot** — alertas de queda/entrega + painel (vindo do **DL-058**). Fica **com o Épico 6** (mesma estrutura de coleta do Financeiro/Dashboard); **não** entra nas duas levas do item 3.

**6. Updates contínuos** *(faixa PERMANENTE — não é épico):* correções visuais do mobile e refinos de interface entram em **ciclos regulares**. A **2ª leva do Épico 7 (7.2.NN)** faz parte disso.

> **Navegação (DL-061/DL-062):** Financeiro, Dashboard e Equipe são **menus próprios** (Equipe deixa de ser aba de Configurações). No **desktop**, Configurações continua na **sidebar**; no **mobile**, Configurações é acessada pelo **perfil do usuário** (duplicação desktop/mobile **conscientemente aceita**). A **tab bar do mobile** precisa ser **revista para comportar os novos módulos sem truncar**.

> **Versionamento & saída do beta (DL-063):** o produto usa **SemVer `X.Y.Z`**, com o bump **manual no PR `dev → main`** pelos prefixos de commit do DL-028 (`fix`/`chore`→PATCH, `feat`→MINOR, quebra→MAJOR). Fonte em `apps/web/package.json` (lida na build; exibida no login/painel/Perfil — o PATCH aparece a partir do `.1`). **`CHANGELOG.md` obrigatório** em linguagem de usuário. **Saída do beta** (`1.0.x-beta`/`v1.0…b` → `1.0.0` estável) exige **as duas condições juntas, funcionando de fato:** **(1)** WhatsApp ativo (Épico 6) **e (2)** Dashboard + Financeiro + Equipe (DL-061, as duas levas).

---

## Estado de implementação — retrato (2026-08-11)

> Mantido sob a disciplina do **DL-042**: só muda quando uma story é concluída/mergeada, nasce uma decisão, o roadmap muda de ordem, ou uma story ganha detalhe que altera a implementação. **Não** muda por ajuste visual, fix ou texto.

**Épico 1 — Provisionamento & acesso:**
- ✅ **1.9** Provisionamento de estabelecimento (`POST /platform/companies`, `x-platform-key`) — **mergeada (PR #45)** (e2e verde, inclui isolamento de 2 empresas). Só cria; reusa `user_invites` para convidar o owner.
- ✅ **1.2.01** Login multi-tenant por **slug na rota** (`/app/{slug}/login`, **DL-050**) — **mergeada (PR #46)**; `AUTH_ALLOW_SINGLE_TENANT` **fail-closed** (ausente = slug obrigatório), slug guardado no navegador para sessão expirada/logout, e2e de isolamento com 2 empresas.
  - ⛔ **DL-050 REVOGADO por DL-052 (2026-08-06):** o login do painel passa a **URL única**, com o **backend resolvendo o tenant pelo e-mail** (e-mail em 2+ empresas → tela de escolha). Motivo: slug na rota não funciona no **PWA** (start_url fixo), nem para quem digita o endereço, nem em aparelho novo. **O slug do link público `/agendar/{slug}` não muda.**
- ✅ **1.2.02** Login por **e-mail / URL única** (implementa **DL-052**, revoga a 1.2.01) — backend resolve o tenant pelo e-mail; e-mail em 2+ empresas → `/auth/login` devolve `{ companies }` e o front mostra a **tela de escolha** (senha validada só após a escolha). **`AUTH_ALLOW_SINGLE_TENANT` aposentada**; `painelUrl` do provisionamento agora é a URL única (sem slug). Front: rota única `/login` (removidos `/app/{slug}/login`, `tamarcado.slug` e o redirect por slug). e2e de **isolamento** reescrito (2 empresas SEM slug + desambiguação de e-mail idêntico). **+ Instalação do PWA pela tela de login** (botão "Instalar app" no Android/Chrome; instrução no iOS/Safari; só mobile, some em standalone) — fecha a consequência do start_url único da 7.1.
- ✅ **Provisionamento de clientes reais liberado** — o fix está no `main`; clientes já foram provisionados em **dev**. A antiga fila obrigatória (1.9 → fix → cliente real) está **cumprida**.
- ✅ **1.2.03** Trocar a própria senha no Perfil (`PATCH /users/me/password`; valida a senha ATUAL, política do aceite — mín. 8). Não há revogação de sessão hoje (sem versionamento de token): a sessão atual segue válida. **Junto:** link público vira **aba própria** em Configurações (a Identidade fica só com marca; **"Prévia ao vivo" removida**; rótulo **"Nome da empresa"**).
  - ⏳ **PENDÊNCIA — bloqueador antes de vender: recuperação de senha esquecida por e-mail.** Sem isso, quem esquece a senha depende de intervenção manual no banco. Depende de **envio de e-mail configurado** (ainda não temos). Priorizar antes do go-to-market. *(Mitigada operacionalmente pela **1.9.01** — reset por link disparado pelo operador; a versão self-service por e-mail continua pendente.)*
- ✅ **1.9.01** Reset de senha por **link temporário** (`POST /api/platform/password-reset`, `x-platform-key`, pré-tenant como a 1.9). Operador gera o link (`/definir-senha?token=`), o dono define a própria senha (operador **nunca** sabe a senha). Reusa `user_invites`: token único hasheado, **expira em 1h**, uso único, gerar novo invalida o anterior; o aceite passou a **redefinir** senha de usuário existente (antes só criava). **Auditoria** por log (geração + uso, com IP). Mesmo mecanismo servirá à **recuperação por e-mail** (muda só o canal). **Deploy:** exige restringir `/api/platform/*` por IP no Nginx (nota de deploy do Épico 1).
- ✅ **1.2.04** Revogação de sessão ao trocar/redefinir senha (**DL-053**, realiza a DL-025-nota). Coluna `users.token_version` no payload do access **e** do refresh, conferida no refresh e no `ActiveUserGuard` (sem query extra — reusa o lookup por request da DL-029). Trocar a senha (Perfil) ou redefinir pelo link (1.9.01) **bumpa a versão** e derruba as OUTRAS sessões na requisição seguinte — sem esperar 15min/7d. Quem trocou **não é deslogado**: o `PATCH /users/me/password` devolve tokens novos e o front os adota. Migração **aditiva**: token sem o claim = versão 0 (nada em uso quebra; corta na 1ª troca). Desativar usuário segue cortando (não regrediu).

**Épico 3 — Agendamento manual (painel) — ✅ COMPLETO (CRUD inteiro):**
- ✅ **3.1** Base de agendamento + disponibilidade — mergeada
- ✅ **3.2** Agenda do painel (dia/semana) — mergeada
- ✅ **3.2.02** Ajustes da agenda (card curto em linha única; aviso ao marcar o mesmo profissional em horário ocupado; **horário de funcionamento configurável** na Identidade) — mergeada (PR #28)
- ✅ **3.3** Agendamento manual pelo painel — mergeada
- ✅ **3.3.1** Correções do agendamento manual (encaixe não bloqueia; mensagens de erro reais) — mergeada (PR #24)
- ✅ **3.4** Cancelamento pelo painel — mergeada (PR #30, DL-041)
- ✅ **3.5** Atribuir/trocar profissional — mergeada (PR #35, DL-043); **pré-requisito da 5B.3** (confirmar pendente = atribuir + confirmar)
- ✅ **3.6** Remarcação + **Editar unificado** (serviço/horário/profissional) — mergeada (PR #36, DL-044/DL-045); cria `appointment_changes`
- ✅ **3.7** Marcar comparecimento (no-show/concluído) por ações pontuais — mergeada (PR #38); auditoria unificada em `appointment_changes`

**Épico 4 — Gestão de Clientes:**
- ✅ **4.1** Clientes: cadastro, listagem e busca — mergeada (PR #31)
- ✅ **4.2** Perfil da cliente (histórico + observações) — mergeada (PR #32) — **Épico 4 completo**

**Épico 5B — Agendamento pela Cliente (link público):** **Escopo FECHADO (DL-049)** — 3 stories. Specs `5B-1/5B-2/5B-3`.
- ✅ **5B.1** Fundação pública por slug (branding/serviços/profissionais) — mergeada (PR #41)
- ✅ **5B.2** Disponibilidade pública + POST hostil-por-padrão — mergeada (PR #42)
- ✅ **5B.3** Pendentes no painel (confirmar/recusar + contador) — mergeada (PR #43) — **fecha o Épico 5B**

**Painel de Configurações (UX-DR13) — COMPLETO:** Identidade ✅ (2.1.03) · Serviços ✅ (2.1.03) · Horários ✅ (3.3.2) · Equipe ✅ (3.3.3, PR #26 — inclui a página de aceite de convite `/aceitar-convite`). *(3.3.2/3.3.3 foram rotuladas sob o Épico 3 por velocidade, mas são features do Painel de Configurações — DL-039.)*

**Épico 7 — Acesso mobile / PWA (DL-051) — ✅ 1ª leva no `main`, FORA da fila (DL-060) (PRs #51–#59 + correções):**
- ✅ **7.1** Painel **instalável como PWA** — manifest, ícones, service worker `autoUpdate` (SW não troca a versão no meio da sessão; assume no próximo carregamento). Mergeada (PR #59).
- ✅ **7.2 (1ª leva)** Painel com **cara de app** no celular — AppBar enxuta, **tab bar de 4 abas + FAB central**, bottom sheets, **toolbar única**, Perfil, Configurações usável no mobile. Reaproveita os mesmos endpoints (sem backend novo).
- ✅ **7.2 — agenda em lista** — `AgendaList` (mobile) / `AgendaGrid` (desktop) escolhidos pela rota; **calendário do mês com cor por status**; **auto-refresh em todas as mutações** (via `appointmentsSignal`).
- ✅ **7.3** Estados **vazio, carregamento e erro** no celular (skeletons; erro de rede × servidor; fix do "Recusar" fora do auto-refresh). Mergeada (PR #57).
- ✅ **1.2.02 (junto do Épico 7)** Instalação do PWA pela **tela de login** (botão no Android/Chrome; instrução no iOS/Safari; some em standalone) — fecha a consequência do `start_url` único da 7.1.
- ⏳ **7.2.NN — 2ª leva (pendente, ENCOLHEU):** com a agenda em **lista**, **overlap lado-a-lado** e **linha de "agora"** perderam sentido e **saíram**. Restou: **multi-profissional como filtro** (sheet de filtros por origem/profissional) e **Perfil completa**. Sem backend novo.

**Épico 6 — Bot WhatsApp — NÃO INICIADO** (revisado em 2026-08-10, DL-054 a DL-058), **exceto** o que o 5B já entregou:
- ✅ **6.4** (notificar salão + confirmar/recusar) e ✅ **6.9** (polling de pendentes) — **entregues pelo 5B.3 (PR #43)**. Falta só, no Épico 6, **disparar a notificação ao salão quando o pré-agendamento vier do bot**.
- ⛔ **6.8 monitoramento → roadmap** (DL-058, com Financeiro/Dashboard).
- 🆕 **6.11 interruptor de WhatsApp por plano** (DL-057) — introduz **PLANO** (`plan` básico|pró + `whatsapp_enabled`); Dashboard/Financeiro passam a depender de `plan`.

**Pendências que não podem sumir (não são bugs esquecidos — cada uma decidida):**
- ⏳ **Correções visuais do mobile** levantadas pelo Renato ao usar o app — **ainda não catalogadas** numa lista; abrir o inventário antes da 2ª leva (7.2.NN).
- ⏳ **Recuperação de senha por e-mail** — **bloqueador antes de vender**; **mitigada** pela 1.9.01 (reset por link do operador). Self-service por e-mail depende de envio de e-mail configurado (não temos).
- ⏳ **Restringir `/api/platform/*` por IP no Nginx** — na hora do **VPS** (nota de deploy do Épico 1); os endpoints pré-tenant (1.9 / 1.9.01) hoje só têm o `PLATFORM_KEY`.
- ⏳ **Testar o PWA instalado em aparelho real** — exige **HTTPS**; não dá para validar 100% em `localhost`. Fazer quando houver domínio/VPS.
- ⏳ **3.7.01 — filtro por status na agenda**, incluindo a origem **"Link"** (agendamento vindo do público 5B, `source = 'link'`, DL-049). Planejado, fora do 5B (ver Buracos).

## Buracos conhecidos (débito consciente)

> Adiamentos **deliberados** — registrados aqui para não sumirem. Nenhum é bug esquecido; cada um foi decidido.

- ~~**Editar/remarcar agendamento (o "U" do CRUD)**~~ — **FECHADO:** 3.5 (#35), 3.6 (#36, DL-044) e 3.7 (#38). CRUD de agendamento completo.
- **Auditoria de agendamentos consolidada (DL-045)** — a 3.6 cria `appointment_changes` (histórico de deltas das edições). Cancelamento (`cancelled_by_user_id`) e atribuição (`assigned_by_user_id/assigned_at`) seguem em **colunas soltas** (estado atual). Migrá-los para a change-log genérica fica como **refactor futuro** — decidido não fazer na 3.6 (reescreveria 3.4/3.5).
- ~~**No-show (FR-D9)**~~ — **FECHADO na 3.7 (#38):** ações Concluído/Não compareceu, só depois do horário; informativo, sem notificação (DL-023).
- **Filtro por status na agenda** — ajuste **3.7.01** (DL-028, commit `feat`): Todos/Pendente/Confirmado/Cancelado/Não compareceu/Concluído, usando os status existentes, **+ filtro por origem incluindo "Link"** (agendamento do público 5B, `source = 'link'`, DL-049). **Fora do 5B**, planejado.
- **Notificação automática à cliente (confirmação/recusa)** — depende de canal; fica no **Épico 6/bot**. No link (5B), a cliente vê "o estabelecimento vai confirmar" e o salão contata manual (DL-049).
- **Visão Mês da agenda** — só **dia/semana** hoje. Entra como `3.2.NN` quando priorizada.
- **Multi-serviço (`group_id`)** — **decidido** (DL-040: N agendamentos agrupados, aditivo), **não implementado**, e agora **fast-follow explícito fora do MVP do bot** (DL-055: uma conversa = um serviço). Hoje 1 agendamento = 1 serviço (FR-A8); por isso "cancelar só aquele" é naturalmente por-agendamento.
- **Overbooking do mesmo profissional** — permitido **de propósito** (D1: encaixe deliberado). A 3.2.02 adicionou **aviso nomeando** quem já está ocupado, mas **não há bloqueio duro**. Fica assim no MVP; revisar se algum salão pedir prevenção rígida.

---

## Épico 1: Fundação, Configuração da Instalação e Controle de Acesso

**Objetivo:** estabelecer o alicerce técnico (monorepo, multi-tenancy, autenticação, ambientes, CI/CD, backup) e entregar ao dono o controle completo da sua instalação — serviços, horários, equipe, permissões e identidade visual. Pré-requisito de todos os épicos seguintes.

**FRs:** FR-G1–G6, FR-I1–I4, FR-J1, FR-J3, FR-J4, FR-J5 · **NFRs:** NFR-A2, NFR-S1, NFR-S2, NFR-S3, NFR-O1, NFR-O2 · **UX-DRs:** UX-DR7, UX-DR13, UX-DR14, UX-DR15

> **Status da UI do Painel de Configurações (UX-DR13) — DL-039.** Os backends de config
> saíram no Épico 1 (Serviços 1.5, Horários+intervalo 1.6, Equipe/permissões 1.4, Identidade 1.7).
> A **UI** veio em partes e o painel está **COMPLETO**: **Identidade ✅** (2.1.03) · **Serviços ✅**
> (2.1.03) · **Horários ✅** (3.3.2) · **Equipe ✅** (**3.3.3**, PR #26 — inclui a página de aceite
> de convite `/aceitar-convite`, que fecha o fluxo da 1.4). *(3.3.2/3.3.3 foram rotuladas sob o
> Épico 3 por velocidade, mas são features do Painel de Configurações — DL-039.)*

### Story 1.1: Walking skeleton e pipeline de entrega

As a desenvolvedor (Renato),
I want um monorepo inicializado com API e painel que sobem, banco provisionado e pipeline de CI/CD funcionando,
So that exista um esqueleto implantável de ponta a ponta sobre o qual todas as features são construídas.

**Acceptance Criteria:**

**Given** o repositório recém-clonado
**When** rodo o comando de bootstrap do monorepo (`pnpm install`) e subo o Docker Compose de desenvolvimento
**Then** a API NestJS (`apps/api`) sobe e responde `200` em `GET /health`
**And** o painel web (`apps/web`, React+Vite) sobe e renderiza uma página inicial
**And** MySQL 8 e Redis sobem como serviços do Compose *(as-built da 1.1; **Redis não é mais necessário — DL-056**: nada no produto depende dele, pode sair do Compose quando conveniente)*

**Given** a estrutura do monorepo
**When** inspeciono os workspaces
**Then** existem `apps/api`, `apps/web`, `apps/mobile` (placeholder), `packages/shared-types`, `packages/shared-utils` conforme a arquitetura (seção 2), sem starter template de terceiros

**Given** a migration inicial
**When** ela é aplicada
**Then** a tabela `companies` é criada com ao menos `id`, `name`, `timezone` (default `America/Sao_Paulo`), `created_at` — sem criar tabelas que ainda não são necessárias

**Given** um push para qualquer branch
**When** o GitHub Actions roda `ci.yml`
**Then** executa lint, typecheck, testes e build de todos os pacotes, falhando o pipeline em qualquer erro

**Given** um push para `main` com CI verde
**When** `deploy.yml` executa
**Then** faz deploy via SSH para o VPS de produção (PM2 restart da API + cópia do build web para o Nginx), conforme ADR-009

**Given** os ambientes definidos
**When** valido a configuração
**Then** dev (Docker Compose local) e staging (local, `docker-compose.staging.yml`, ver ADR-010) estão configurados, e o custo de infraestrutura de produção respeita NFR-O1 (≤ R$130/mês)

### Story 1.2: Autenticação do dono e shell do painel

As a dono de salão,
I want fazer login no painel com e-mail e senha e ver a estrutura de navegação,
So that eu acesse minha instalação de forma segura.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** a tabela `users` é criada com `id`, `company_id`, `name`, `email`, `password_hash`, `access_level` (enum owner/manager/basic), `attends_clients` (boolean), `theme` (enum light/dark, default light), `is_active`, timestamps — dois eixos de acesso independentes (DL-022) e tema individual por usuário (DL-021)

**Given** credenciais válidas
**When** o dono faz login
**Then** o sistema retorna um JWT de acesso (15 min) e um refresh token (7 dias), e o `JwtStrategy` extrai `{ userId, companyId, accessLevel, attendsClients }` (NFR-S3, DL-022)

**Given** um access token expirado e um refresh token válido
**When** o cliente chama o endpoint de refresh
**Then** um novo access token é emitido sem novo login

**Given** uma requisição a endpoint protegido sem token válido
**When** o `JwtAuthGuard` avalia
**Then** a requisição é rejeitada com `401`

**Given** um usuário autenticado
**When** acessa o painel
**Then** vê o shell de navegação responsivo — sidebar fixa em desktop (≥768px) e tabs no rodapé em mobile (<768px) com menu "+" e área para badge de pendentes (UX-DR7)

### Story 1.3: Multi-tenancy e isolamento de dados

As a operador da plataforma,
I want que toda consulta seja automaticamente filtrada pela instalação do usuário autenticado,
So that nenhum dado vaze entre salões.

**Acceptance Criteria:**

**Given** uma requisição autenticada
**When** o `TenantMiddleware` processa
**Then** valida que a empresa está ativa e injeta `company_id` no `AsyncLocalStorage`

**Given** um repositório que herda de `TenantAwareRepository<T>`
**When** qualquer query é executada
**Then** o filtro `WHERE company_id = ?` é aplicado automaticamente, sem o desenvolvedor precisar adicioná-lo (NFR-S1)

**Given** dois salões com dados distintos
**When** o usuário do salão A consulta qualquer recurso
**Then** nenhum registro do salão B é retornado, em nenhuma rota (NFR-S1, NFR-S2, FR-I4)

**Given** uma tentativa de acesso a um `id` pertencente a outra instalação
**When** a query roda sob o tenant atual
**Then** o registro não é encontrado (comporta-se como inexistente)

### Story 1.4: Gestão de equipe e permissões

As a dono de salão,
I want convidar usuários, definir o nível de acesso e se cada um atende clientes, e ativar/desativar acesso,
So that minha equipe use o sistema com as permissões corretas, refletindo quem é administrativo e quem tem agenda própria.

**Acceptance Criteria:**

**Given** que sou o dono
**When** convido um novo usuário por link
**Then** o convite é gerado e o usuário cria a própria senha no primeiro acesso (UX-DR14)

**Given** o modelo de dois eixos (FR-I1, DL-022)
**When** defino ou altero o **nível de acesso** (Dono/Profissional/Básico) e o atributo **atende clientes** (sim/não) de um usuário
**Then** os dois campos são persistidos de forma independente e passam a valer nas próximas requisições (FR-G5); ex.: uma manicure pode ser Profissional + atende, e uma recepcionista pura pode ser Profissional + não atende

**Given** a matriz de permissões por nível de acesso (FR-I2)
**When** um usuário tenta uma ação fora do seu nível (ex: Profissional acessando relatórios consolidados)
**Then** o `RolesGuard` rejeita a ação com `403`

**Given** um usuário com `attends_clients = true` (FR-I1)
**When** o `AvailabilityService` calcula disponibilidade e o agendamento registra `professional_id`
**Then** apenas usuários que atendem entram na disponibilidade e podem ser atribuídos, independentemente do nível de acesso

**Given** que existe exatamente um nível Dono por instalação (FR-I3)
**When** tento remover o nível Dono de um usuário sem transferir antes
**Then** a operação é bloqueada com mensagem explicativa

**Given** um usuário desativado
**When** ele tenta autenticar ou usar um token existente
**Then** o acesso é negado (FR-G4)

### Story 1.5: Catálogo de serviços

As a dono de salão,
I want cadastrar e manter os serviços oferecidos com nome, duração e preço,
So that eles fiquem disponíveis para agendamento e configuração.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** as tabelas `salon_services` e `professional_services` são criadas, com `company_id` e índices liderados por ele

**Given** que sou o dono
**When** crio, edito ou inativo um serviço (nome, duração em minutos, preço)
**Then** a mudança é persistida e validada (UX-DR13 — subseção Serviços, FR-G1)

**Given** um serviço inativado
**When** listo serviços para agendamento
**Then** ele não aparece (apenas `is_active = true`)

**Given** a associação profissional ↔ serviço
**When** defino quais serviços cada profissional executa
**Then** a relação é persistida em `professional_services`

### Story 1.6: Horários de atendimento e intervalo

As a dono de salão,
I want configurar os dias e faixas de horário de atendimento de cada profissional e o intervalo entre atendimentos,
So that a disponibilidade da agenda reflita a realidade do salão.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** a tabela `professional_schedules` é criada com `company_id`, `professional_id`, dia da semana e faixa de horário

**Given** que sou o dono
**When** configuro, por profissional, os dias ativos e a faixa de horário (início/fim)
**Then** a configuração é persistida (FR-G2, UX-DR13 — subseção Horários)

**Given** o intervalo entre atendimentos consecutivos
**When** defino esse valor
**Then** ele é persistido e ficará disponível para o cálculo de disponibilidade (FR-G3)

**Given** uma faixa de horário inválida (fim antes do início)
**When** tento salvar
**Then** a validação impede e exibe erro

### Story 1.7: Identidade visual e tema

As a dono de salão,
I want personalizar nome, logo e cor da instalação e escolher o tema claro/escuro,
So that o sistema reflita a identidade do meu negócio.

**Acceptance Criteria:**

**Given** que sou o dono
**When** configuro nome do estabelecimento, faço upload do logo e defino a cor primária
**Then** os dados são persistidos e o painel passa a exibir nome e logo (FR-J1, FR-J3, UX-DR13 — subseção Identidade)

**Given** a configuração de personalização (FR-G6, FR-J5)
**When** acesso essa área
**Then** ela está restrita ao dono e é feita no painel (sem editor self-service além disso no MVP)

**Given** qualquer usuário autenticado
**When** alterna o tema claro/escuro na tela de Perfil
**Then** a preferência é gravada em `users.theme` (individual por usuário, não na instalação — DL-021) e persiste entre sessões (FR-J4, UX-DR15)

### Story 1.8: Backup diário do banco

As a operador da plataforma (Renato),
I want um backup diário automatizado do MySQL,
So that os dados das instalações estejam protegidos contra perda.

**Acceptance Criteria:**

**Given** o ambiente de produção
**When** o cron diário executa
**Then** um dump do MySQL é gerado e enviado para armazenamento compatível com S3/R2

**Given** um backup armazenado
**When** executo a rotina de restauração documentada
**Then** o banco é restaurado com sucesso a partir do dump (validação de que o backup é recuperável, não só gerado)

---

### Story 1.9: Provisionamento de estabelecimento (endpoint de plataforma)

As a operador da plataforma (Renato),
I want um endpoint protegido que cria um novo estabelecimento e convida o dono,
So that eu provisione um cliente vendido sem mexer no banco na mão.

**Escopo:** `POST /api/platform/companies`, protegido por header **`x-platform-key`** (valor no `.env` `PLATFORM_KEY`, **nunca** no repo; sem a chave → 401). Body `{ name, slug, ownerName, ownerEmail }`. Faz: (a) cria a company; (b) cria o **convite do owner** reusando o fluxo de `user_invites` (o mesmo do `POST /users/invite`); (c) retorna `{ slug, painelUrl, publicUrl, inviteUrl }`. **NÃO** cria serviços/horários/exemplo; **NÃO** define senha (o dono define pelo aceite — `/aceitar-convite`). Slug **kebab-case ASCII** (minúsculas/dígitos/hífen; 409 se duplicado — é a URL pública, não muda depois). *(**DL-052:** `painelUrl` passa a ser a **URL única do painel, sem slug** — o dono entra pelo e-mail; `publicUrl`/`/agendar/{slug}` e o `inviteUrl` seguem iguais.)* Rate limit por IP. **Superfície mínima: só cria** (sem listar/editar/deletar). Pré-tenant (`PRE_TENANT_CONTROLLERS`, DL-027). Fora de escopo: tela de admin (uso Insomnia) e signup self-service.

> ✅ **Provisionamento de clientes reais liberado (2026-07-30).** A fila obrigatória foi **cumprida**: **1.9** (PR #45) + **fix do login multi-tenant** (**1.2.01** / **DL-050**, slug na rota `/app/{slug}/login`, PR #46) estão no `main`. O `painelUrl` (`/app/{slug}/login`) funciona; com 2+ empresas cada dono loga pelo próprio slug (e2e de isolamento verde). Clientes já foram provisionados em **dev**. Não há mais o bloqueio de "dono não consegue entrar".
> ⚠️ **Atualização (DL-052, 2026-08-06):** a direção do login mudou para **URL única + tenant resolvido pelo e-mail** (o slug na rota não serve ao PWA nem a quem digita o endereço). O provisionamento continua igual; muda só o formato do `painelUrl` (sem slug) quando a story de implementação entrar. O `main` segue com o slug na rota até lá.

**Acceptance Criteria:**

**Given** o endpoint protegido
**When** chamo sem a `x-platform-key` correta
**Then** recebo 401 e nada é criado

**Given** um `slug` malformado (maiúscula, espaço, acento, caractere especial) ou um `ownerEmail` inválido
**When** provisiono
**Then** recebo 400

**Given** um `slug` já existente
**When** provisiono
**Then** recebo 409

**Given** dados válidos e a chave correta
**When** provisiono
**Then** a company é criada, um convite de `owner` pendente é gerado (sem usuário/senha ainda), e recebo `{ slug, painelUrl, publicUrl, inviteUrl }` — sem serviços/horários/exemplo

**Given** DUAS empresas provisionadas e ambos os donos aceitando o convite
**When** cada dono usa seu token
**Then** cada um só enxerga os dados da própria empresa (isolamento de tenant, DL-027)

**Nota de deploy — variáveis OBRIGATÓRIAS no VPS/produção:**

- **`NODE_ENV=production` (obrigatório).** Define o modo de produção — entre outras coisas, mantém o **CORS estrito** (só o allowlist de `CORS_ORIGIN`) e desliga o Swagger. O check é **fail-closed**: se `NODE_ENV` faltar, a API **já trata como produção** (não cai no CORS de rede local do dev — ver `app-setup.ts`/`isDevEnv`). Ainda assim, **defina explicitamente** no host (não confie no default). Em dev vale `NODE_ENV=development` (habilita o CORS de rede local para testar pelo celular).
- **`AUTH_ALLOW_SINGLE_TENANT` = OFF** (ausente ou `0`) em produção. É conveniência de dev/CI apenas; com ela ligada o login sem slug resolveria tenant único. Fail-closed: ausente = desligado = slug obrigatório (DL-050). *(**DL-052:** com o login por e-mail, o backend resolve o tenant **sempre** — esta flag perde a função e será **aposentada** na story do novo login.)*
- **`PLATFORM_KEY`** gerada **nova e longa** direto no ambiente de produção (ex.: `openssl rand -hex 32`), **fora do repositório** (secret do host/compose) — o valor de dev é só para dev. Rotacionar se vazar. O `POST /platform/companies` **falha fechada**: sem `PLATFORM_KEY`, responde 401.
- **`CORS_ORIGIN`** = a(s) origem(ns) real(is) do painel em produção (CSV), já que o modo dev de CORS não é usado com `NODE_ENV=production`.
- 🔒 **`/api/platform/*` RESTRITO POR IP no Nginx (obrigatório antes do VPS).** O caminho de plataforma (provisionamento 1.9 **e reset de senha 1.9.01**) é protegido só pela `PLATFORM_KEY`. Enquanto responder na internet aberta, quem tiver a chave **gera link de reset para qualquer dono e toma a conta**. Antes de subir, o Nginx deve **permitir `/api/platform/` apenas do(s) IP(s) do operador** (`allow <ip>; deny all;`) — defesa em profundidade além da chave. **Pendência de deploy — não implementada no código** (é config de infra).

---


## Épico 2: Design System

**Objetivo:** estabelecer a base de UI (tokens de tema + componentes reutilizáveis + **a casca da grade de agenda**) para que as telas full-stack dos Épicos 3–5 saiam bonitas, consistentes e apresentáveis — requisito de venda (DL-035/DL-036). Formaliza o que a Story 1.7 começou (tokens de tema em `index.css`, `AppShell`) e nasce com o componente visual mais complexo (a grade de agenda) já pronto.

**UX-DRs:** UX-DR8 (grade de agenda), UX-DR17 (estados vazios), UX-DR19 (toasts); base para UX-DR9–DR13

### Story 2.1: Tokens de tema, primitivos de UI e casca da grade de agenda

As a desenvolvedor,
I want tokens de tema, componentes de UI reutilizáveis e a casca visual da grade de agenda,
So that todas as telas tenham visual consistente e o componente mais complexo (a grade) nasça bonito na base, sem a Story 3.2 construí-lo do zero.

**Acceptance Criteria:**

**Given** os tokens de tema (evolução da Story 1.7)
**When** consolido o sistema visual
**Then** existem variáveis CSS para claro/escuro (fundo, texto, superfície, borda, muted) e a cor primária da instalação (`--primary`), aplicadas via `data-theme`

**Given** os primitivos de UI
**When** construo os componentes base
**Then** existem `Button`, `Input`, `Select`, `Modal`, `Card`, `PageLayout`, `EmptyState` (UX-DR17) e `Toast` (UX-DR19), tipados, testados (Vitest) e usando os tokens de tema

**Given** a **casca visual da grade de agenda** (componente `AgendaGrid` — o mais complexo e importante visualmente, DL-036)
**When** construo o calendário/grid **dia e semana**
**Then** o `AgendaGrid` renderiza a estrutura visual (colunas de dia, linhas de horário, células de slot e o card de agendamento) a partir de **props de dados** — recebe a lista de agendamentos e a faixa de horário —, **sem** buscar dados nem regra de negócio própria; pronto, tipado e testado (Vitest) para a Story 3.2 apenas **popular**

**Given** a separação de responsabilidades (DL-036)
**When** a Story 3.2 (Agenda) for construída
**Then** ela **reutiliza** o `AgendaGrid` do Design System — não constrói a grade do zero; o Design System é dono da aparência, a 3.2 é dona dos dados

**Given** um componente do design system
**When** é usado numa tela
**Then** respeita o tema atual (claro/escuro) e a cor primária da instalação sem estilos hardcoded

---

## Épico 3: Agendamento manual (painel)

**Objetivo:** entregar o **núcleo vendável sem WhatsApp** — a base de agendamento (dados + disponibilidade), a agenda do painel, o agendamento manual e o cancelamento pelo painel. Full-stack (API + telas React). A base de dados/disponibilidade foi **extraída** das antigas stories de bot (DL-035) para não ficar presa ao bot.

**FRs:** FR-D1–D9, FR-C4, FR-K1–K5 · **NFRs:** NFR-C1 (atomicidade base) · **UX-DRs:** UX-DR8, UX-DR10, UX-DR17, UX-DR19

### Story 3.1: Base de agendamento — tabelas e cálculo de disponibilidade

As a desenvolvedor,
I want as tabelas de agendamento e o cálculo de disponibilidade prontos,
So that a agenda e o agendamento manual (e depois o bot) tenham base de dados e slots para operar.

**Acceptance Criteria:**

**Given** a migration desta story (ordem DL-020: `clients` antes de `appointments`)
**When** aplicada
**Then** a tabela `clients` (base) é criada com `id`, `company_id`, `name`, `phone_whatsapp`, `phone_whatsapp_normalized`, `notes`, `is_deleted`, timestamps; `UNIQUE (company_id, phone_whatsapp_normalized)` e índices liderados por `company_id`

**Given** a mesma migration
**When** aplicada
**Then** a tabela `appointments` é criada com `company_id`, `professional_id` (nullable, FK → `users`), `client_id` (FK → `clients`), `service_id` (FK → `salon_services`), `scheduled_at`, `status`, `source`, `is_deleted` e índices compostos liderados por `company_id`

**Given** um serviço e uma data (FR-A3 — reaproveitado pelo manual e, depois, pelo bot)
**When** o `AvailabilityService` calcula
**Then** cruza `professional_schedules`, `professional_services`, duração do serviço, intervalo entre atendimentos (FR-G3) e `appointments` não-cancelados, gerando slots livres; slot existe se ≥1 profissional está livre; respeita o `timezone` do tenant (ADR-008)

**Given** a consulta de disponibilidade
**When** o painel/API pede próximos dias com slots
**Then** o serviço retorna as datas/horários disponíveis, escopados por tenant

> **Nota (extração — DL-035):** `clients` base e `whatsapp_conversations` estavam na antiga Story 2.2; `appointments` + `AvailabilityService` na antiga Story 2.3. Aqui vêm `clients` base + `appointments` + `AvailabilityService`. `whatsapp_conversations` (e a FK `appointment_id → appointments`) fica no Épico 6, criada quando o bot chega — `appointments` já existirá.

### Story 3.2: Agenda do painel (dia/semana)

As a dono/funcionário/profissional,
I want ver a agenda em dia/semana com status e origem,
So that eu acompanhe os agendamentos do salão de relance.

**Acceptance Criteria:**

**Given** a agenda (FR-D1, UX-DR8) — full-stack (API lista appointments por período + tela React) **reutilizando o `AgendaGrid` do Design System** (Story 2.1, DL-036)
**When** acesso o painel
**Then** vejo as visões **dia e semana** (a grade vem pronta do Design System; esta story só a **popula** com os dados da API) com cores por status (verde/confirmado, cinza/concluído, vermelho riscado/cancelado, cinza-escuro/não compareceu). *(A visão "mês" e o status "pendente" entram depois — mês como `3.2.NN`; pendente só existe com o bot, Épico 6.)*

**Given** os papéis (FR-D2)
**When** visualizo a agenda
**Then** dono/funcionário veem todos os profissionais; profissional vê só a própria

**Given** cada entrada (FR-D3, FR-K4)
**When** é exibida
**Then** mostra cliente, serviço, horário, status e ícone de origem (lápis = manual; balão = whatsapp quando o bot existir); "Não atribuído" em itálico cinza quando `professional_id` nulo

**Given** um agendamento *confirmado* e a matriz de permissões (FR-D9, FR-I2, DL-023)
**When** marco-o como *não compareceu* pelo menu de contexto do card
**Then** o status passa a *no_show* — registro manual e informativo, sem automação e sem notificação

**Given** o filtro por origem (FR-K5)
**When** seleciono `[Todos] [WhatsApp] [Manual]`
**Then** a agenda filtra; agendamentos manuais registram o criador para auditoria (FR-K2)

### Story 3.3: Agendamento manual pelo painel

As a dono/funcionário/profissional,
I want criar um agendamento manualmente definindo quem atende,
So that eu registre clientes que chegam pessoalmente ou por telefone.

**Acceptance Criteria:**

**Given** a tela de novo agendamento manual (FR-D5, UX-DR10) — full-stack
**When** dono/funcionário criam
**Then** podem escolher qualquer profissional (definir quem atende); o profissional só cria para si (campo Profissional só aparece para dono/funcionário)

**Given** a criação (FR-D6, FR-K3)
**When** salvo
**Then** o agendamento entra com `source = manual`, status *confirmado* (texto fixo "Entra como: Confirmado, sem aprovação"), sem fluxo de confirmação

**Given** o campo de cliente
**When** busco em tempo real e não encontro
**Then** posso criar a cliente inline via modal "+ Nova"; o WhatsApp da cliente é opcional (FR-D7)

**Given** a validação
**When** escolho data/horário
**Then** a data deve ser hoje ou futura; slot já ocupado gera aviso (não bloqueio)

**Given** uma cliente sem WhatsApp (FR-D8)
**When** o agendamento manual é criado
**Then** nenhuma notificação automática é disparada

### Story 3.4: Cancelamento pelo painel

As a dono/profissional/funcionário,
I want cancelar um agendamento pelo painel,
So that eu gerencie a agenda quando algo muda no salão.

**Acceptance Criteria:**

**Given** a matriz de permissões (FR-C4, FR-I2) — full-stack
**When** cancelo um agendamento pelo painel
**Then** o cancelamento respeita o papel, o status vai a *cancelado* e o slot é liberado

**Given** o menu de contexto/modal de cancelamento (UX-DR18)
**When** ele abre
**Then** confirma a ação e um toast padronizado registra o que aconteceu (UX-DR19)

> **Nota (DL-035):** a **notificação à cliente via WhatsApp** no cancelamento pelo painel (FR-C6, UX-DR18 texto condicional) fica no **Épico 6** (bot), pois depende do WhatsApp. Aqui o cancelamento opera sem notificação externa.
>
> **Detalhe de implementação (spec aprovada 2026-07-22 — DL-041).** Endpoint `PATCH /api/appointments/:id/cancel` (body `{ reason? }`): `status → cancelled`; `cancelled_by = 'professional'` (o **LADO** — usado pelo bot na 6.6) **+** nova coluna **`cancelled_by_user_id`** (nullable, FK → `users`) = a **PESSOA** que cancelou (D1 — dois campos, propósitos distintos). Motivo opcional → `cancellation_reason`. **Permissões:** owner/gerente cancelam qualquer um; `basic` só o próprio (`professional_id == self`). **Erros:** `409` já cancelado · `400` completed/no_show · `404` fora do tenant. **Disponibilidade sem mudança** — já exclui cancelados, o slot volta sozinho. Continua **visível como Cancelado** (não é `is_deleted`). Grupo multi-serviço não se aplica (`group_id` não existe — DL-040). Edição/remarcação fora — é o "U" do CRUD, fatiado em **3.5/3.6** (DL-043).

### Story 3.5: Atribuir/trocar profissional de um agendamento

As a dono/funcionário/profissional,
I want atribuir ou trocar o profissional de um agendamento existente,
So that agendamentos sem profissional (inclusive os que o bot cria) ganhem responsável, sem remarcar horário.

**Acceptance Criteria:**

**Given** o modal de detalhe do agendamento (onde já mora o Cancelar) e um agendamento *pending*/*confirmed*
**When** abro o campo **Profissional** (editável, `select`)
**Then** posso atribuir/trocar o profissional; *concluído/cancelado/no-show* é histórico e **não** muda (campo read-only)

**Given** a matriz de permissões (FR-D2, FR-I2)
**When** troco o profissional
**Then** owner/gerente mudam **qualquer um**; `basic` pode atribuir **a si mesmo** quando `professional_id` é **nulo** (caso comum do bot), mas **não** tira de outra pessoa

**Given** o novo profissional já tem atendimento no horário
**When** confirmo a troca
**Then** o sistema **avisa e deixa seguir** (mesma regra do encaixe, D1/3.3.1) — não bloqueia

**Given** o `select` de profissionais
**When** ele é exibido
**Then** lista **todos** os atendentes, **destacando** quem executa aquele serviço (o vínculo `professional_services` **sugere**, não restringe — 3.3.1)

**Given** a troca aplicada (FR-K2)
**When** ela é gravada
**Then** registra **quem alterou e quando** (padrão do `cancelled_by_user_id`); **não** mexe em horário/serviço/duração/preço (isso é 3.6)

> **Pré-requisito do Épico 6 (FR-A4).** O bot cria agendamentos com `professional_id` **nulo** (sem atribuição no MVP, DL-013); é pela 3.5 que o salão atribui pelo painel. **Dependência explícita da Story 6.4** (tratar pendentes) — sem a 3.5, um pendente do bot não tem como ganhar responsável.

### Story 3.6: Editar agendamento (remarcação unificada — serviço + horário + profissional)

As a dono/funcionário/profissional,
I want editar um agendamento (serviço, horário e profissional juntos, num formulário só),
So that eu ajuste um atendimento sem cancelar e recriar — inclusive trocar o profissional junto com o serviço que ele executa.

**Acceptance Criteria:**

**Given** um agendamento *pending*/*confirmed*
**When** abro **Editar** (botão claro no modal de detalhe, reusando o formulário de Novo agendamento pré-preenchido)
**Then** posso trocar **serviço**, **horário** e **profissional** juntos; o sistema **reabre a disponibilidade** (`AvailabilityService`), **checa conflito** (aviso, não bloqueio — D1) e **refaz os snapshots** de duração/preço quando o serviço muda; grava **auditoria** (quem editou e quando) e um **registro simples do que mudou** (de→para)

> **Editar unificado (DL-044).** A 3.6 **absorve o "trocar profissional" da 3.5**: em vez de um select isolado escondido no detalhe, um botão **Editar** único abre serviço + horário + profissional juntos. Resolve o paradoxo de atribuir um profissional a um serviço que ele não faz — troca-se os dois de uma vez.
>
> **Questão em aberto resolvida (era do DL-043):** guarda-se o estado anterior via **registro simples de alteração** (quem/quando/de→para) — **não** versionamento completo.

---

## Épico 4: Gestão de Clientes

**Objetivo:** manter cadastro, histórico e observações das clientes — full-stack. Estende a tabela `clients` (base criada no Épico 3) e entrega a UI de gestão.

**FRs:** FR-E1–E4 · **UX-DRs:** UX-DR11, UX-DR17

### Story 4.1: Cadastro e listagem de clientes

As a dono/funcionário/profissional,
I want manter o cadastro de clientes com busca,
So that eu encontre rapidamente quem atendo e registre quem chega sem WhatsApp.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** a tabela `clients` (base criada no Épico 3) é estendida com os campos de cadastro necessários (e-mail e data do primeiro agendamento), preservando `phone_whatsapp_normalized` e `is_deleted`

**Given** a lista de clientes (UX-DR11) — full-stack
**When** acesso a tela Clientes
**Then** vejo a lista com busca por nome ou número; estado vazio padronizado quando não há clientes (UX-DR17)

**Given** um cadastro manual (FR-E4)
**When** crio uma cliente pelo painel
**Then** o nome é obrigatório; WhatsApp, e-mail e demais campos são opcionais

**Given** o cadastro de uma cliente (FR-E1)
**When** é exibido
**Then** mostra nome, contato WhatsApp e data do primeiro agendamento

### Story 4.2: Perfil da cliente — observações e histórico

As a dono/funcionário/profissional,
I want ver o histórico e registrar observações de cada cliente,
So that eu personalize o atendimento (preferências, alergias, histórico de serviço).

**Acceptance Criteria:**

**Given** o perfil de uma cliente (FR-E2, UX-DR11) — full-stack
**When** acesso
**Then** vejo o histórico completo de agendamentos (serviço, data, status, profissional); estado vazio padronizado quando não há histórico (UX-DR17)

**Given** o campo de observações (FR-E3)
**When** adiciono ou edito observações livres
**Then** o texto é persistido e exibido no perfil

**Given** o perfil da cliente (UX-DR11)
**When** quero agendar para ela
**Then** existe o atalho "Novo agendamento para esta cliente" que leva ao fluxo de agendamento manual (Épico 3, Story 3.3)

---

## Épico 5: Financeiro *(renomeado de "Registro de Pagamentos" — DL-060; escopo AMPLIADO em 2 levas — DL-061/DL-062)*

> **Ampliação (DL-061/DL-062, 2026-08-12):** este épico deixa de ser só "registro de pagamentos" e passa a abrigar o bloco **Financeiro + Dashboard + Equipe + Permissões**, em **duas levas** (detalhe nos DLs). A **1ª leva já está quebrada em stories** (5.1–5.8, na ordem de implementação — ver abaixo, 2026-08-13); a **2ª leva** (Equipe/remuneração) segue registrada só nos DLs. Resumo:
> - **1ª leva:** **Financeiro** vira **menu próprio** — valor + **forma de pagamento OPCIONAL** + situação **pago/pendente**; **Recebimentos** por período (total recebido/pendente); **exportação CSV+PDF**; **situação financeira da cliente** em Clientes. **Dashboard** (leitura + exportação): faturamento **dia/semana/mês**, atendimentos, clientes, fluxo/semana *(sem "relatório anual" no 1º momento)*.
> - **2ª leva:** **Equipe** **sai de Configurações e vira menu próprio** (fonte de custo) — **remuneração** por profissional (comissão %/valor fixo; por serviço/por profissional; salário diário/semanal/mensal; **fixo+comissão coexistem**), modelo **previsão→real**, e **"quanto gastei com a equipe"** no Dashboard. *(Fora, evolução: metas/faixas de comissão.)*
> - **Permissões (DL-062):** visibilidade de **módulo** (não só ação/FR-I2); papéis **Dono/Profissional** (**"Básico" aposentado**); **toggles por pessoa** na Equipe (só o Dono, OFF por padrão — "Pode ver Financeiro/Dashboard"); quem não tem acesso **não vê o menu**; bloqueio **também no backend**.
> - **Posição no roadmap:** **ANTES do Épico 6** (DL-061). **Navegação:** desktop = Configurações na sidebar; mobile = Configurações pelo perfil; **tab bar mobile revista** para os novos módulos sem truncar.

**Objetivo:** dar ao salão **visão de gestão financeira** — recebimento por agendamento (registro manual), Recebimentos por período, Dashboard de leitura e, na 2ª leva, custo com a equipe — com **visibilidade por módulo e por papel** (DL-062). Sem gateway no MVP, mas com a abstração `PaymentGateway` preparada. Full-stack. **Posição (DL-061):** o bloco **sobe para ANTES do Épico 6**; o **Monitoramento do bot** (DL-058) fica com o Épico 6, **fora** das duas levas.

**FRs:** FR-F1–F5 · **NFRs:** NFR-O4 · **UX-DRs:** UX-DR12

> **1ª LEVA — quebra em stories na ordem de implementação (DL-061/DL-062, 2026-08-13; cortes 2026-08-14).** Reescreve as antigas 5.1–5.3 (base). **A ordem não é negociável:** a **fundação de permissões (5.1) vem primeiro** — sem ela, o Financeiro **nasceria visível para toda a equipe**, que é justamente o que o DL-062 existe para evitar. Depois o Financeiro (registro → recebimentos → **exportação CSV** → situação em Clientes) e o Dashboard.
> **Cortes de escopo (Renato, 2026-08-14):** **(a)** exportação **só CSV** — PDF é evolução (5.4); **(b)** **5.7 (navegação) não é story** — o ajuste da tab bar entra junto da story do módulo que a exige; **(c)** **5.8 (PaymentGateway) sai da leva** — vira evolução (não entrega nada visível). **Fora desta leva (2ª leva, DL-061):** remuneração de equipe, comissão, "quanto gastei com a equipe".

### Story 5.1: Fundação de permissões — visibilidade de MÓDULO + interruptores por pessoa (DL-062)

> **Refinamento (2026-08-14) — ver DL-062 → Refinamento.** (a) O papel foi
> **renomeado `manager` → `professional`**: os papéis são **DONO** e
> **PROFISSIONAL**. (b) O escopo do Profissional é **"vê, mas só o que é dele"**,
> tudo no **backend**: **Pendentes** reativado mas só os DELE (não atribuído só
> para quem gerencia a equipe; badge idem; **Confirmar/Recusar liberados ao Profissional nos pendentes DELE** — dono-do-item, sem reatribuir; o não atribuído fica com quem gerencia);
> **Clientes** (lista do módulo) só as que ELE atendeu — **exceto** a busca do
> agendamento, que acha qualquer cliente; **histórico da cliente** só os
> atendimentos DELE; **serviços** só os que ELE executa; **valores** não trafegam
> para Profissional sem Financeiro (regra pronta; sem campo hoje). (c) Cabeçalho:
> logo **e** nome juntos.

As a Dono,
I want conceder ou negar cada módulo (Financeiro, Dashboard) por pessoa,
So that módulos sensíveis não nasçam visíveis para toda a equipe.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** cada usuário ganha os interruptores de visibilidade de módulo (ex.: `can_view_financeiro`, `can_view_dashboard`), **default `false`**, com **estrutura extensível** para módulos futuros; os papéis passam a **Dono/Profissional** (o **"Básico" é aposentado** — migração converte os existentes; revisa DL-022/FR-I1/FR-I2)

**Given** o eixo de módulo (DL-062, camada de BACKEND)
**When** alguém sem o interruptor chama o endpoint do módulo (direto na API)
**Then** o backend **nega com `403`** — independentemente do front (guard de módulo, além da matriz de ações FR-I2)

**Given** o eixo de módulo (DL-062, camada de FRONT)
**When** a pessoa não tem o módulo
**Then** o item **não aparece no menu e a rota não é montada** — o módulo não existe para ela (não é tela com cadeado, nem item que dá erro ao clicar). **As duas camadas são obrigatórias e juntas** (DL-062, regra 5c)

**Given** a tela de **Equipe**, com os interruptores por pessoa (**"Pode ver Financeiro"**, **"Pode ver Dashboard"** e **"Pode gerenciar agendamentos de toda a equipe"**)
**When** os edito
**Then** **só o Dono** concede/revoga, os interruptores vêm **desligados por padrão**, e o **Dono não pode remover o próprio acesso** (DL-062, regra 5a)

**Given** a Agenda e o interruptor **"Pode gerenciar agendamentos de toda a equipe"** (`can_manage_all_appointments`, adição DL-062 2026-08-13)
**When** um Profissional **com** o interruptor opera a agenda
**Then** cria/remarca/cancela/atribui para **qualquer profissional** (delegação da operação da agenda **sem** ganhar Financeiro/Dashboard); **sem** o interruptor, só os **próprios**. *(Não é flag de módulo — é **escopo de ação** dentro da Agenda; lido da linha fresca → revogação imediata.)*

**Given** o padrão do Profissional (DL-062, item 3)
**When** um usuário Profissional sem interruptores acessa o sistema
**Then** vê/opera **apenas os próprios agendamentos e as clientes que atende** — sem Financeiro, sem Dashboard, sem agenda de terceiros, sem telas administrativas

**Given** a segurança (e2e — hostil por padrão)
**When** valido a story
**Then** há teste de que **sem o interruptor a API responde `403`** batendo direto **e** o item **não aparece** na navegação

### Story 5.2: Financeiro — registro de pagamento no agendamento (menu próprio)

As a Dono/Profissional com acesso a Financeiro,
I want registrar o pagamento recebido de um agendamento,
So that o salão tenha o histórico de recebimentos sem integração externa.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** a tabela `payments` é criada com `company_id`, `appointment_id` (FK → `appointments`, já existente desde o Épico 3), `amount`, **`method` NULLABLE (forma opcional)**, **`status` (`pago` | `pendente`)**, `created_by`, timestamps, e índices liderados por `company_id`

**Given** o módulo **Financeiro** (menu próprio, **título + ícone**), protegido pelo interruptor da 5.1
**When** registro o pagamento de um agendamento
**Then** informo o **valor** (obrigatório), escolho a **forma de pagamento** por dropdown (**opcional** — Dinheiro / PIX / Cartão de débito / Cartão de crédito / Outro) e a **situação** (**pago** / **pendente**)

**Given** a situação do pagamento é um dado **próprio** (não é o status do agendamento)
**When** registro como **pendente**
**Then** o pagamento fica pendente **sem** forçar o agendamento a *concluído* (a marcação de comparecimento segue pela 3.7); registrar como **pago** é o caminho normal do caixa

**Given** o eixo de módulo (DL-062)
**When** alguém sem o módulo tenta registrar/ler pagamentos
**Then** o backend nega com `403` e o menu não aparece para essa pessoa

### Story 5.3: Financeiro — Recebimentos (lista com filtro por período + totais)

As a Dono/Profissional com acesso a Financeiro,
I want ver os recebimentos de um período com os totais,
So that eu saiba quanto entrou e quanto ainda está pendente.

**Acceptance Criteria:**

**Given** a tela **Recebimentos**
**When** escolho um **período** (dia / intervalo)
**Then** vejo a lista de pagamentos do período e os **totais**: **total recebido** (pago) e **total pendente**

**Given** a agregação
**When** o backend calcula os totais
**Then** é sempre **escopado por `company_id`** (isolamento de tenant) e protegido pelo interruptor do módulo (`403` sem acesso)

### Story 5.4: Financeiro — exportação em CSV

> **Corte de escopo (Renato, 2026-08-14): SOMENTE CSV.** O CSV abre no Excel e
> resolve o caso real (contabilidade, comprovação). **PDF fica como evolução** —
> não bloqueia a 1ª leva.

As a Dono/Profissional com acesso a Financeiro,
I want exportar os recebimentos do período em CSV,
So that eu leve os números para fora do sistema (abre no Excel).

**Acceptance Criteria:**

**Given** a lista de Recebimentos de um período
**When** exporto
**Then** gero **CSV** com os mesmos dados e totais exibidos na tela *(PDF = evolução, fora desta leva)*

**Given** a exportação
**When** implementada
**Then** é construída de forma **reutilizável** — o **Dashboard (5.6)** reaproveita o mesmo mecanismo

### Story 5.5: Situação financeira da cliente (no módulo Clientes)

As a Dono/Profissional com acesso a Financeiro,
I want ver a situação financeira da cliente no perfil dela,
So that eu saiba quanto ela deve e o que já pagou.

**Acceptance Criteria:**

**Given** o perfil da cliente (Épico 4)
**When** tenho acesso ao módulo Financeiro
**Then** vejo **quanto a cliente deve**, **o que já pagou** e os **valores por atendimento**

**Given** o eixo de módulo (DL-062)
**When** a pessoa **não** tem o módulo Financeiro
**Then** o bloco de situação financeira **não aparece** no perfil da cliente (o resto do perfil segue normal)

### Story 5.6: Dashboard (menu próprio, somente leitura + exportação)

As a Dono/Profissional com acesso a Dashboard,
I want um painel de leitura com os números do negócio,
So that eu acompanhe faturamento e fluxo sem depender de planilha.

**Acceptance Criteria:**

**Given** o módulo **Dashboard** (menu próprio, título + ícone), protegido pelo interruptor `can_view_dashboard` da 5.1
**When** acesso
**Then** vejo, **somente leitura**: **faturamento por período (dia / semana / mês)**, **quantidade de atendimentos realizados**, **total de clientes cadastrados** e **média de fluxo de clientes por semana**

**Given** a exportação
**When** exporto o Dashboard
**Then** reaproveito o mecanismo da 5.4 (**CSV**). *(Sem "relatório anual" e sem PDF neste momento — evolução.)*

**Given** o eixo de módulo (DL-062)
**When** alguém sem o interruptor acessa
**Then** o backend nega com `403` e o menu não aparece

### ~~Story 5.7: Navegação~~ — *NÃO é story própria (corte 2026-08-14)*

> **Corte de escopo (Renato, 2026-08-14):** a navegação **não** é uma story
> separada. O **ajuste da tab bar mobile** (comportar o menu novo sem truncar)
> entra **junto da story que introduz o módulo novo** — ou seja, no Financeiro
> (5.2) quando ele vira menu próprio, e no Dashboard (5.6). Cada módulo que nasce
> é responsável por caber na navegação. Regra permanente de navegação (desktop =
> Configurações na sidebar; mobile = Configurações pelo perfil) segue no DL-061,
> não precisa de story.

### ~~Story 5.8: Abstração PaymentGateway~~ — *FORA da 1ª leva (corte 2026-08-14)*

> **Corte de escopo (Renato, 2026-08-14): SAI da 1ª leva.** Não entrega nada
> visível e prepara um futuro incerto (gateway de pagamento). Vira **evolução** —
> volta a entrar em cena **quando/se** houver integração real (ex.: Asaas). O
> registro manual de pagamento (5.2) opera sem ela. A abstração `PaymentGateway`
> segue **documentada** (abaixo) para quando a hora chegar; não é trabalho da leva.

As a operador da plataforma,
I want a abstração de gateway de pagamento preparada sem integração ativa,
So that uma futura integração (ex: Asaas) não exija mudança no core do produto.

**Acceptance Criteria:**

**Given** a interface `PaymentGateway` (`createCharge`, `getChargeStatus`, `refund`) (NFR-O4)
**When** o `PaymentsModule` inicializa
**Then** usa o `NullPaymentGateway` como implementação ativa

**Given** o `NullPaymentGateway`
**When** qualquer método é chamado
**Then** lança `NotImplementedException` — sem cobrança real no MVP

**Given** a arquitetura (NFR-O4)
**When** o registro manual de pagamento opera
**Then** funciona de forma totalmente independente do gateway, sem acoplamento ao `PaymentGateway`

---

## Épico 5B: Agendamento pela Cliente (link público)

**Escopo FECHADO (DL-049) — 3 stories, sem ampliação.** A cliente agenda por `/agendar/{slug}` sem login; entra **pendente**; o estabelecimento confirma/recusa no painel; o cancelamento (se não confirmar) é **manual** (3.4). **Sem expiração automática / sem status "expirado".** Fundação de pendentes que o bot (Épico 6) reusa. Texto **neutro** (DL-048), **mobile-first**. Slug gerado do nome da empresa, **editável em Configurações, sem redirect**.

**Jornada:** abre o link → escolhe serviço, data, horário → informa **nome + telefone (obrigatórios)** e **profissional (opcional)** → consente (LGPD) → envia → tela "Recebido! O estabelecimento vai confirmar." → entra **pendente** na agenda.

### Story 5B.1: Fundação pública (rota por slug + branding)
Rota `/agendar/{slug}` **sem login**. Resolve empresa por **slug** (`findBySlug` unscoped; controller **pré-tenant** numa 3ª categoria `PUBLIC_TENANT_CONTROLLERS` + `PublicSlugTenantMiddleware`; guard-rail estendido + **e2e de isolamento**). Retorna branding **whitelisted** (nome, logo, cor), **serviços ativos** e **profissionais ativos**. Spec: `5B-1-fundacao-publica.md`.

### Story 5B.2: Disponibilidade pública + criar pendente
`GET` de horários livres (reusa `AvailabilityService`) e `POST` que cria agendamento **pendente**, `source=link`. Campos: serviço, data, horário, **nome (obrig.)**, **telefone/WhatsApp (obrig.)**, **profissional (opcional)**, **consentimento LGPD (obrig.)**. **Segurança (hostil por padrão — 7 ACs testados batendo a API direto):** janela **antispam de 2h** por telefone/IP (mensagem clara na tela) · rate limit por IP e por slug · validação/regex + sanitização em todos os inputs (nome; telefone BR; tamanho máx; whitelist de caracteres) · honeypot · whitelist estrita de campos (rejeita extra) · XSS escapado na saída. Tela: "Recebido! O estabelecimento vai confirmar." Spec: `5B-2-agendamento-publico-criar-pendente.md`.

### Story 5B.3: Pendentes no painel (confirmar/recusar + contador)
Tela **Pendentes**: **Confirmar** (`PATCH :id/confirm`, `professionalId` **opcional**) e **Recusar** (`PATCH :id/reject`, **motivo obrigatório**), auditados em `appointment_changes`. Confirmar leva ao badge **"confirmado" já existente (3.7)** — **sem badge novo**; disponível **também no modal de detalhe** (caso presencial — DL-046). **Contador de pendentes** = estado compartilhado no front (context/provider, refresh curto) **dentro desta story** (não é story separada). Permissão **owner/gerente**. Spec: `5B-3-pendentes-confirmar-recusar.md`.

> **Fora do Épico 5B:** filtro por status na agenda = ajuste **3.7.01** (DL-028, commit `feat`). **Dívida consciente (fora do 1º ship):** carrinho multi-serviço (DL-040); notificação automática à cliente (Épico 6/bot).

## Épico 6: Ciclo de Agendamento via WhatsApp (Bot)

**Objetivo:** o diferencial, **adiado** para depois da base manual estar vendável (DL-035). A cliente agenda e cancela pelo WhatsApp; o salão trata os pendentes pelo painel. Consome a base do Épico 3 (`appointments`, `AvailabilityService`, `clients`) — não recria tabelas de agendamento.

> **REVISADO (2026-08-10, DL-054 a DL-058), antes de construir:**
> 1. **Produção só na WhatsApp Cloud API oficial (Meta)** — Evolution API só dev, número descartável (DL-054). Motivo: banimento de APIs não oficiais em 2026; o número em risco é o **do cliente**.
> 2. **Carrinho multi-serviço fora do MVP** (fast-follow, DL-055): **uma conversa = um serviço**. As notas do DL-040 (carrinho / disponibilidade encadeada) ficam para depois.
> 3. **Redis fora de vez** (DL-056): estado de conversa **e jobs agendados** no MySQL. BullMQ vira um **scheduler simples** (tabela `scheduled_tasks` com `due_at` + rotina a cada minuto, dentro da própria API — sem serviço novo).
> 4. **Interruptor de WhatsApp por plano** (DL-057, novo — Story 6.11): introduz o conceito de **PLANO** (`plan` básico|pró + `whatsapp_enabled`).
> 5. **Monitoramento (6.8) → roadmap** (DL-058, com Financeiro/Dashboard); no épico fica só log msg in/out + estado da conexão.
> 6. **Já entregues pelo 5B:** Story **6.4** e Story **6.9** (ver marcações abaixo).
>
> **Pré-requisito não-técnico (começa ANTES do código):** verificação de negócio na Meta, Business Manager e número dedicado — leva dias (DL-054).
> **Custos (Meta, ago/2026):** serviço (resposta ≤24h) **grátis**; utilidade (confirmação/lembrete) ≈ **R$ 0,04–0,05**; marketing não usado. Fluxo principal gratuito; ≈ **R$ 30/mês** por salão com 300 agendamentos.

**FRs:** FR-A1–A8, FR-B3/B5/B6 *(FR-B1/B2/B4 → Épico 5B)*, FR-C1–C3, FR-C5, FR-C6, FR-J2 · **NFRs:** NFR-A1, NFR-A3, NFR-C1, NFR-C3, NFR-O3 *(NFR-C2 monitoramento → roadmap, DL-058)* · **UX-DRs:** UX-DR1–DR6, UX-DR9, UX-DR18

### Story 6.1: Abstração WhatsAppProvider e integração com a Cloud API oficial (Meta)

> **Revisada (DL-054, 2026-08-10):** produção usa **exclusivamente a WhatsApp Cloud API oficial da Meta**. A Evolution API fica **só para desenvolvimento**, com número descartável — **nunca** produção (banimento de APIs não oficiais em 2026; o número em risco é o do cliente). A interface `WhatsAppProvider` **permanece** — é ela que torna a troca barata (NFR-O3). **Pré-requisito não-técnico:** verificação de negócio na Meta + Business Manager + número dedicado, iniciados **antes** desta story.

As a operador da plataforma,
I want enviar e receber mensagens de WhatsApp por uma interface abstrata, sobre a Cloud API oficial da Meta,
So that o bot opere sobre um provider oficial sem acoplar a lógica de negócio a ele e sem risco de banimento do número do cliente.

**Acceptance Criteria:**

**Given** a interface `WhatsAppProvider` (`sendMessage`, `getConnectionStatus`, `registerIncomingMessageHandler`)
**When** o `WhatsAppModule` inicializa
**Then** a factory lê `companies.whatsapp_provider` e instancia o provider da **Cloud API oficial** para o tenant (NFR-O3); `EvolutionApiProvider` só é selecionável em ambiente de **dev**

**Given** a migration desta story
**When** aplicada
**Then** `companies` ganha `whatsapp_provider` (**sem default `evolution_api`** — definido no provisionamento) e os campos de credencial/identificação do número exigidos pela Cloud API (ex.: `phone_number_id`), por tenant

**Given** uma mensagem recebida pela cliente
**When** o webhook da **Cloud API** é chamado
**Then** o `WhatsAppController` resolve o `company_id` pelo número/identificador e dispara o handler registrado com a `IncomingMessage`

**Given** uma mensagem de saída
**When** `sendMessage` é chamado
**Then** a mensagem é entregue via **Cloud API oficial**; falha permanente lança `WhatsAppDeliveryException`. *(Custo: mensagens de serviço — resposta ≤24h — são grátis; utilidade ≈ R$ 0,04–0,05, DL-054.)*

**Given** um número conectado e um handler de echo temporário (smoke test de ponta a ponta — maior risco técnico, validar cedo)
**When** envio uma mensagem real ao número do bot
**Then** o webhook recebe, o handler dispara e o provider responde de volta ao WhatsApp de origem — o ciclo recebe→processa→envia é comprovado antes da Story 6.2

### Story 6.2: Máquina de estados do bot e estado de conversa

As a cliente,
I want que o bot mantenha o contexto da minha conversa e me guie passo a passo,
So that eu consiga agendar sem me perder, mesmo se digitar algo inesperado.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** a tabela `whatsapp_conversations` é criada (estado, `context_json`, `company_id`, `phone_whatsapp`) como fonte de verdade, e a FK `whatsapp_conversations.appointment_id → appointments` é adicionada (a tabela `appointments` já existe desde o Épico 3)

**Given** o `ConversationStateService` (**DL-056: sem Redis**)
**When** lê/escreve estado
**Then** persiste **direto no MySQL** (`whatsapp_conversations`), **sem Redis** — no volume real (dezenas de conversas/dia) o MySQL resolve sozinho (DL-056: Redis saiu de vez, do estado e dos jobs)

**Given** uma mensagem com keyword de agendamento configurável (FR-A1)
**When** não há conversa ativa
**Then** o `BotOrchestrator` cria a conversa e inicia o fluxo (estado `AWAITING_SERVICE`), implementando a máquina de estados da UX-DR1

**Given** uma entrada não reconhecida dentro de um passo (FR-A7)
**When** o bot avalia
**Then** responde com o fallback correto (FB-01 a FB-06, UX-DR5), sem perder o contexto

**Given** as regras de copy (UX-DR6)
**When** o bot monta qualquer mensagem
**Then** segue: zero emojis, "você", frases curtas, datas `Dia, DD/MM`, horas `HH:MM`, variáveis entre colchetes

**Given** uma mensagem recebida em condições normais (NFR-A1)
**When** o bot processa
**Then** a resposta é enviada em até 3 segundos

> **Nota multi-serviço (DL-040) — FAST-FOLLOW, fora do MVP do bot (DL-055).** No MVP, **uma conversa =
> um serviço**; a máquina de estados **não** monta carrinho. Guardado para depois: estado de
> **"montando carrinho"** (coleta serviços num loop "deseja adicionar outro?", fecha a lista, e só
> então — Story 6.3 — calcula os horários do **bloco inteiro**), com a lista do carrinho + o
> `group_id` (UUID) no `context_json` agrupando os N `appointments` encadeados. É a parte mais cara e
> menos pedida — cortada do 1º ship (mesmo tratamento do 5B). O modelo aditivo do DL-040 segue válido;
> só a implementação no bot é adiada.

### Story 6.3: Fluxo de agendamento via bot

As a cliente,
I want agendar um serviço pelo WhatsApp escolhendo serviço, dia e horário e confirmando,
So that eu marque meu atendimento sem ligar para o salão.

**Acceptance Criteria:**

**Given** o fluxo de 3 etapas (FR-A2) e a biblioteca MSG-A01–A07 (UX-DR2), sobre o `AvailabilityService` (Épico 3)
**When** a cliente avança serviço → dia → horário
**Then** o bot apresenta as opções em cada passo; com exatamente 1 serviço, pula a seleção; sem disponibilidade no dia, oferece outros dias (FR-A5)

**Given** o horário escolhido
**When** o bot pede confirmação (MSG-A05b, "1 sim / 2 não")
**Then** com "2" volta para escolher outro horário; só com "1" o pré-agendamento é criado

**Given** a confirmação da cliente (FR-A6, NFR-C1)
**When** `AppointmentsService.createFromBot()` executa em transação com `SELECT ... FOR UPDATE`
**Then** dois clientes concorrendo pelo mesmo slot resultam em exatamente 1 pré-agendamento; o outro recebe indisponibilidade imediata (MSG-A07)

**Given** uma cliente nova
**When** o pré-agendamento é criado
**Then** o `findOrCreate` insere ou recupera a cliente por `phone_whatsapp_normalized` na tabela `clients` (Épico 3), e o agendamento entra com `source = whatsapp`, status *aguardando confirmação*, `professional_id` nulo (FR-A4, FR-K1, FR-K3, FR-A8)

**Given** a primeira mensagem e a confirmação (FR-J2)
**When** o bot se comunica
**Then** assina com o nome da instalação; a cliente recebe "solicitação enviada ao salão, pode haver ajuste, você será avisada" (MSG-A06)

> **Nota multi-serviço (DL-040) — FAST-FOLLOW, fora do MVP do bot (DL-055).** Guardado para depois:
> disponibilidade **ENCADEADA** + N `appointments` com `group_id`. Ao fechar o carrinho, o bot
> calcularia os horários do **bloco inteiro** (cada serviço sequencial: o próximo começa ao **fim do
> anterior + intervalo**, D4/DL-032, nunca simultâneo) e criaria **N `appointments` agrupados por
> `group_id`**, cada um com seu `price_snapshot`/`professional_id`. **Risco técnico** (achar um início
> onde A e depois B estejam livres) e a simplificação possível (encadear só quando um profissional faz
> todos; senão marcar o primeiro e a recepção completa) ficam registrados para a época. No MVP,
> **1 serviço por conversa** — a criação de 1 `appointment` segue atômica (`SELECT ... FOR UPDATE`).

### Story 6.4: Notificação ao salão e confirmação/recusa pelo painel

> **✅ ENTREGUE PELO ÉPICO 5B (5B.3, PR #43).** A tela de Pendentes com confirmar/recusar inline (justificativa obrigatória na recusa) e o contador já existem — a 5B construiu a fundação de pendentes que o bot reusa. O que **resta para o Épico 6** é apenas **disparar a notificação ao salão via WhatsApp** (MSG-B01/B02) quando o pré-agendamento nasce do **bot** (o gatilho); o tratamento no painel já está pronto. Marcada como entregue no retrato, não como trabalho pendente.

As a dono/funcionário/profissional,
I want receber a solicitação e confirmá-la ou recusá-la pelo painel,
So that eu controle quais agendamentos aceito.

> **Depende da Story 3.5 (DL-043).** O bot cria o pré-agendamento com `professional_id` **nulo** (FR-A4/DL-013); atribuir o responsável pelo painel é a **3.5**. Sem ela, o pendente é confirmado mas fica sem profissional — a 3.5 tem que estar pronta antes desta.

**Acceptance Criteria:**

**Given** um pré-agendamento criado (FR-B1)
**When** o `NotificationsModule` consome o evento
**Then** notifica o salão via WhatsApp (MSG-B01 solo / MSG-B02 multi) direcionando ao painel — sem "1/2" por WhatsApp (premissa do canal, mantida por DL-051; antes DL-018); o painel exibe o pendente

**Given** a tela Pendentes (UX-DR9)
**When** confirmo um pendente (FR-B2, FR-B3)
**Then** a confirmação é inline (sem modal), o status vai a *confirmado* e a cliente recebe MSG-B04

**Given** uma recusa (FR-B4)
**When** abro o modal de recusa
**Then** a justificativa é obrigatória (botão desabilitado até preenchida); sem justificativa, a recusa não é processada

**Given** uma recusa com justificativa (FR-B5)
**When** confirmo
**Then** a cliente recebe MSG-B05 com o motivo e sugestões de outras datas/horários

**Given** a matriz de permissões (FR-I2)
**When** confirmo/recuso
**Then** apenas papéis autorizados conseguem; profissional só age sobre os próprios ou não atribuídos

> **Nota (DL-035):** o status *aguardando confirmação* ("pendente") e a tela de Pendentes só existem com o bot — no fluxo manual (Épico 3) todo agendamento já entra *confirmado*.

### Story 6.5: Timeout de 2 horas em horário comercial

As a cliente,
I want ser avisada se o salão demorar a responder,
So that eu saiba que minha solicitação ainda está em análise.

**Acceptance Criteria:**

**Given** um pré-agendamento criado via bot (FR-B6)
**When** ele é registrado
**Then** uma tarefa `appointment_timeout` é gravada em `scheduled_tasks` com `due_at` calculado em horário comercial, usando `company.timezone` (ADR-008) — **scheduler em MySQL, sem BullMQ/Redis (DL-056)**; a rotina de 1 min a dispara quando vence

**Given** 2 horas de horário comercial sem confirmação/recusa
**When** a rotina do scheduler encontra a tarefa vencida
**Then** a cliente recebe MSG-B06 ("em análise"), a tarefa vira `done` e o status do agendamento permanece *aguardando confirmação* — sem cancelamento automático no MVP

**Given** o agendamento confirmado ou recusado antes do prazo
**When** isso acontece
**Then** a tarefa em `scheduled_tasks` é marcada `cancelled` e não dispara (não notifica indevidamente)

### Story 6.6: Cancelamento pela cliente via bot

As a cliente,
I want cancelar um agendamento pelo WhatsApp,
So that eu libere o horário quando não puder comparecer.

**Acceptance Criteria:**

**Given** uma mensagem com intenção de cancelar (FR-C1, UX-DR4)
**When** o bot reconhece a intenção
**Then** apresenta os dados do agendamento vigente para confirmação (MSG-C01)

**Given** mais de um agendamento futuro (FR-C2)
**When** a cliente pede cancelamento
**Then** o bot pergunta qual cancelar (MSG-C02)

**Given** a confirmação do cancelamento (FR-C3, FR-C5)
**When** a cliente confirma
**Then** o status vai a *cancelado*, o slot é liberado e o profissional é notificado automaticamente (MSG-C03); não há política de antecedência mínima

### Story 6.7: Notificação à cliente no cancelamento pelo painel

As a dono/profissional/funcionário,
I want que a cliente seja avisada quando eu cancelo pelo painel,
So that ela saiba do cancelamento e possa reagendar.

**Acceptance Criteria:**

**Given** uma cliente com WhatsApp cadastrado (FR-C6) — complementa a Story 3.4
**When** o cancelamento é feito pelo painel
**Then** ela recebe MSG-C06 informando o cancelamento e oferecendo reagendamento

**Given** uma cliente sem WhatsApp (FR-D8)
**When** o cancelamento é feito
**Then** nenhuma notificação é disparada

**Given** o modal de cancelamento (UX-DR18)
**When** ele abre
**Then** o texto é condicional: "a cliente será notificada" se há WhatsApp, ou "comunicação por sua conta" se não há

### Story 6.8: Resiliência do provider WhatsApp (mínimo) — monitoramento/alertas → roadmap

> **Revisada (DL-058, 2026-08-10):** o **monitoramento/alertas** (NFR-C2) **sai do Épico 6 e vai para o roadmap**, junto de **Financeiro** e **Dashboard** — são todos *"coletar dado e mostrar"* e a estrutura de coleta é comum. No épico fica só o **mínimo**: **log de mensagem que entra e sai, com resultado**, e **visibilidade do estado da conexão**. A resiliência a falha temporária (NFR-C3) permanece.

As a operador da plataforma (Renato),
I want registrar as mensagens que entram/saem e enxergar o estado da conexão, e não perder mensagens em falhas temporárias,
So that eu tenha o mínimo de observabilidade e o serviço aguente o provider oscilar.

**Acceptance Criteria:**

**Given** o mínimo de observabilidade (DL-058)
**When** uma mensagem entra ou sai
**Then** fica **registrada com o resultado** (entregue/falha), e o **estado da conexão** do provider é **visível** — sem sistema de alertas (esse é roadmap)

**Given** uma falha temporária do provider (NFR-C3)
**When** mensagens chegam durante a indisponibilidade
**Then** são registradas e processadas quando a conectividade volta, sem perda de contexto do fluxo em andamento

> **No roadmap (DL-058):** alertas de queda/entrega ao Renato (NFR-C2) e o painel de monitoramento entram com Financeiro/Dashboard — mesma estrutura de coleta.

### Story 6.9: Detecção de pendentes por polling no painel

> **✅ ENTREGUE PELO ÉPICO 5B (5B.3, PR #43).** O polling de `GET /appointments/pending-count` em background, o badge que persiste e o toast que não recarrega a página já existem desde a 5B. Marcada como entregue no retrato, não como trabalho pendente. Fica aqui só como registro da FR de origem.

**Acceptance Criteria:**

**Given** o painel aberto (NFR-A3, ADR-011)
**When** o polling em background consulta `GET /appointments/pending-count` a cada 15–30s
**Then** atualiza apenas o badge de pendentes e dispara um toast — nunca recarrega a página, não fecha modais nem apaga texto em edição

**Given** o badge de pendentes (UX-DR7)
**When** há pendentes
**Then** permanece visível até o salão tratar; o toast é alerta momentâneo

**Given** a fonte de verdade (MySQL) e a atomicidade (NFR-C1)
**When** o polling lê
**Then** apenas lê o estado já salvo, sem risco de perda; o conflito de slot segue protegido pelo `SELECT ... FOR UPDATE`

### Story 6.10: Lembrete automático de agendamento via WhatsApp

> **Status: PLANEJADA — não construir agora.** Registrada no roadmap (Winston, 2026-07-17)
> para quando o bot existir. Depende 100% do canal WhatsApp (Story 6.1); sem ele, não há como
> enviar. Reduz no-show — valor direto para o salão.

As a cliente,
I want receber um lembrete automático do meu agendamento pelo WhatsApp,
So that eu não esqueça e o salão reduza as faltas.

**Acceptance Criteria (rascunho — a detalhar na época):**

**Given** um agendamento *confirmado* com WhatsApp da cliente cadastrado
**When** falta o intervalo configurado para o horário (ver decisão abaixo)
**Then** o bot envia um lembrete assinado com o nome da instalação (ex.: "você tem [serviço] amanhã às [hora]"), respeitando as regras de copy (UX-DR6) e o `company.timezone` (ADR-008)

**Given** o controle de idempotência
**When** o lembrete é enviado
**Then** `appointments.reminder_sent_at` é gravado (campo novo, análogo a `timeout_notified_at`) para nunca enviar em duplicidade; agendamentos cancelados/concluídos antes do disparo não recebem lembrete

**Given** o scheduler em MySQL (DL-056, mesmo mecanismo da 6.5)
**When** um agendamento é criado/confirmado
**Then** uma tarefa `appointment_reminder` é gravada em `scheduled_tasks` com `due_at` no momento do lembrete; a rotina de 1 min a dispara ao vencer, e ela vira `cancelled` se o agendamento mudar de estado antes — **sem BullMQ/Redis**

**Given** uma cliente sem WhatsApp (FR-D8)
**When** o lembrete seria enviado
**Then** nenhuma notificação é disparada

**Decisão a definir na época:** antecedência do lembrete — 24h fixas? Configurável por instalação
(ex.: 24h/3h/ambos)? Definir com dados dos primeiros salões. (Depende também de `whatsapp_provider`
ativo e da resiliência da Story 6.8.)

### Story 6.11: Interruptor de WhatsApp por plano (novo — DL-057)

> **Introduz o conceito de PLANO no produto** (não existia). **Dashboard e Financeiro (roadmap) vão depender de `plan`.** Gate de entrada do bot: sem ligar o interruptor, nada do Épico 6 opera para o tenant.

As a dono,
I want ligar e desligar o WhatsApp em Configurações, dentro do que o meu plano permite,
So that eu controle o canal sem conseguir habilitar o que não contratei.

**Acceptance Criteria:**

**Given** a migration desta story
**When** aplicada
**Then** `companies` ganha **`plan`** (`basico` | `pro`) e **`whatsapp_enabled`** (boolean, default `false`) — `plan` é definido **por Renato no provisionamento** (Story 1.9), o dono **não** altera

**Given** o dono em Configurações no plano **Pró**
**When** liga/desliga o WhatsApp
**Then** `whatsapp_enabled` alterna; com ele **desligado**, o bot não processa nem envia nada para o tenant

**Given** o dono no plano **básico** (FR-I2, gating por plano)
**When** abre Configurações
**Then** a opção de WhatsApp aparece **bloqueada** com *"disponível no plano Pró"* — não consegue ligar; **só** Renato muda o plano (operação manual)

**Given** o backend (defesa em profundidade, não só a UI)
**When** uma requisição tenta habilitar `whatsapp_enabled` num tenant `basico`
**Then** é **rejeitada** — o gating não depende do front

> **Fora de escopo agora (DL-057):** cobrança, upgrade automático, autoatendimento de plano. Mudar de plano é **operação manual do Renato**.

---

## Épico 7: Acesso mobile — painel responsivo instalável (PWA) — ✅ 1ª leva ENTREGUE

**Objetivo:** entregar o **painel completo no celular** — o mesmo painel web, **responsivo** e **instalável como PWA** (adicionar à tela inicial, ícone, splash, shell offline mínimo), com **funcionalidade completa** (as mesmas ações do desktop). **Não** é um app nativo separado somente leitura.

> **Status (DL-060, 2026-08-11): 1ª leva ENTREGUE no `main` e FORA da fila.** PWA (7.1) + painel-app (7.2 1ª leva) + agenda em lista + estados (7.3), PRs #51–#59. A antiga priorização do DL-051 ("ANTES do Épico 5/6") está **cumprida/vencida**. A **2ª leva (7.2.NN)** passa à faixa de **updates contínuos** (ver **## Roadmap — ordem de execução**), não é mais um bloco à frente de 5/6.

> **Reformulado por DL-051 (2026-07-30), que revoga DL-018 e o P7 do plano 5B.** Antes: app React Native/Expo, somente leitura, "por último no roadmap (DL-035)". Agora: responsividade + PWA do painel existente, ações completas. **Motivo:** muitos estabelecimentos-alvo não têm computador; sem ação plena no celular o produto não é vendável para esse perfil — por isso **deixa de ser o último**. *(A posição relativa a 5/6 foi atualizada pelo DL-060 — ver acima.)* A base técnica já existe: o painel tem navegação responsiva (UX-DR7, tabs no rodapé <768px) e todas as ações (5B.3, 3.3, 3.4, 3.6) — o épico é **completar a responsividade das telas** e **empacotar como PWA**, sem backend novo. As stories abaixo foram reescritas nesse sentido; os ACs finos serão fechados na story de execução.

**FRs:** FR-H1, FR-H2, FR-H3, FR-H4 · **UX-DRs:** UX-DR7, UX-DR16, UX-DR17

### Story 7.1: Painel instalável como PWA

As a dono/profissional que opera pelo celular,
I want instalar o painel na tela inicial do celular e abri-lo como um app,
So that eu acesse o sistema sem depender de um computador.

**Acceptance Criteria (a detalhar na execução):**

**Given** o painel web servido em produção
**When** abro no navegador do celular (iOS/Android) e escolho "adicionar à tela inicial"
**Then** o painel instala como PWA (manifest com nome/ícone/tema; abre em tela cheia, sem barra do navegador)

**Given** o PWA instalado
**When** abro sem conexão momentânea
**Then** o shell básico carrega (offline mínimo) e as ações que exigem rede exibem estado claro de "sem conexão" — sem tela branca

### Story 7.2: Paridade de ações do painel no celular

As a dono/profissional no celular,
I want as mesmas ações do desktop nas telas do painel,
So that eu confirme/recuse pendentes, crie, cancele e remarque agendamentos sem trocar de dispositivo.

**Acceptance Criteria (a detalhar na execução):**

**Given** o painel no celular (UX-DR16, DL-051)
**When** navego pelas telas (Agenda, Pendentes, Clientes, Configurações)
**Then** cada tela é operável em telas pequenas (layout responsivo, alvos de toque adequados), com a mesma navegação do painel (UX-DR7)

**Given** a tela Pendentes no celular (FR-H2, FR-H3)
**When** trato um pendente
**Then** **confirmo e recuso** ali mesmo (as mesmas ações do desktop) — **sem** restrição de "somente leitura"

**Given** as ações de agendamento (criar/cancelar/remarcar — FR-D, 3.3/3.4/3.6)
**When** as executo pelo celular
**Then** funcionam como no desktop, reaproveitando os mesmos endpoints (sem backend novo)

> **Escopo em 2 levas (Sally + Renato, 2026-07-30).** A 7.2 vai à Amelia como **1ª leva** (casca app + bottom sheets essenciais + toolbar única + Configurações usável + Perfil mínima); ver `ux/…/painel-mobile-ux-spec.md` §11.

### Story 7.2.NN: Painel mobile — 2ª leva (agenda cheia + refinos)

Ajuste fora de escopo da 7.2 (versionamento DL-028: X.Y.NN vinculado à story de origem), **registrado para não sumir do roadmap**. Detalhe em `ux/…/painel-mobile-ux-spec.md` (§5.2/§5.3/§5.4/§11.2).

> **ENCOLHEU (retrato 2026-08-10):** como a agenda mobile virou **lista** (`AgendaList`, não grade de horas), os itens abaixo de **grade/timeline perderam sentido e SAÍRAM** da 2ª leva: ~~overlap lado-a-lado "+N"~~, ~~timeline mesclada multi-profissional~~ e ~~linha de "agora" + auto-scroll~~. **Restou:** multi-profissional como **filtro** e **Perfil completa**.

- ~~**Overlap lado-a-lado + indicador “+N”** para horários sobrepostos~~ — **removido** (fazia sentido na grade; a lista não tem colunas de tempo sobrepostas).
- ~~**Timeline mesclada multi-profissional**~~ — **vira só filtro** (abaixo); os chips na timeline não existem sem grade.
- ~~**Linha de “agora” + auto-scroll**~~ — **removido** (não há eixo de horas contínuo na lista).
- **Multi-profissional como filtro** — **sheet de filtros** por origem/profissional (ícone `⚲` na toolbar); reintroduz Todos/WhatsApp/Manual + por profissional que a 1ª leva deixou de fora.
- **Perfil completa** (mais preferências, além de identidade/tema/versão/Sair).

**Critério do corte (atualizado):** a 1ª leva é o app **parecer app** e ser usável. O que sobra na 2ª leva (filtros + Perfil) não depende de backend novo. O que resolvia **agenda cheia em grade** foi descartado ao adotar a lista.

### Story 7.3: Consulta e estados no celular

As a dono/profissional no celular,
I want ver a agenda e os pendentes com estados claros no celular,
So that eu acompanhe o dia mesmo fora do balcão.

**Acceptance Criteria (a detalhar na execução):**

**Given** a Agenda no celular (FR-H1, UX-DR16)
**When** acesso
**Then** vejo a agenda do usuário autenticado em visões dia e semana, legível no celular

**Given** um dia/tab sem itens (UX-DR17)
**When** abro Agenda ou Pendentes
**Then** vejo o estado vazio padronizado

