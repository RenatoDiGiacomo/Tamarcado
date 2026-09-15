# Story 6.16: Ativação manual de plano — endpoint de plataforma

Status: **implementada** — PR aberto para `dev` (Amelia, 2026-09-15). DL-076, sobre a base de
capabilities da Story 6.11 (DL-072). Decisões novas nesta rodada: **DL-082** e **DL-083**.

> **Não há cobrança automática.** O pagamento é manual (Pix/transferência, direto com o Renato) e,
> até esta story, **não existia caminho para ligar o Pró depois que o dinheiro caía** — liberar um
> cliente era `UPDATE` no banco à mão.

## Story

As a operador da plataforma,
I want ativar ou cortar recursos de uma empresa por um endpoint protegido,
so that eu libere o que foi pago sem precisar de tela e sem mexer no banco à mão.

---

## ⭐ Ponto A — O buraco da spec: ela só sabia SUBIR

A spec cobria a ativação e **não dizia uma palavra sobre o rebaixamento**. Entregue como estava, a
story daria ao sistema um botão que só soma: o primeiro cliente que atrasasse o pagamento seguiria
com o Pró até alguém apagar linhas no banco à mão — que é exatamente o que ela existe para acabar.

Três perguntas não tinham resposta em lugar nenhum. As três estão respondidas no **DL-082**:

| pergunta | resposta | por quê |
|---|---|---|
| E as **credenciais** de conexão? | **ficam** | conta Meta, verificação e aprovação são a parte cara e confusa para o dono; refazer aquilo por um mês de atraso é o atrito que faz ele **desistir em vez de voltar** |
| E o que já estava **enfileirado**? | **fica na fila**; quem decide é o **executor**, no disparo | limpar seria um **segundo** lugar que precisa saber de capability (o primeiro continua obrigatório), destruiria a informação de *"o que deixou de sair"*, e faria sumir o lembrete de quem **pagou atrasado e voltou a tempo** |
| E a **preferência** do dono? | **fica** | campo separado por desenho (DL-072): revogar o **direito** não apaga o **uso** que ele escolheu |

**Rebaixar desliga o USO, nunca o VÍNCULO.** É a frase que resume a story inteira.

---

## ⭐ Ponto B — Como "não apaga a credencial" virou teste, sem a credencial existir

A tabela de credenciais do WhatsApp é da **Story 6.1** e **não existe hoje** — a 6.16 é a terceira
da fila do épico, a 6.1 é a quarta. Um teste que citasse `whatsapp_credentials` pelo nome não teria
como ser escrito, e um comentário dizendo "cuidado para não apagar" não é garantia de nada.

O e2e tira um **snapshot de TODAS as tabelas** do banco, antes e depois do rebaixamento, e falha se
qualquer linha mudar fora de `company_capabilities`, `companies.plan` e o registro de auditoria:

```ts
const PODE_MUDAR = new Set(["company_capabilities", "company_plan_changes", "companies"]);
for (const tabela of Object.keys(antes)) {
  if (PODE_MUDAR.has(tabela)) continue;
  expect({ [tabela]: depois[tabela] }).toEqual({ [tabela]: antes[tabela] });
}
```

**O que isso compra:** no dia em que a 6.1 criar a tabela de credenciais, ela entra na cobertura
**sozinha** — ninguém precisa lembrar de voltar a este arquivo. O mesmo vale para a tabela de
preferências da 6.17 e para a fila de tarefas da 6.2. É a diferença entre uma promessa escrita num
comentário e um invariante que falha a suíte.

---

## ⭐ Ponto C — Por que a auditoria virou TABELA (DL-083)

O DL-076 pedia *"auditar em log, mesmo padrão da 1.9.01"*. Para o que a 1.9.01 registra (geração de
link de senha) a linha de log basta: é evento **operacional**, acompanhado no momento e nunca mais
perguntado.

Mudança de plano não é isso. Ela registra **o que o cliente contratou e o que ele pagou**, e a
pergunta chega **semanas depois**: *"eu paguei o Pró em março"*, *"desde quando estou cortado?"*.
Log de `stdout` é rotacionado pelo PM2 e some — e aí a resposta é a palavra de um contra a do outro.

Duas coisas que a `company_capabilities` sozinha **não** responde:

1. **O corte.** Revogar é **apagar a linha** (por desenho, DL-072). Sem registro próprio, um
   rebaixamento não deixa rastro **nenhum**.
2. **A sequência.** `granted_at`/`granted_by` contam o **estado atual**; básico → pró → básico não
   existe em lugar algum.

`company_plan_changes` guarda o **estado completo** antes e depois — não o diff. O diff se calcula a
partir do estado; o contrário não é verdade, e o conteúdo de um preset muda com o tempo.

**A linha de log continua saindo.** As duas servem a coisas diferentes: o log é para agora, a tabela
é para daqui a seis meses.

**`changedBy` é obrigatório e recusa a chamada quando falta.** A `x-platform-key` é única e
compartilhada: ela prova que **alguém com a chave** agiu, nunca **quem**. O nome vem no corpo e o IP
registrado ao lado o sustenta. Não é autenticação e não pretende ser. Hoje há um operador; a coluna
está pronta para quando não houver.

---

## ⭐ Ponto D — Preset OU lista, nunca os dois

| corpo | efeito | serve para |
|---|---|---|
| `{"plan":"pro"}` | aplica o preset como **estado final** e atualiza `companies.plan` | a venda normal |
| `{"capabilities":["lembrete_automatico"]}` | define a lista **na mão** e **não mexe no plano** | **venda avulsa** e **cortesia** |

O segundo caminho é o que o DL-072 pediu: conceder um recurso **sem mentir o plano da empresa**. Se
ele também mexesse no rótulo, a empresa apareceria como "pró" no histórico comercial sem ter
comprado o pró.

**Os dois juntos são recusados** — `plan: "pro"` + `capabilities: []` são ordens contraditórias, e
qualquer regra de precedência inventada seria invisível para quem digita o corpo.

**A lista é o ESTADO FINAL:** `capabilities: []` revoga tudo. É o desenho que torna o rebaixamento
possível, e é também o corpo mais fácil de mandar por engano — está dito no DTO, no Swagger e aqui.

---

## ⭐ Ponto E — O corte imediato não custou código nenhum

O AC pede efeito imediato nas três camadas. Ele já estava garantido pela 6.11, e a 6.16 não
acrescentou um único mecanismo de propagação:

| camada | quem lê | quando converge |
|---|---|---|
| 1 · front | `/users/me` (polling ~20s do `AuthContext`, DL-062) | próximo ciclo |
| 2 · backend | `CapabilityGuard`, linha fresca a cada requisição | **requisição seguinte**, com o mesmo token |
| 3 · webhook/agendador | `CapabilitiesService` com `companyId` explícito, sem request | **próximo disparo** |

**Apagar a linha É o corte.** Não existe "avisar as camadas" — e é por não existir que não há uma
delas para esquecer. O que a story precisou fazer foi **não criar cache** e **não criar caminho
paralelo**.

---

## O que mudou

| Arquivo | O quê |
|---|---|
| `database/entities/company-plan-change.entity.ts` | registro de auditoria — escrita apendada, nunca lida para decidir acesso |
| `database/migrations/…-CreateCompanyPlanChanges.ts` | tabela nova, aditiva pura, sem backfill |
| `capabilities/capabilities.service.ts` | **`setForCompany`** — o único método que rebaixa; declarativo (estado final, não operação) |
| `platform/dto/update-company-plan.dto.ts` | preset **ou** lista, validação estrita, `changedBy` obrigatório com `trim` |
| `platform/platform.service.ts` | `changePlan` — resolve o alvo, aplica, grava auditoria e devolve **antes → depois** |
| `platform/platform.controller.ts` | `PATCH /api/platform/companies/:slug/plan` |

**Identificada pelo `slug`, não pelo `id`** (a spec dizia `:id` "ou equivalente"): é o que o operador
tem na mão — o mesmo do reset de senha da 1.9.01 e o que aparece no link público do salão. Pedir o id
do banco obrigaria a consultar o banco antes de operar, que é o que o endpoint existe para evitar.

**`applyPlanPreset` continuou aditivo** e segue sendo o caminho da **contratação** (1.9): lá a
empresa nasce e não há o que perder. A **troca** de uma empresa existente é `setForCompany`.

---

## Testes

| Arquivo | Cobre |
|---|---|
| `capabilities.service.spec.ts` | o diff: sobe, desce, troca lateral, idempotência, chave repetida — e que reconceder **não reescreve `granted_at`** |
| `test/platform-plan.e2e-spec.ts` | 16 casos: 401/404, subir refletindo **sem relogar**, rebaixar cortando nas **três camadas**, snapshot de todas as tabelas, auditoria nas duas direções, `changedBy` obrigatório, venda avulsa, `[]` revogando tudo, typo → 400 |
| `test/migration-company-plan-changes.e2e-spec.ts` | migration contra base **populada** (DL-064), FK com cascade, `down` reversível |

A camada 3 é testada **chamando o `CapabilitiesService` fora de qualquer requisição** — é
literalmente o caminho que o webhook (6.20) e o agendador (6.2) vão usar.

**Guard-rails existentes, todos verdes:** `tenant-coverage` (o controller segue em
`PRE_TENANT_CONTROLLERS`), `active-user-coverage`, `capability-coverage` e
`plan-name-not-in-runtime` — o nome do plano continua aparecendo só no DTO (validação de entrada) e
nos presets; a lógica daqui para baixo só conhece lista.

---

## ⚠️ Nota de implantação — a dependência que não é desta story

**A restrição de IP no Nginx para `/api/platform/*` continua PENDENTE.** É a pendência aberta desde o
Épico 1, e o DL-076 especifica `x-platform-key` **+** IP restrito.

**O peso dela subiu com esta story.** Antes, a superfície pré-tenant provisionava empresa e gerava
link de senha. Agora ela **liga e desliga o que o cliente pagou**, protegida por **um único segredo
compartilhado**. É **ação do Renato no servidor**, e **o endpoint de plano não deveria ir para
produção sem ela**.

---

## Dívida registrada (não é esquecimento)

**Tela de administração de planos e capabilities.** Já estava no roadmap (item 5.5, DL-076) e
continua lá, **fora do Épico 6**. Rodar comando é aceitável com poucos clientes e **insustentável com
trinta** — o gatilho é o **volume**, e ele vai chegar. Construir agora seria antecipar trabalho que a
venda ainda não pediu.

## Fora de escopo

A tela de WhatsApp e as preferências do dono são a **6.17**; as credenciais por tenant são a **6.1**;
a fila de entrada do webhook é a **6.20**. As falhas e2e pré-existentes do `dev` **não** foram
corrigidas aqui — fix fora de escopo tem numeração própria (DL-028) e branch separada.
