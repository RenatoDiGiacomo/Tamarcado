# Tamarcado — Contexto do Projeto

Documento de referência para o projeto. Resume produto, modelo de negócio, escopo, stack e decisões tomadas. Serve como base de conhecimento para retomar o trabalho em qualquer conversa.

---

## 1. O produto

**Tamarcado** é um sistema de agendamentos para o ramo de beleza no Brasil (cabeleireiros, manicures/pedicures/nail design, design de sobrancelhas e beleza em geral).

O nome vem das expressões do cotidiano das clientes: "vou marcar um horário", "tá marcado!", "preciso desmarcar".

**Diferencial central:** experiência 100% dentro do WhatsApp para a cliente final. A maioria dos concorrentes pede que a cliente saia do WhatsApp para um app ou link externo — o Tamarcado automatiza o que o profissional já faz manualmente no WhatsApp hoje. Dado de mercado: 80%+ dos agendamentos de beleza no Brasil são iniciados pelo WhatsApp.

---

## 2. Canais de acesso

- **Cliente final:** usa SOMENTE o WhatsApp. Nunca acessa app ou web.
- **Profissional (Web):** controle total — agenda, clientes, pagamentos, configurações.
- **Profissional (Mobile, React Native/Expo):** somente leitura/revisão dos agendamentos.

---

## 3. Fluxo principal de agendamento (coração do produto)

1. Cliente entra em contato pelo WhatsApp do profissional.
2. Bot assume a conversa e pergunta data, horário e serviço.
3. Bot consulta a agenda e confirma disponibilidade.
4. Cliente confirma.
5. Profissional recebe notificação e tem até **2 horas em horário comercial** para CONFIRMAR ou RECUSAR.
6. Se confirmar → cliente recebe "agendamento realizado".
7. Se recusar → profissional informa uma justificativa (obrigatória) e o bot reabre o agendamento com nova data/horário.
8. Se o profissional não responder em 2h → bot avisa o cliente que está "em análise" (sem cancelamento automático no MVP).

**Estados do agendamento:** pending → confirmado / recusado (com justificativa) → reaberto.

---

## 4. Modelo de negócio

Venda consultiva **door-to-door**: vai presencialmente ao profissional, instala, conecta o WhatsApp e treina.

Receita = **setup (pagamento único)** + **mensalidade recorrente** que cobre todo o custo do sistema (hosting, WhatsApp, ferramentas, IA).

| Tier | Setup (entrada) | Mensalidade |
|---|---|---|
| Autônomo Solo | R$ 1.500–2.000 | R$ 99–149 |
| Salão (multi-profissional) | R$ 3.000 | R$ 249–300 |

- Setup pago 40% no início + 60% na entrega.
- **Sem trial** — o setup já qualifica o cliente. Risco compensado por garantia de implantação.
- Cláusula de reajuste anual (IPCA/IGP-M) nos contratos.
- Sem comissão no PIX no MVP.
- Posicionamento de mercado: faixa "WhatsApp automático incluído" (mercado R$60–120/mês). Concorrentes: Trinks (R$65–89, completo R$149–249), Belezzia (~R$199), Tua Agenda (~R$20).

*(Detalhamento de custo/lucro e projeções na planilha Tamarcado_Modelo_Financeiro.xlsx.)*

---

## 5. Escopo

### MVP (primeira versão no ar)
- Agendamento via WhatsApp (fluxo acima)
- Painel web do profissional (controle total)
- App mobile do profissional (somente leitura)
- Controle de clientes
- Controle de agenda / calendário
- Pagamento registrado **localmente** (profissional anota o que recebeu)
- Multi-profissional com níveis de permissão (dono / profissional / funcionário), agendas independentes
- Visual padrão dark/light; customização na instalação (nome, logo, cores) — sem editor aberto

### FUTURO (não inflar o MVP)
- Integração com IA no WhatsApp e no sistema (facilitar agendamento, avisos automáticos da agenda do dia)
- Pagamento dentro do fluxo do WhatsApp (sinal/adiantamento configurável pelo profissional — PIX ou cartão)
- Cancelamento automático e regra de antecedência
- Segundo provider de WhatsApp e escolha do provider pelo cliente

---

## 6. Stack técnica

- **Backend:** NestJS + Node.js + TypeScript
- **Banco:** MySQL 8 — multi-tenant com isolamento por `company_id`
- **Cache/Fila:** Redis + BullMQ (notificações e jobs)
- **Frontend Web:** ReactTS + Vite
- **Mobile:** React Native + Expo (somente leitura)
- **WhatsApp:** Evolution API (self-hosted) e/ou Cloud API oficial da Meta
- **Pagamentos:** Asaas (PIX nativo)
- **Storage:** Cloudflare R2 ou AWS S3
- **E-mail:** Resend

---

## 7. Decisões de arquitetura

- **Monolito modular** em NestJS (não microsserviços) — domínio novo, dev solo, não justifica a complexidade.
- **MySQL multi-tenant** por `company_id` (não um banco por cliente).
- **WhatsApp via interface abstrata `WhatsAppProvider`** com duas implementações possíveis (Evolution API e Cloud API oficial). No MVP, implementar e ativar APENAS UM provider, escolhido conforme o perfil dos primeiros clientes (número novo dedicado → oficial; número que o profissional já usa → Evolution). O segundo provider é futuro, plugável sem refatorar o core.
- **Gateway de pagamento** também abstraído por interface (trocável), mesmo padrão.
- **Hospedagem em nuvem (SaaS)**, NÃO instalação local — o bot precisa de servidor sempre online 24/7.

---

## 8. Riscos / tensões

- **Bloqueio da conta WhatsApp** se usar Evolution API (não-oficial) → precisa de monitoramento/alerta. A Cloud API oficial elimina o risco mas tem setup burocrático (Meta Business, CNPJ, número dedicado).
- **Race condition de horário** (dois clientes no mesmo slot) → lock/transação ao criar o agendamento.
- **Custo de IA:** Claude Haiku 4.5, ~R$30–70/mês por profissional pesado. IA é épico futuro.

---

## 9. Itens em aberto (a definir)

- Prazo-alvo do MVP no ar.
- Política de cancelamento pela cliente (sugestão MVP: cliente manda mensagem → bot libera o horário e avisa o profissional → sem regra de antecedência no MVP).
- Qual provider de WhatsApp ativar primeiro (depende do perfil dos primeiros clientes).
- Matriz detalhada de permissões (dono / profissional / funcionário).

---

## 10. Status do processo (BMad)

Usando o BMad Method (v6.8.0) no Claude Code. Fluxo:

`brief.md` (Mary/Analyst) ✅ concluído → `bmad-prd` (João/PM) 🔄 em andamento → `bmad-ux` (Sally) → `bmad-create-architecture` (Winston) → `bmad-create-epics-and-stories` → Dev (Amelia).

Stakes do projeto: comercial real em fase de MVP, desenvolvido solo com ferramentas de IA. Validação via venda door-to-door. Calibração: pragmático, enxuto, lançar rápido, sem over-engineering.

Meta inicial: 5 profissionais pagantes em 90 dias; MRR de R$2.500–7.500 em 6 meses (25–50 profissionais, mix de tiers).
