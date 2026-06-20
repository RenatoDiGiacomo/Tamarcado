---
stepsCompleted: [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
documentsIncluded:
  - prds/prd-Tamarcado-2026-06-15/prd.md
  - prds/prd-Tamarcado-2026-06-15/addendum.md
  - architecture/arch-Tamarcado-2026-06-15/architecture.md
  - epics.md
  - ux/ux-Tamarcado-2026-06-15/ux-spec.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-17
**Project:** Tamarcado

## Document Inventory

| Type | File | Size |
|------|------|------|
| PRD | prds/prd-Tamarcado-2026-06-15/prd.md (+ addendum.md) | 29.952 / 7.696 bytes |
| Architecture | architecture/arch-Tamarcado-2026-06-15/architecture.md | 56.454 bytes |
| Epics & Stories | epics.md | 54.977 bytes |
| UX Design | ux/ux-Tamarcado-2026-06-15/ux-spec.md | 44.169 bytes |

No duplicates found. All four core document types present.

## PRD Analysis

### Functional Requirements (62 FRs em 11 grupos)

**FR-A — Bot de Agendamento (inbound da cliente):**
- FR-A1: Reconhece intenção de agendar via palavras-chave configuráveis por instalação; inicia fluxo sem intervenção.
- FR-A2: Fluxo de 3 etapas sequenciais — serviço → dia disponível → horário disponível.
- FR-A3: Slot disponível = pelo menos um profissional livre; bot não identifica/exibe qual profissional.
- FR-A4: Ao confirmar, registra pré-agendamento *aguardando confirmação* com `professional_id` nulo; notifica dono/funcionário (multi) ou profissional (solo).
- FR-A5: Sem horário no dia escolhido → bot apresenta outros dias com disponibilidade.
- FR-A6: Atomicidade — dois clientes no mesmo slot resultam em apenas um pré-agendamento (ver NFR-C1).
- FR-A7: Fallback para entradas não reconhecidas, redirecionando ao passo atual (conteúdo definido pela UX).
- FR-A8: Um agendamento = um único serviço por vez.

**FR-B — Confirmação e Recusa pelo Profissional:**
- FR-B1: Notificação de nova solicitação com nome, serviço, data, horário; aparece *aguardando confirmação* sem profissional.
- FR-B2: Confirma/recusa exclusivamente pelo painel web; número do bot é dedicado à Evolution API; app é somente leitura (DL-018).
- FR-B3: Confirmado → status *confirmado* + mensagem automática à cliente.
- FR-B4: Recusa exige justificativa obrigatória.
- FR-B5: Após recusa, bot notifica cliente com motivo e sugere outras datas/horários.
- FR-B6: 2h em horário comercial para responder; expirado → bot avisa "em análise"; sem cancelamento automático.

**FR-C — Cancelamento:**
- FR-C1: Cliente cancela via mensagem WhatsApp.
- FR-C2: Bot identifica intenção, apresenta dados; se houver múltiplos, pergunta qual.
- FR-C3: Após confirmação, status *cancelado*, libera slot, notifica profissional.
- FR-C4: Dono/profissional/funcionário cancelam pelo painel (matriz de permissões, FR-I2).
- FR-C5: Sem antecedência mínima no MVP.
- FR-C6: Cancelamento pelo painel/app notifica cliente via WhatsApp (se houver número) com reagendamento.

**FR-D — Painel Web/Agenda:**
- FR-D1: Visões dia/semana/mês.
- FR-D2: Dono/funcionário veem todos; profissional vê só a própria.
- FR-D3: Cada entrada: cliente, serviço, horário, status, indicador de origem.
- FR-D4: Cancelar (matriz FR-I2).
- FR-D5: Dono/funcionário criam manual para qualquer um; profissional só para si.
- FR-D6: Manual entra *confirmado* automaticamente.
- FR-D7: Contato WhatsApp opcional no manual.
- FR-D8: Manual sem WhatsApp não dispara notificação.

**FR-E — Painel Web/Clientes:**
- FR-E1: Cadastro com nome, WhatsApp, data do primeiro agendamento.
- FR-E2: Histórico completo de agendamentos por cliente.
- FR-E3: Observações livres.
- FR-E4: No cadastro manual, nome obrigatório; demais opcionais.

**FR-F — Painel Web/Pagamentos:**
- FR-F1: Registro manual (valor + forma via dropdown: Dinheiro/PIX/Débito/Crédito/Outro).
- FR-F2: Dono vê e registra de todos.
- FR-F3: Profissional vê/registra só os próprios.
- FR-F4: Funcionário registra de qualquer um; não vê relatórios consolidados.
- FR-F5: Sem gateway no MVP.

**FR-G — Painel Web/Configurações:**
- FR-G1: Serviços (nome, duração, preço).
- FR-G2: Horários de atendimento por profissional.
- FR-G3: Intervalo entre agendamentos.
- FR-G4: Gerenciar profissionais (convidar, ativar, desativar).
- FR-G5: Definir nível de permissão por usuário.
- FR-G6: Acessar personalização (FR-J).

**FR-H — App Mobile (somente leitura no MVP):**
- FR-H1: Agenda do usuário em dia/semana.
- FR-H2: Lista *aguardando confirmação* para consulta (sem confirmar/recusar — DL-018).
- FR-H3: *(Removido)*.
- FR-H4: iOS e Android.

**FR-I — Permissões e Controle de Acesso:**
- FR-I1: Três níveis fixos — Dono, Profissional, Funcionário.
- FR-I2: Matriz de permissões (detalhada no PRD).
- FR-I3: Exatamente um Dono por instalação; não removível sem transferência.
- FR-I4: Isolamento total de dados por instalação (ver NFR-S1).

**FR-K — Rastreabilidade de Origem:**
- FR-K1: Origem obrigatória: `whatsapp` / `manual` / `app` (reservado).
- FR-K2: Origem `manual` registra usuário criador (auditoria).
- FR-K3: Status inicial por origem (whatsapp→aguardando, manual→confirmado).
- FR-K4: Origem visualmente distinguível na agenda.
- FR-K5: Filtro por origem.

**FR-J — Personalização e Identidade:**
- FR-J1: Identidade visual própria (nome, logo, cor primária).
- FR-J2: Bot assina mensagens com nome da instalação.
- FR-J3: Painel/app exibem nome e logo.
- FR-J4: Tema claro/escuro selecionável.
- FR-J5: Personalização configurada por Renato no setup (sem self-service).

### Non-Functional Requirements (13 NFRs)

- NFR-A1: Bot responde em ≤ 3s em condições normais.
- NFR-A2: Páginas do painel carregam em ≤ 2s em 4G.
- NFR-A3: Polling de pendentes a cada 15–30s sem recarregar página (badge + toast); push futuro (DL-019).
- NFR-C1: Atomicidade na criação de agendamentos (sem duplo agendamento).
- NFR-C2: Monitorar conectividade do provider WhatsApp e alertar Renato.
- NFR-C3: Em falha do provider, registrar mensagens e processar ao restabelecer, sem perda de contexto.
- NFR-S1: Isolamento por `tenant`/`company_id`; nenhuma query retorna dados de outro tenant.
- NFR-S2: Dados de clientes conforme LGPD; sem compartilhamento entre instalações.
- NFR-S3: Autenticação segura com controle de sessão e expiração de token.
- NFR-O1: Custo de infra ≤ R$130/mês na fase de lançamento.
- NFR-O2: Arquitetura acomoda crescimento de tenants sem reescrita do core.
- NFR-O3: Abstração de provider WhatsApp (troca sem alterar lógica de negócio).
- NFR-O4: Abstração de gateway de pagamento (troca sem impacto no core).

### Additional Requirements / Constraints

- **Multi-tenancy:** banco MySQL único com isolamento por `company_id`; middleware NestJS injeta/valida em cada request (Addendum A.2).
- **Arquitetura:** monolito modular NestJS com fronteiras de módulo definidas (Addendum A.1).
- **Contexto de lançamento:** MVP em 90 dias (até 13/09/2026), 5 clientes pagantes, onboarding presencial por Renato.
- **Glossário/enums:** Instalação, Pré-agendamento, Origem (enum), Tenant, Horário comercial (08h–19h seg–sáb).
- **Questões em aberto (QA-1 a QA-3 abertas):** horário comercial por instalação, funcionário com agenda própria, número do WhatsApp (pessoal vs dedicado).

### PRD Completeness Assessment

PRD maduro e detalhado (status `final`). Requisitos numerados, com rastreabilidade cruzada (DL-xxx, QA-xxx), escopo do MVP e fora-de-escopo explícitos, riscos e métricas. Pontos de atenção para validação de cobertura: (a) QA-1/QA-2/QA-3 ainda abertas podem afetar épicos de configuração, permissões e provider; (b) FR-H3 removido — verificar que épicos não o referenciam; (c) personalização (FR-J5) e onboarding são manuais, não devem gerar stories de UI self-service.

## Epic Coverage Validation

### Coverage Matrix

| FR | Requisito (resumo) | Cobertura nos Épicos | Status |
|----|---------------------|----------------------|--------|
| FR-A1–A8 | Bot de agendamento (intenção, fluxo, atomicidade, fallback) | Épico 2 — Stories 2.1, 2.2, 2.3, 2.4, 2.11 | ✓ Coberto |
| FR-B1–B6 | Confirmação/recusa pelo painel + timeout 2h | Épico 2 — Stories 2.5, 2.6 | ✓ Coberto |
| FR-C1–C6 | Cancelamento via bot e via painel | Épico 2 — Stories 2.7, 2.8 | ✓ Coberto |
| FR-D1–D8 | Agenda do painel + agendamento manual | Épico 2 — Stories 2.9, 2.10 | ✓ Coberto |
| FR-E1–E4 | Cadastro, histórico e observações de clientes | Épico 3 — Stories 3.1, 3.2 | ✓ Coberto |
| FR-F1–F5 | Registro manual de pagamentos + visibilidade por papel | Épico 4 — Stories 4.1, 4.2, 4.3 | ✓ Coberto |
| FR-G1–G6 | Configurações (serviços, horários, intervalo, equipe, permissões, personalização) | Épico 1 — Stories 1.4, 1.5, 1.6, 1.7 | ✓ Coberto |
| FR-H1, H2, H4 | App mobile somente leitura (agenda, pendentes, iOS/Android) | Épico 5 — Stories 5.1, 5.2, 5.3 | ✓ Coberto |
| FR-H3 | *(Removido — recusa pelo app, DL-018)* | N/A — não referenciado nos épicos | ✓ Consistente |
| FR-I1–I4 | Permissões, papéis, isolamento de tenant | Épico 1 — Stories 1.3, 1.4 | ✓ Coberto |
| FR-J1, J3, J4, J5 | Identidade visual, tema, personalização no setup | Épico 1 — Story 1.7 | ✓ Coberto |
| FR-J2 | Bot assina mensagens com nome da instalação | Épico 2 — Story 2.4 | ✓ Coberto |
| FR-K1–K5 | Rastreabilidade de origem (enum, auditoria, exibição, filtro) | Épico 2 — Stories 2.4, 2.9 | ✓ Coberto |

**NFRs:**

| NFR | Cobertura | Status |
|-----|-----------|--------|
| NFR-A1 (bot ≤3s) | Épico 2 — Story 2.2 | ✓ |
| NFR-A2 (painel ≤2s em 4G) | Épico 1 (shell/transversal) | ✓ |
| NFR-A3 (polling de pendentes) | Épico 2 — Story 2.12 | ✓ |
| NFR-C1 (atomicidade) | Épico 2 — Stories 2.4, 2.12 | ✓ |
| NFR-C2 (monitoramento WhatsApp) | Épico 2 — Story 2.11 | ✓ |
| NFR-C3 (resiliência do provider) | Épico 2 — Story 2.11 | ✓ |
| NFR-S1 (isolamento de tenant) | Épico 1 — Story 1.3 | ✓ |
| NFR-S2 (LGPD) | Épico 1 — Story 1.3 | ✓ |
| NFR-S3 (autenticação segura) | Épico 1 — Story 1.2 | ✓ |
| NFR-O1 (custo ≤R$130/mês) | Épico 1 — Story 1.1 | ✓ |
| NFR-O2 (escalabilidade de tenants) | Épico 1 | ✓ |
| NFR-O3 (abstração WhatsApp) | Épico 2 — Story 2.1 | ✓ |
| NFR-O4 (abstração de gateway) | Épico 4 — Story 4.3 | ✓ |

### Missing Requirements

**Nenhum FR ou NFR sem cobertura.** Todos os requisitos funcionais ativos do PRD têm um caminho de implementação rastreável (épico + story). FR-H3 está corretamente marcado como removido e não é referenciado pelos épicos.

**FRs nos épicos que não existem no PRD:** Nenhum. O Requirements Inventory do `epics.md` reflete fielmente o PRD.

### Coverage Statistics

- Total de FRs ativos no PRD: **60** (FR-H3 removido)
- FRs cobertos nos épicos: **60**
- **Cobertura de FRs: 100%**
- Total de NFRs: **13** — Cobertura: **100%**
- UX-DRs (UX-DR1 a UX-DR19): **19** — todas mapeadas a épicos

## UX Alignment Assessment

### UX Document Status

**Encontrado.** `ux/ux-Tamarcado-2026-06-15/ux-spec.md` (status `draft`). Cobre fluxo conversacional do bot (máquina de estados, MSG-A/B/C, fallbacks FB), painel web (7 telas com mockups ASCII) e app mobile (4 telas). Referencia o PRD como fonte e foi consumido pela arquitetura (`ux_ref` no frontmatter) e pelos épicos (UX-DR1–DR19).

### UX ↔ PRD Alignment

**Forte.** As 4 jornadas do PRD (UJ-1 a UJ-4) têm correspondência direta nas mensagens/telas da UX. Todas as telas do painel mapeiam a FRs (Agenda→FR-D, Pendentes→FR-B, Clientes→FR-E, Pagamento→FR-F, Configurações→FR-G/I/J). As correções de DL-018 (confirmação só pelo painel) estão refletidas consistentemente em MSG-B01/B02, remoção de MSG-B03/FB-07 e app somente leitura. Sem requisitos de UX órfãos (sem FR correspondente).

### UX ↔ Architecture Alignment

A arquitetura suporta os requisitos de UX (polling de pendentes via `GET /appointments/pending-count` → UX-DR7/NFR-A3; máquina de estados em `whatsapp_conversations` + Redis → UX-DR1; confirmação inline e modal de recusa → endpoints `confirm`/`refuse`; performance NFR-A1/A2). Contudo, há **3 inconsistências** documentadas abaixo.

### Alignment Issues

**🔴 MÉDIO — Tema (FR-J4) modelado no nível errado.** PRD FR-J4, UX-DR15 e a Story 1.7 (AC: "a preferência é individual do usuário e persiste entre sessões") definem o tema claro/escuro como **preferência por usuário**, na tela Perfil. Mas a arquitetura coloca `theme ENUM('light','dark')` na tabela **`companies`** (seção 3.1) — nível de instalação — e a tabela `users` (seção 3.2) **não tem coluna de tema**. A migration da Story 1.2 (cria `users`) não prevê esse campo. **Impacto:** a Story 1.7 não é implementável como escrita sobre o schema atual. **Recomendação:** adicionar coluna `theme` (ou tabela/campo de preferências) em `users` e ajustar a Story 1.2/1.7; decidir se `companies.theme` permanece como default da instalação ou é removido.

**🟡 BAIXO — Referências de mensagem desatualizadas na arquitetura (§4.8 NotificationsModule).** O mapeamento evento→mensagem cita: (a) `AppointmentCreatedEvent` (whatsapp) → "MSG-A05 (confirmação ao cliente)" — mas MSG-A05 é "apresentação de horários"; a confirmação correta de solicitação enviada é **MSG-A06**; (b) `AppointmentStatusChangedEvent` (confirmed) → "MSG-B03 ao cliente" — mas **MSG-B03 foi removida (DL-018)**; a confirmação correta à cliente é **MSG-B04**. **Impacto:** baixo — a própria arquitetura (seção 11) declara o `ux-spec.md` como fonte canônica das mensagens e os épicos (Story 2.4/2.5) já usam os números corretos (A06, B04). **Recomendação:** corrigir as referências em §4.8 para evitar confusão na implementação.

**🟡 BAIXO — `ux-spec.md` levemente desatualizado quanto a FR-C6.** O ux-spec (status `draft`) ainda contém a nota "este comportamento não está coberto nos FRs atuais. Sugestão de novo requisito: FR-C6" (MSG-C06). O FR-C6 **já existe no PRD** e está coberto pela Story 2.8. **Impacto:** cosmético, nenhum efeito na implementação. **Recomendação:** atualizar o ux-spec para `final` removendo a sinalização pendente.

### Warnings

- **`no_show` extra no schema:** a ENUM `status` de `appointments` inclui `no_show`, ausente do PRD/UX (que listam apenas pendente/confirmado/cancelado/concluído). Capacidade extra, não é lacuna — mas nenhuma story trata transição para `no_show`; confirmar se é intencional (reservado) ou ruído.
- **`ux-spec.md` ainda em `draft`:** considerar promover a `final` após sanar as inconsistências acima, alinhando com o PRD (`final`).

## Epic Quality Review

Avaliação dos 5 épicos e 28 stories contra os padrões de boas práticas (valor ao usuário, independência, dependências, sizing, ACs, criação de tabelas just-in-time).

### Compliance Checklist (por épico)

| Critério | Ép. 1 | Ép. 2 | Ép. 3 | Ép. 4 | Ép. 5 |
|----------|:-----:|:-----:|:-----:|:-----:|:-----:|
| Entrega valor ao usuário | ✓ | ✓ | ✓ | ✓ | ✓ |
| Funciona de forma independente (depende só de épicos anteriores) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stories bem dimensionadas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sem dependências futuras (forward) | ✓ | ⚠️ | ✓ | ✓ | ✓ |
| Tabelas criadas quando necessárias | ✓ | ⚠️ | ✓ | ✓ | ✓ |
| Acceptance Criteria claros (Given/When/Then) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rastreabilidade a FRs mantida | ✓ | ✓ | ✓ | ✓ | ✓ |

### Pontos fortes

- **Nenhum épico técnico disfarçado.** O Épico 1 combina fundação técnica (monorepo, multi-tenancy, CI/CD) com valor de produto explícito ("o salão está cadastrado e parametrizado") — padrão aceitável de walking skeleton + primeira entrega de valor, não um épico puramente técnico.
- **Walking skeleton correto (Story 1.1):** a arquitetura define "sem starter template de terceiros"; a Story 1.1 monta a estrutura do zero com esqueleto implantável de ponta a ponta. Compliant com o requisito greenfield (setup inicial, ambiente, CI/CD cedo).
- **Independência de épicos respeitada:** cada épico depende apenas de anteriores (Ép.3 estende `clients` da 2.4; Ép.4 referencia `appointments`; Ép.5 consome a API consolidada). Sem dependências circulares ou forward entre épicos.
- **ACs de alta qualidade:** formato Given/When/Then consistente, testáveis, com caminhos de erro (1.6 faixa de horário inválida; 2.4 race condition; 2.5 recusa sem justificativa bloqueada; 1.4 remoção de dono bloqueada).
- **Boas práticas notáveis:** smoke test de ponta a ponta na Story 2.1 (validar o maior risco técnico — conectividade Evolution API — antes da máquina de estados); job de timeout via BullMQ pós-commit; `professional_id` nullable desde o schema inicial.

### 🔴 Critical Violations

Nenhuma.

### 🟠 Major Issues

**1. Ordenação/propriedade da migration da tabela `clients` (Épico 2).** A Story 2.3 ("Cálculo de disponibilidade") cria a tabela `appointments`, que na arquitetura tem FK `client_id → clients(id)` (seção 3.7). Porém **nenhuma story anterior cria a tabela `clients`**: a Story 2.4 apenas faz `findOrCreate` na tabela (sem AC de migration explícita criando-a), e a Story 3.1 afirma que `clients` foi "criada mínima na 2.4". Resultado: a migration da 2.3 referenciaria uma tabela `clients` ainda inexistente, e a criação efetiva de `clients` não é propriedade clara de nenhum AC.
- **Impacto:** a sequência de migrations quebra (FK para tabela inexistente); ambiguidade de qual story cria `clients`.
- **Recomendação:** adicionar um AC explícito de `CREATE TABLE clients` em uma story que anteceda a criação de `appointments` (idealmente no início da 2.3, ou uma story dedicada antes dela), e ajustar a redação da 2.4/3.1 para refletir extensão (não criação).

### 🟡 Minor Concerns

**2. `appointments` criada na story de disponibilidade (2.3), não na de criação de agendamento (2.4).** Defensável ("criar quando necessário" — a disponibilidade lê `appointments`), mas levemente fora do princípio de a tabela nascer na story que a "possui". Sem impacto se a ordenação do item Major #1 for resolvida.

**3. Story 1.1 agrega bastante escopo** (monorepo + 3 ambientes + CI + CD + health check + migration inicial). É um walking skeleton legítimo, mas é a maior story do plano — considerar se o deploy de produção (`deploy.yml` + SSH/PM2) poderia ser uma sub-story, dado que ainda não há o que implantar com valor de usuário até o Épico 1 avançar.

**4. Questões em aberto do PRD podem afetar o Épico 1.** QA-1 (horário comercial por instalação — mitigado pelos campos `business_hours_*` em `companies`), QA-2 (funcionário com agenda própria — afeta modelo de usuários/permissões da Story 1.4) e QA-3 (número pessoal vs dedicado — afeta provider, mitigado por `evolution_instance_name` + seleção no setup). **QA-2 é a mais sensível:** se resolver para "funcionário pode acumular agenda", o modelo de papéis da Story 1.4 muda. Recomenda-se fechar QA-2 antes de iniciar a Story 1.4.

**5. Cross-ref do Step 4 (modelo de dados):** o tema por usuário (FR-J4/UX-DR15/Story 1.7) exige coluna em `users` que a arquitetura não prevê (`companies.theme`). Já detalhado na seção UX Alignment — afeta a implementabilidade da Story 1.7.

### Remediação recomendada (prioridade)

1. **(Major #1)** Definir explicitamente a story/AC que cria a tabela `clients` antes de `appointments`. — *bloqueia migrations do Épico 2.*
2. **(UX/Dados #5)** Mover `theme` para `users` e ajustar Stories 1.2/1.7. — *bloqueia Story 1.7.*
3. **(Minor #4)** Fechar QA-2 antes da Story 1.4.
4. **(Baixo)** Corrigir referências MSG na arquitetura §4.8; promover `ux-spec.md` a `final`.

## Summary and Recommendations

### Overall Readiness Status

**🟡 NEEDS WORK (quase pronto)** — O planejamento é maduro e de alta qualidade: cobertura de requisitos de 100%, épicos com valor de usuário e independência corretas, ACs em Given/When/Then testáveis. Há **2 questões que bloqueiam stories específicas** e devem ser sanadas antes de iniciar a implementação dessas stories — ambas são correções pontuais e rápidas, não exigem replanejamento. O restante são ajustes menores de consistência documental.

### Critical Issues Requiring Immediate Action

Não há violações críticas (🔴). As duas questões bloqueantes de story (🟠) são:

1. **Migration de `clients` órfã/fora de ordem (Épico 2).** `appointments` (Story 2.3) tem FK para `clients`, mas nenhuma story cria explicitamente a tabela `clients` antes. → Bloqueia a sequência de migrations do Épico 2.
2. **Tema modelado em `companies`, mas requerido por usuário (Story 1.7).** A tabela `users` não tem coluna de tema; FR-J4/UX-DR15/Story 1.7 exigem preferência individual. → Bloqueia a Story 1.7 como escrita.

### Recommended Next Steps

1. **Sanar a migration de `clients`:** adicionar AC explícito de `CREATE TABLE clients` em uma story que anteceda a criação de `appointments` (início da 2.3 ou story dedicada), e reescrever 2.4/3.1 como *extensão* da tabela.
2. **Corrigir o modelo de tema:** adicionar coluna `theme` em `users` (ou tabela de preferências), atualizar a Story 1.2 (migration de `users`) e a Story 1.7; decidir o papel de `companies.theme` (default da instalação ou remover).
3. **Fechar QA-2** (funcionário com agenda própria?) antes de iniciar a Story 1.4 — é a questão em aberto com maior impacto no modelo de papéis.
4. **Correções de consistência documental (não bloqueantes):** ajustar referências MSG na arquitetura §4.8 (A06 no lugar de A05; B04 no lugar de B03 removida); promover `ux-spec.md` a `final` removendo a nota "FR-C6 pendente"; confirmar intenção do status `no_show`.

### Final Note

Esta avaliação identificou **9 questões** em 2 categorias (alinhamento UX/arquitetura e qualidade de épicos): **0 críticas, 3 de severidade média/major, 6 menores**. Cobertura de FRs e NFRs é de 100% — não há lacunas de requisitos. Recomenda-se endereçar as 2 questões bloqueantes de story (migration de `clients` e tema por usuário) e fechar QA-2 antes da implementação das stories afetadas; as demais podem ser corrigidas em paralelo ou aceitas conscientemente. O plano está substancialmente pronto para a Fase 4.

---

*Avaliação conduzida por: Implementation Readiness (Product Manager) — 2026-06-17*
*Documentos avaliados: PRD (final) + addendum, Architecture (draft), epics.md, UX Spec (draft)*
