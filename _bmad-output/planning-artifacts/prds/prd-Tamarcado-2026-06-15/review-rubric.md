# PRD Quality Review — Tamarcado

Data: 2026-06-15
Rubric: prd-validation-checklist.md

---

## Overall verdict

O PRD é sólido: thesis explícita, features coerentes com a aposta central, NFRs com thresholds reais. Apto para alimentar UX (Sally) e arquitetura (Winston). Dois buracos de escopo precisam de resposta antes do handoff — o principal é um caso de cliente sem WhatsApp que nenhum FR cobre. Fora isso, o bloqueio maior para o dev são algumas FRs de intenção que precisam de critério de aceitação mais concreto.

---

## 1. Decision-readiness — **strong**

Trade-offs nomeados e honestos: Evolution API vs Cloud API (NFR-O3 + addendum), timeout 2h sem cancelamento automático (risco explicitado), agendamento manual entra confirmado vs. whatsapp entra pending (FR-K3 — decisão de produto clara). Open Questions são genuinamente abertas; nenhuma tem a resposta na próxima linha.

### Findings
*(nenhum finding crítico ou alto nesta dimensão)*

---

## 2. Substance over theater — **strong**

Personas são 4 e todas load-bearing: Fernanda e Marco orientam os dois tiers de produto; Funcionário orienta a matriz de permissões; Cliente Final é propositalmente thin. Diferencial "100% WhatsApp" é produto-específico, não marketing genérico. NFRs têm thresholds numéricos (3s, 2s, R$130/mês, 2h). Nada de boilerplate vazio.

### Findings
*(nenhum)*

---

## 3. Strategic coherence — **strong**

Thesis explícita na Visão. Cada cluster de FR serve a aposta: bot-first (Fernanda fica livre do celular), painel web como centro de controle, mobile para revisão rápida. Métricas de sucesso validam a thesis (taxa de conclusão de bot ≥ 70% testa diretamente se o bot substituiu o WhatsApp manual). Counter-métricas presentes.

### Findings
*(nenhum)*

---

## 4. Done-ness clarity — **adequate**

A maioria das FRs tem consequência testável. Algumas precisam de critério mais concreto antes do handoff para dev.

### Findings

- **medium** FR-A1 — "O sistema reconhece mensagens com intenção de agendar" sem definir o critério de reconhecimento. Keyword matching? Lista de frases gatilho? O dev precisa saber como implementar (e testar) a detecção de intenção. *Fix:* adicionar uma nota explicitando o mecanismo de detecção de intenção no MVP (ex: correspondência de palavras-chave configurável, ou NLP simples).

- **medium** FR-D7 + FR-E — Cliente sem WhatsApp cadastrado é permitida (agendamento manual), mas a FR-E assume que clientes são cadastradas pela interação via WhatsApp. O PRD não define o mínimo de dados capturado no cadastro manual. *Fix:* adicionar FR-E4 definindo os campos mínimos para cadastro manual de cliente (nome obrigatório; contato opcional).

- **low** FR-A7 — fallback definido como "mensagem de fallback genérica" sem especificar o conteúdo. UX (Sally) precisará definir. Aceitável como abertura para UX, mas vale registrar como pending.

- **low** FR-F1 — "forma de pagamento: campo livre" não define se é texto livre ou dropdown com opções predefinidas. Impacta UX e futura análise de dados. *Fix:* definir como dropdown com opções (dinheiro / PIX / cartão de débito / cartão de crédito / outro) — cobre 99% dos casos sem impedir casos fora do padrão.

---

## 5. Scope honesty — **adequate** (um buraco de alto impacto)

Seção "Fora do Escopo" é abrangente (12+ itens). Assumptions inline marcadas. QA-1 a QA-4 genuinamente abertas. Um buraco significativo foi identificado:

### Findings

- **high** FR-D7 + FR-B3 — O PRD permite cliente sem número WhatsApp (agendamento manual), mas FR-B3 define que a confirmação do agendamento é enviada via WhatsApp para a cliente. Quando a cliente não tem WhatsApp cadastrado, ela não recebe a confirmação — e nenhum FR endereça isso. Dois caminhos possíveis: (a) confirmação silenciosa (staff já avisou presencialmente), ou (b) outro canal de notificação. *Fix:* adicionar FR-D8 explicitando o comportamento: agendamentos manuais sem WhatsApp de cliente não disparam notificação automática — a comunicação com a cliente é responsabilidade de quem criou o agendamento. Se essa é a decisão, registrar explicitamente.

---

## 6. Downstream usability — **adequate**

Cross-references funcionam (FR-K4, NFR-C1, FR-I2). UJs têm protagonistas nomeados. IDs consistentes (FR-A a FR-K). Glossary drift leve:

### Findings

- **low** — "pré-agendamento" aparece em FR-A4 com sentido específico (status antes de confirmação), mas o status machine formal usa *aguardando confirmação* nos outros FRs. A nomenclatura oscila entre o nome informal ("pré-agendamento") e o status técnico. Winston vai precisar de definição canônica para o modelo de dados. *Fix:* 4-6 linhas de glossário no início do PRD: "agendamento", "pré-agendamento", "instalação", "origem" (enum), "tenant".

- **low** — FR-K1 define o enum de origem com `app` como "reservado para uso futuro", mas não há nota explicitando que agendamentos via app mobile não existem no MVP (o app só confirma/recusa). Winston pode assumir que o app já cria agendamentos. *Fix:* adicionar nota em FR-H ou FR-K1: "no MVP, o app mobile não permite criação de agendamentos; origem `app` não é usada."

---

## 7. Shape fit — **strong**

Produto consumer multi-stakeholder com UX de bot conversacional → UJs com protagonistas nomeados são load-bearing (4 jornadas cobrindo os fluxos críticos). PRD alimenta cadeia UX → arquitetura → histórias → FRs são estruturados para story breakdown. Não over-formalizado, não under-formalizado para o estágio e o escopo.

### Findings
*(nenhum)*

---

## Mechanical notes

- Assumptions index: 3 assumptions inline (FR-A4, FR-B6, FR-E3). Todas foram confirmadas pelo usuário. Log de decisões registra confirmações. Roundtrip ok.
- IDs: contíguos e sem duplicatas (FR-A1–A8, FR-B1–B6, FR-C1–C5, FR-D1–D7, FR-E1–E3, FR-F1–F5, FR-G1–G6, FR-H1–H4, FR-I1–I4, FR-J1–J5, FR-K1–K5). QA-1 a QA-4. OK.
- Cross-refs: todos os "(ver FR-X)" e "(ver NFR-X)" resolvem para seções existentes. OK.
- UJ protagonistas: UJ-1 Joana, UJ-2 Fernanda, UJ-3 Joana, UJ-4 Marco. Todos nomeados. OK.
