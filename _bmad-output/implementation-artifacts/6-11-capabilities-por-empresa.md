# Story 6.11: Capabilities por empresa — o DIREITO de usar cada recurso

Status: **implementada** — PR aberto para `dev` (Amelia, 2026-09-07). **Reformulada** pelo
DL-072, que **reescreve o DL-057** (⛔ o modelo `plan: básico|pró` espalhado em `if`s está revogado).

> **Fundação do Épico 6.** As Stories 6.15 (coroa), 6.16 (ativação manual), 6.17 (tela de
> WhatsApp), 6.18 (modelos de mensagem) e o gate do bot (6.20) consomem o que está aqui.
> Nada do Épico 6 opera para um tenant sem a capability correspondente.

## Story

As a operador da plataforma,
I want liberar recursos por empresa numa lista própria, e não pelo nome do plano,
so that eu venda avulso, dê cortesia e mude o conteúdo de um plano sem caçar condicional no código.

---

## ⭐ Ponto A — Os três eixos, e por que não podem virar o mesmo campo

O projeto tinha **dois** eixos de acesso e ganha um **terceiro**. Confundi-los é o que tornaria o
sistema impossível de raciocinar — por isso cada um tem coluna própria, guard próprio e teste próprio.

| | **PAPEL** | **VISIBILIDADE DE MÓDULO** | **CAPABILITY** (novo) |
|---|---|---|---|
| Pergunta | quem a pessoa é | o que **esta pessoa** enxerga | o que a **empresa** contratou |
| Granularidade | por usuário | por usuário | **por empresa** |
| Quem controla | o dono | o dono | **nós** (comercial) |
| Onde mora | `users.access_level` | `users.can_view_*` | **`company_capabilities`** |
| Guard | `RolesGuard` | `ModuleGuard` (DL-062) | **`CapabilityGuard`** |
| `owner` passa por cima? | — | **sim** | **NÃO** |
| DL | FR-I2 | DL-062 | **DL-072** |

**As três valem juntas e nenhuma substitui a outra.** A empresa pode TER o Financeiro e a pessoa
NÃO poder vê-lo; e a pessoa pode ver o módulo sem que a empresa tenha comprado o recurso. As quatro
combinações estão provadas em `test/capability-gate.e2e-spec.ts`.

**Por que o `owner` NÃO passa por cima da capability** — a única assimetria em relação ao
`ModuleGuard`: papel não compra recurso. O `ModuleGuard` libera o dono porque ali se trata de
permissão **interna da equipe**, que é dele para distribuir. A capability é o que ele **comprou de
nós** — e o dono de uma empresa sem o direito é justamente quem mais tentaria.

**Há ainda um quarto conceito, que NÃO é este:** a **PREFERÊNCIA** do dono (ligar/desligar o
lembrete, escolher a antecedência) vive **dentro** do direito que ele já tem, é campo separado, e é
escopo da **Story 6.17**. Desligar a preferência não revoga o direito; revogar o direito não apaga a
preferência escolhida.

---

## ⭐ Ponto B — O plano é PRESET, e o guard-rail que impede o DL-057 de voltar

`companies.plan` existe de novo — mas como **rótulo comercial e histórico do que foi vendido**,
nunca como decisão de acesso. A tradução acontece **uma vez**, na contratação:

```
POST /platform/companies { plan: "pro" }
  └─ companies.plan = "pro"                    (rótulo, para conversa comercial)
  └─ capabilitiesForPlan("pro")                (o PRESET, uma única vez)
       └─ INSERT company_capabilities (whatsapp_bot, lembrete_automatico)
                                               ── daqui em diante, só a LISTA manda
```

O risco óbvio de ter a coluna de volta é a tentação de `plan === "pro"`. Por isso o guard-rail:

**`plan-name-not-in-runtime.spec.ts`** varre todo o `src/` (removendo comentários antes) e **falha a
suíte** se um literal de nome de plano aparecer fora de três lugares autorizados:
`common/capabilities/plan.ts` (a lista do que vendemos), `capability-presets.ts` (a tradução) e as
migrations/seed (DEFAULT de coluna e contratação do salão de dev). Ele já pegou uma violação real
durante a implementação — o `default: "basico"` escrito à mão na entidade `Company`, corrigido para
importar `DEFAULT_PLAN`.

**Consequências práticas do desenho** (o que o campo `plan` sozinho nunca permitiu):
venda **avulsa** (só o lembrete), **cortesia** sem mentir o plano do cliente, e mudar o conteúdo de
um plano **editando um mapa**, não caçando condicional. `applyPlanPreset` é **aditivo**: reaplicar o
plano não revoga recurso avulso nem cortesia — cortar é ação explícita (Story 6.16).

---

## ⭐ Ponto C — As três camadas de bloqueio

| # | Camada | Onde | O que faz | Estado |
|---|---|---|---|---|
| 1 | **Front** | `hasCapability()` em `lib/permissions.ts` | marca o recurso (a coroa da 6.15). **UX, não segurança** | entregue |
| 2 | **Backend (rota autenticada)** | `CapabilityGuard` + `@RequireCapability` | **403**, independente do que o front mostrou | entregue |
| 3 | **Webhook e agendador** | `CapabilitiesService` fora de request | nada é processado nem enviado | **mecanismo + guard-rail entregues; os pontos de entrada ainda não existem** |

**Sobre a camada 3, com precisão.** Ela é a que costuma ser esquecida — o webhook é chamado **pela
Meta, sem login nenhum**, e o agendador roda **sozinho** (DL-056); sem ela o bot continua respondendo
cliente de empresa cortada e o lembrete continua saindo, cobrado no cartão de quem já não paga. Mas
**nem o webhook nem o agendador existem hoje**: o webhook nasce na 6.1, o processador na 6.20 (o
DL-080 moveu o gate do endpoint para o processador — a camada **mudou de lugar, não desapareceu**) e
o agendador na 6.2. O que esta story entrega é o que **é possível provar hoje**:

- **o mecanismo:** `CapabilitiesService` recebe `companyId` **explícito** em todo método, de propósito,
  para funcionar onde não há `TenantContext`;
- **o registro:** `capability-gated-entrypoints.ts` — a fonte única onde processador e tarefas se
  registram, com o detalhe que a 6.20 não pode errar anotado ali (empresa cortada → evento gravado
  como `ignorado` e resposta **200** à Meta; responder erro faz a Meta desativar o webhook de
  **todos** os tenants);
- **o guard-rail:** o teste exige que cada ponto registrado alcance o `CapabilitiesService` no grafo
  de DI. Sem ele injetado, não há como checar o direito, e a suíte falha.

**Como a camada 2 não pode ser esquecida — sem lista manual.** O domínio gateado se auto-declara:
o provider recebe `@GatedByCapability("whatsapp_bot")`, e `capability-coverage.spec.ts` varre o
`AppModule` real exigindo que **todo controller que dependa dele** (transitivamente, pelo grafo de
DI) tenha `@RequireCapability` em **todas** as rotas e o `CapabilityGuard` na pilha. É a mesma
inferência que o `tenant-coverage` faz com o `TenantAwareRepository` (DL-027). O dia em que o
`WhatsAppService` nascer na 6.1, quem esquecer o gate numa rota **quebra a suíte na hora**.

---

## ⭐ Ponto D — Por que as capabilities viajam no `/users/me`

O `AuthContext` já faz polling do `/users/me` a cada ~20s para os flags do DL-062. As capabilities
entram **nesse mesmo payload**, num campo próprio e nomeado — `companyCapabilities`, separado dos
`canView*` — em vez de num endpoint dedicado. Três razões:

1. **Mesma janela de convergência, de graça.** O operador corta um cliente e a tela dele reflete no
   próximo ciclo, sem relogar — exatamente como já acontece com os flags de módulo.
2. **Endpoint separado criaria DUAS janelas** diferentes para dois eixos que a UI combina na **mesma**
   decisão de render (mostrar o item? marcado com coroa?), além de dobrar a requisição.
3. **Fica fora das rotas de lista** (`GET /users`, `/users/attenders`): lá o campo seria ruído
   repetido em cada linha e uma query a mais por request. Só `GET`/`PATCH /users/me` o devolvem —
   e o `PATCH` também precisa devolvê-lo, porque o `AuthContext` **substitui** o objeto do usuário
   pela resposta.

A leitura é sempre da **linha fresca**, nunca do token — mesma razão do DL-062. Não há cache: o custo
é uma query indexada nas rotas gateadas, barato perto de "cliente cortado continua usando 15 minutos".

---

## ⭐ Ponto E — Migration aditiva: ninguém perde, e ninguém ganha

`CreateCompanyCapabilities1718901900000` faz três coisas e **não converte dado nenhum**:

1. cria `company_capabilities` — `company_id` + `capability` (**VARCHAR, não ENUM**: recurso novo é
   **linha**, não migration) + `granted_at` + `granted_by`, com `UNIQUE (company_id, capability)` e
   FK `ON DELETE CASCADE`;
2. adiciona `companies.plan` com `DEFAULT 'basico'` — as linhas existentes recebem o padrão sem
   `UPDATE`;
3. **não concede capability a ninguém.**

O item 3 é deliberado, e o e2e o afirma explicitamente. O preset de preservação do acesso atual
(`PRESERVE_CURRENT_ACCESS`) é **vazio** porque, na virada, **nenhum recurso em produção é gateado por
capability** — `whatsapp_bot` e `lembrete_automatico` não existem no produto. Ninguém **perde** acesso
porque nada existente muda de gate; e conceder o Pró a todos aqui **daria** acesso que ninguém tinha,
que é o erro oposto.

Provado contra **base populada** (DL-064) em `test/migration-company-capabilities.e2e-spec.ts`:
desfaz a migration, insere empresas/usuários/clientes **por SQL cru** (a entidade já conhece a coluna
`plan`; o repositório do TypeORM tentaria escrever coluna inexistente — e isso é o que "base de
ANTES da migration" significa de verdade), re-aplica, e confere contagem preservada, `plan` padrão,
zero capabilities concedidas, a `UNIQUE`, o `CASCADE` e o rollback limpo.

---

## Arquivos

**Backend**

| Arquivo | Papel |
|---|---|
| `src/common/capabilities/capability.ts` | `CapabilityKey` + as chaves do primeiro momento; a tabela dos três eixos |
| `src/common/capabilities/plan.ts` | nomes de plano — vocabulário comercial, sem condicional |
| `src/common/decorators/require-capability.decorator.ts` | `@RequireCapability` (camada 2) e `@GatedByCapability` (guard-rail) |
| `src/database/entities/company-capability.entity.ts` | a lista; linha presente = direito ativo |
| `src/database/migrations/1718901900000-CreateCompanyCapabilities.ts` | migration aditiva |
| `src/modules/capabilities/capabilities.service.ts` | leitura da linha fresca; `grant`/`revoke`/`applyPlanPreset` |
| `src/modules/capabilities/capability-presets.ts` | **o único lugar** que traduz plano → capabilities |
| `src/modules/capabilities/capability-coverage.ts` | lógica do guard-rail das camadas 2 e 3 |
| `src/modules/capabilities/capability-gated-entrypoints.ts` | fonte única da camada 3 (vazia até a 6.1/6.20) |
| `src/modules/auth/guards/capability.guard.ts` | o 403 |
| `src/modules/users/users.controller.ts` | `MeProfile.companyCapabilities` |
| `src/modules/platform/platform.service.ts` | aplica o preset na contratação |

**Frontend:** `auth/AuthContext.tsx` (`companyCapabilities` + `CapabilityKey`) e
`lib/permissions.ts` (`hasCapability`, com as três diferenças para `canViewModule` documentadas).

**Sem controller novo** — esta story é fundação. A exposição reusa o `/users/me` existente e a
ativação por endpoint é a 6.16. Logo, **nada a acrescentar em `TENANT_AWARE_CONTROLLERS`**; o
`tenant-coverage.spec.ts` segue verde.

## Testes

| Arquivo | Cobre |
|---|---|
| `capability.guard.spec.ts` | 403/200, owner não passa por cima, rota sem gate não consulta banco |
| `capability-presets.spec.ts` | Básico vazio, Pró com as duas metades, plano desconhecido falha fechado |
| `capability-coverage.spec.ts` | os alarmes das camadas 2 e 3 + varredura do `AppModule` real |
| `plan-name-not-in-runtime.spec.ts` | nome de plano não vaza para a lógica |
| `test/capability-gate.e2e-spec.ts` | 403/200 ponta a ponta, as quatro combinações dos eixos, revogação com o mesmo token, isolamento por tenant, payload do `/users/me` |
| `test/migration-company-capabilities.e2e-spec.ts` | base populada, `UNIQUE`, `CASCADE`, rollback |
| `apps/web/src/lib/permissions.test.ts` | os dois eixos no front, incluindo resposta sem o campo (falha fechado) |

**Fixture:** `test/fixtures/capability-probe.module.ts` — controller de prova, montado **só** pelo
e2e (vive em `test/`, fora do `src/`). Existe porque a fundação não gateia nenhum recurso de produção
ainda; sem um ponto gateado de verdade não haveria como provar o 403 na pilha real, e "gate testado
só em unit" é como se descobre em produção que o guard não estava registrado.

## Fora de escopo

Cobrança, upgrade automático e autoatendimento de plano (mantido do DL-057; ver DL-076). A coroa e o
modal são a **6.15**; o endpoint de ativação é a **6.16**; a tela de WhatsApp e as **preferências** do
dono são a **6.17**; a checagem no processador do webhook é a **6.20**.
