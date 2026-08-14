# Story 5.1: Fundação de permissões — visibilidade de MÓDULO + interruptores por pessoa

Status: **em implementação** — decisões aprovadas (Renato, 2026-08-13); PR-1 (backend) aberto; PR-2 (frontend + screenshots) a seguir.

> Esta é a **fundação** do bloco DL-061/DL-062: é onde Financeiro (5.2–5.5) e
> Dashboard (5.6) plugam a proteção. **Erro de permissão aqui custa caro** — por
> isso a spec é explícita nos dois pontos que o Renato pediu para ver antes:
> **(A)** onde vive a informação de módulos e como ela chega no guard, e
> **(B)** o que acontece com quem está com a sessão aberta quando o Dono revoga.

## Story

As a Dono,
I want conceder ou negar, por pessoa, cada módulo (Financeiro, Dashboard) **e**
a operação da agenda de toda a equipe,
so that módulos sensíveis não nasçam visíveis para toda a equipe, eu possa
**delegar a agenda sem entregar o financeiro junto**, e uma revogação valha
**na hora**, não só depois de relogar.

---

## ⭐ Ponto A — Onde a informação de módulos vive e como chega no guard

**Vive na linha do usuário (`users`), por tenant** — não no token.

- **Colunas novas em `users`** (migration desta story), booleanas, **default `false`**:
  `can_view_financeiro`, `can_view_dashboard`. O **Dono ignora** os flags (owner
  = acesso total sempre; ver AC5). A escolha por **colunas tipadas** (em vez de
  tabela `user_module_access` ou JSON) é deliberada: são **poucos módulos**, o
  guard já carrega a linha do usuário, e coluna booleana é indexável, testável e
  óbvia. **Extensão:** cada módulo futuro (ex.: `can_configure_whatsapp`) é uma
  **coluna nova default `false`** — mesma mecânica; se um dia o número de módulos
  explodir, aí sim migra-se para uma tabela `user_module_access` (registrado como
  caminho de evolução, **não** agora).

- **Como chega no guard — pelo lookup por request que JÁ existe.** O
  `ActiveUserGuard` (DL-029, 1.2.04) já busca a **linha fresca** do usuário a
  cada requisição autenticada (`UsersService.findById`) para checar `is_active` e
  `token_version`. **Os flags de módulo entram nessa mesma leitura** — zero query
  extra. O `ActiveUserGuard` passa a **anexar a linha fresca ao request**
  (`req.currentUser = current`); um **`ModuleGuard`** novo, acionado por
  `@RequireModule('financeiro')`, lê o flag **de `req.currentUser`** (a linha do
  banco, não o token) e nega **403** se faltar.

- **Por que NÃO no JWT.** O `RolesGuard` de hoje lê `access_level` **do token**
  (`req.user.accessLevel`) — por isso mudança de papel só vale no próximo token.
  Se os flags de módulo fossem para o token, teríamos **exatamente o furo** do
  Ponto B: revogar e a pessoa seguir vendo o módulo até o token expirar/relogar.
  Então **flags de módulo não vão para o token** — vão para a linha lida a cada
  request. (O `access_level` continua no token para a matriz de **ações** FR-I2;
  a **visibilidade de módulo** é o eixo novo, e é o que precisa ser imediato.)

**Resumo do caminho:** request → `JwtAuthGuard` (identidade, do token) →
`ActiveUserGuard` (lê linha fresca: `is_active`, `token_version`, **flags de
módulo**; anexa `req.currentUser`) → `ModuleGuard` (`@RequireModule(...)` lê o
flag de `req.currentUser`) → `RolesGuard` (ações, FR-I2) → handler.

---

## ⭐ Ponto B — Revogação com a sessão aberta: **perde na hora, não espera relogar**

**Backend — imediato.** Como a autorização de módulo lê a **linha fresca do
banco a cada request** (Ponto A), no instante em que o Dono desliga o flag, a
**próxima** requisição àquele módulo recebe **403**. É o mesmo comportamento já
comprovado de `is_active` (demissão corta na hora, AC6 da 1.4) e de
`token_version` (troca de senha derruba as outras sessões) — sem esperar TTL,
sem relogar. **Uma revogação que deixasse a pessoa dentro por horas não seria
revogação** — e é justamente o que este desenho evita.

**Front — converge em segundos, sem relogar.** O menu é montado a partir dos
flags que vêm em `/users/me`. Numa sessão já aberta:
1. **Chão de segurança (garantido):** qualquer chamada ao módulo revogado volta
   **403**; o front trata **403-de-módulo** como "perdi o acesso" → **esconde o
   item, desmonta a rota e tira a pessoa da tela** na hora. Ou seja, mesmo que o
   menu ainda esteja pintado, **não dá para usar** o módulo nem por um clique.
2. **Convergência do menu (sem depender de clique):** o painel já faz **polling
   em segundo plano** (NFR-A3, 15–30s, para o contador de pendentes). A resposta
   desse polling passa a **carregar os flags de módulo** (ou um `access_version`
   que, ao mudar, dispara um refresh de `/users/me`). Assim o item **some do menu
   em até um ciclo de polling** (segundos), sem o usuário fazer nada e sem
   relogar.

**Efeito combinado:** no pior caso a pessoa vê o item por alguns segundos, mas
**não consegue usá-lo em nenhum momento** após a revogação (backend nega já na
próxima chamada). Não existe janela de "continua dentro por horas".

---

## ➕ Ponto C — Adição (Renato, 2026-08-13): flag de **escopo de agenda**

**Risco coberto:** com só **Dono** e **Gestão**, some o papel do **gerente que
opera a agenda de toda a equipe** (comum no salão real: a dona não fica no
balcão e alguém marca/remarca/cancela para qualquer profissional). Sem uma
válvula, a única saída seria **promover a pessoa a Dono** — entregando **tudo**,
inclusive o financeiro. A adição fecha isso.

**Interruptor novo:** **"Pode gerenciar agendamentos de toda a equipe"**
(`can_manage_all_appointments`), **OFF por padrão**, **só o Dono concede** —
mesmíssimo mecanismo de armazenamento (coluna em `users`), concessão e
**imediatismo** (linha fresca por request) dos demais.

**⚠️ Distinção que a implementação NÃO pode borrar:** este **não** é um flag de
*módulo* (não esconde menu, não é `@RequireModule`). É um flag de **escopo de
AÇÃO** dentro da Agenda — que **todo mundo já vê**. Ele **amplia** o alcance das
ações de agendamento de **"só os meus"** para **"de toda a equipe"** (criar,
remarcar, cancelar, atribuir para qualquer profissional). Logo:
- **NÃO** é conferido por `ModuleGuard` (que daria 403 no endpoint inteiro).
- **É** aplicado **dentro** dos endpoints de agendamento (Épico 3), no
  **escopo da consulta/ação**: sem o flag, a Gestão opera apenas os próprios
  (onde é `professional_id`); com o flag, opera os de todos os profissionais.
- Lido da **mesma linha fresca** (`req.currentUser`) → revogar tira o alcance
  **na hora** (mesma garantia do Ponto B).

**Caso real que isso destrava:** uma recepcionista é **Gestão + `attends_clients`
= false** (não atende ninguém) — então **não tem agendamentos "próprios"**. Sem
o flag ela não teria o que operar; **com** o flag ela opera a agenda de todos,
**sem** ver Financeiro nem Dashboard (que continuam OFF). É a delegação que você
descreveu, sem virar Dono.

**Padrão de Gestão (fecha o modelo):** Gestão, por padrão (todos os flags OFF),
vê/opera **só o próprio trabalho** (DL-062 item 3). O Dono liga, por pessoa e de
forma independente: `can_manage_all_appointments` (operar a agenda toda),
`can_view_financeiro`, `can_view_dashboard`.

---

## Acceptance Criteria

1. **(AC1 — Migration dos flags)** Dada a migration desta story, quando aplicada,
   então `users` ganha **três** colunas `BOOLEAN NOT NULL DEFAULT false`:
   `can_view_financeiro` e `can_view_dashboard` (**visibilidade de MÓDULO**) e
   `can_manage_all_appointments` (**escopo de AÇÃO da agenda** — ver AC9/Ponto C).
   **Aditiva** (usuários existentes ficam sem tudo; o Dono/`owner` ignora os
   flags — sempre pode). Reverte limpo.

2. **(AC2 — Papéis Dono/Gestão; "Básico" aposentado)** Dado o modelo de papéis
   (DL-062, revisa DL-022/FR-I1/FR-I2), quando a migration roda, então o enum de
   `access_level` deixa de oferecer `basic`; os usuários `basic` existentes são
   **convertidos para `manager` (Gestão) SEM ganhar módulos** (flags `false`) e
   **sem ampliar** o escopo de ações — ver "Decisão a confirmar 1". `owner` e
   `manager` permanecem.

3. **(AC3 — Backend nega o módulo com 403)** Dado o `ModuleGuard` +
   `@RequireModule('financeiro'|'dashboard')`, quando um usuário **sem** o flag
   chama um endpoint do módulo (direto na API), então recebe **403** —
   independentemente do front. O **Dono** (`owner`) passa sempre. A checagem lê a
   **linha fresca** do request (Ponto A), não o token.

4. **(AC4 — Front oculta o item e não monta a rota)** Dado que a pessoa não tem o
   módulo, quando o painel monta a navegação, então o item **não aparece no menu
   e a rota não é registrada** (não é tela com cadeado nem item que dá erro ao
   clicar — DL-062, regra 5b). **As duas camadas (AC3 backend + AC4 front) são
   obrigatórias e juntas** (DL-062, regra 5c).

5. **(AC5 — Interruptores por pessoa, só o Dono, Dono não se remove)** Dada a tela
   de **Equipe**, quando o **Dono** edita os interruptores ("Pode ver
   Financeiro", "Pode ver Dashboard"), então eles vêm **desligados por padrão**,
   **só o Dono** concede/revoga (endpoint `@Roles('owner')`), e o **Dono não pode
   remover o próprio acesso** a nada (owner ignora flags; a UI nem oferece o
   toggle para o próprio Dono — DL-062, regra 5a).

6. **(AC6 — Revogação imediata / Ponto B)** Dado um usuário com Financeiro
   **ligado** e a **sessão aberta**, quando o Dono **desliga** o flag, então a
   **próxima requisição** ao Financeiro daquele usuário recebe **403** (sem
   relogar, sem esperar o token expirar), e o item **some do menu** em até um
   ciclo de polling (ou imediatamente, ao receber o 403). Provado em e2e.

7. **(AC7 — Gestão sem módulos por padrão)** Dado um usuário Gestão recém-criado
   (sem interruptores), quando acessa o sistema, então **não vê** Financeiro nem
   Dashboard (menu ausente + API 403), coerente com "Gestão por padrão vê só o
   próprio trabalho" (DL-062, item 3). *(O escopo de dados da agenda/clientes da
   Gestão — "só os próprios" — é tratado nos módulos respectivos; ver Fronteiras
   de escopo.)*

8. **(AC8 — `/users/me` expõe os flags)** Dado o front, quando busca `/users/me`,
   então a resposta inclui **os três flags** (os de módulo, para montar o menu; e
   `can_manage_all_appointments`, para a Agenda decidir o que mostrar/permitir).
   O polling de pendentes (NFR-A3) passa a sinalizar mudança de acesso (flags ou
   `access_version`) para a convergência sem relogar (ver Ponto B).

9. **(AC9 — Escopo de agenda por flag + revogação imediata / Ponto C)** Dada a
   Agenda (Épico 3), quando um usuário **Gestão** age sobre agendamentos:
   - **sem** `can_manage_all_appointments` → só pode ver/criar/remarcar/cancelar/
     atribuir os **próprios** (onde é `professional_id`); ações sobre agendamento
     de outro profissional → **403** (ou fora do escopo da listagem);
   - **com** o flag → opera os de **toda a equipe** (qualquer profissional).
   - **NÃO** é `@RequireModule`/`ModuleGuard` — é aplicado **dentro** dos
     endpoints de agendamento, lendo o flag da **linha fresca** (`req.currentUser`).
   - **Imediato:** o Dono desliga o flag → a **próxima** ação sobre agendamento de
     outro profissional já é negada, **sem relogar**. Provado em e2e.
   - O **Dono** sempre opera tudo (ignora o flag).

---

## Pré-requisitos e contexto (no `dev`/`main`, já em produção)

- **Auth/guards (1.2/1.4):** `JwtAuthGuard` popula `req.user: AuthUser
  { userId, companyId, accessLevel, attendsClients, tokenVersion }` (do token).
  `RolesGuard` lê `req.user.accessLevel` (**token**) para a matriz FR-I2.
  `ActiveUserGuard` faz **lookup tenant-scoped por request**
  (`UsersService.findById`) e nega 401 se inativo **ou** se `token_version`
  divergir (1.2.04) — **é este o lookup que os flags de módulo reaproveitam**.
- **Ordem real por request:** `TenantMiddleware` → `JwtAuthGuard` →
  `ActiveUserGuard` → (`ModuleGuard` novo) → `RolesGuard` → handler.
- **Entidade `User` (`database/entities/user.entity.ts`):** hoje
  `access_level ENUM('owner','manager','basic')`, `attends_clients`, `is_active`,
  `token_version`, índices por `company_id`. Esta story **altera o enum**
  (tira `basic`) e **adiciona os flags**.
- **Front:** menu/rotas do painel montados no shell (sidebar desktop / tab bar
  mobile). `/users/me` já alimenta o contexto de auth. Polling de pendentes
  (NFR-A3/DL-019) já roda em segundo plano.
- **Guard-rail tenant (1.3.01):** todo controller que toca tabela tenant-aware
  entra em `TENANT_AWARE_CONTROLLERS`.
- **Fluxo Git (DL-059):** branch sai do `dev`, PR para o `dev`. Versionamento
  do produto: o merge dev→main que levar esta story define o bump (DL-063;
  `feat` → MINOR).

---

## Tasks / Subtasks (ordem TDD — red→green→refactor)

- [ ] **Task 1 — Migration: flags + aposentar `basic` (AC1, AC2)**
  - [ ] Colunas `can_view_financeiro`, `can_view_dashboard` **e**
        `can_manage_all_appointments` (`BOOLEAN NOT NULL DEFAULT false`) em `users`.
  - [ ] Converter `basic` → `manager` (dado) e **remover `basic` do enum**
        `access_level`; atualizar `AccessLevel` (entidade) e o enum do TypeORM.
  - [ ] Registrar no `data-source-options.ts`/`typeorm.config.ts`; e2e de
        migration (aplica/reverte limpo; espelhar `AddTokenVersionToUsers`).

- [ ] **Task 2 — `ActiveUserGuard` anexa a linha fresca (Ponto A)**
  - [ ] `ActiveUserGuard` passa a setar `req.currentUser = current` (a linha já
        buscada) além dos checks atuais — **sem query nova**.
  - [ ] Ajustar spec do `ActiveUserGuard` (segue negando inativo/sessão; agora
        também expõe `currentUser`).

- [ ] **Task 3 — `ModuleGuard` + `@RequireModule` (AC3)**
  - [ ] `common/decorators/require-module.decorator.ts`:
        `@RequireModule('financeiro'|'dashboard')` via `SetMetadata`.
  - [ ] `modules/auth/guards/module.guard.ts`: lê a metadata; **owner passa**;
        senão exige o flag correspondente em `req.currentUser`; falta → **403**.
        Sem `@RequireModule` → libera.
  - [ ] Unit spec: owner passa; manager com flag passa; manager sem flag → 403;
        rota sem decorator → passa.

- [ ] **Task 4 — Interruptores na Equipe (AC5)**
  - [ ] `PATCH /api/users/:id` (já `@Roles('owner')`, tenant-scoped) aceita os
        **três** flags (`can_view_financeiro`, `can_view_dashboard`,
        `can_manage_all_appointments`). **Bloquear** alterar os próprios flags do
        Dono (owner ignora; não faz sentido) e nunca permitir que o Dono se
        auto-remova (coerente com AC5/1.4-AC5).
  - [ ] UI da Equipe: três interruptores por pessoa, OFF por padrão, só o Dono vê/edita.
  - [ ] `GET /api/users` retorna os flags (sem vazar `password_hash`).
  - [ ] e2e: Dono liga/desliga flag de um Gestão; não-Dono tentando → 403.

- [ ] **Task 5 — `/users/me` + sinal de acesso para o front (AC8, Ponto B)**
  - [ ] `/users/me` inclui os flags.
  - [ ] Polling de pendentes carrega os flags **ou** um `access_version`
        (incrementa quando os flags do usuário mudam) que dispara refresh de
        `/users/me`.

- [ ] **Task 6 — Front: menu/rotas condicionais + reação ao 403 (AC4, AC6)**
  - [ ] Montar item de menu e **registrar a rota** só se o flag estiver ligado
        (as duas coisas — não basta esconder o item).
  - [ ] Interceptor: **403 de módulo** → esconde o item, desmonta a rota e
        redireciona (perda de acesso imediata na sessão aberta).
  - [ ] Convergência via polling (Task 5): item some sem relogar.

- [ ] **Task 6b — Escopo da Agenda por `can_manage_all_appointments` (AC9, Ponto C)**
  - [ ] Nos endpoints de agendamento (Épico 3): listagem e ações
        (criar/remarcar/cancelar/atribuir) passam a **escopar por profissional**
        para Gestão **sem** o flag (só onde é `professional_id`); **com** o flag,
        alcance de toda a equipe. Lê `req.currentUser.can_manage_all_appointments`
        (linha fresca); `owner` sempre total. **Não** usar `ModuleGuard` aqui.
  - [ ] Ação sobre agendamento de outro profissional sem o flag → **403**.
  - [ ] Front (Agenda): quem não tem o flag opera só a própria agenda; o seletor
        de profissional/ações de terceiros aparece só com o flag.
  - [ ] *(Interação com `attends_clients`: Gestão que não atende não tem "próprios"
        — sem o flag, não opera nada na agenda de terceiros; com o flag, opera a
        de todos. É o caso da recepção.)*

- [ ] **Task 7 — e2e da revogação imediata (AC6, AC9) e da dupla camada (AC3+AC4)**
  - [ ] e2e backend módulo: liga flag → 200 no módulo; Dono desliga → **próxima
        chamada 403** (mesma sessão/token).
  - [ ] e2e backend agenda: Gestão com `can_manage_all_appointments` age sobre
        agendamento de outro profissional → ok; Dono desliga → **próxima ação
        403** (mesma sessão).
  - [ ] e2e/integração front: sem flag de módulo, item ausente **e** rota não
        montada; chamada direta à API → 403.

- [ ] **Task 8 — Validação final**
  - [ ] `build && lint && typecheck && test` verde (unit + e2e, MySQL real),
        guard-rail 1.3.01 verde, sem `--forceExit`.
  - [ ] Conferência manual (compose): Dono liga/desliga Financeiro de um Gestão
        e o menu/uso reagem na hora, sem relogar.

---

## Dev Notes

### Fronteiras de escopo — o que NÃO fazer

- **NÃO** construir as telas de Financeiro/Dashboard aqui — isto é só a
  **fundação** de permissão; os módulos vêm nas 5.2–5.6 e **plugam**
  `@RequireModule(...)`.
- Esta story entrega **dois eixos novos**: (1) **visibilidade de MÓDULO**
  (`ModuleGuard`) e (2) **escopo da AGENDA por flag** (`can_manage_all_appointments`,
  aplicado dentro dos endpoints de agendamento — AC9/Task 6b). **NÃO** redesenhar
  o resto da matriz FR-I2 (ex.: escopo de **Clientes** por papel, outras ações) —
  isso segue nos módulos respectivos. Não confundir os dois eixos: módulo = 403 no
  endpoint inteiro + some do menu; agenda = amplia o alcance da ação, sem esconder
  a Agenda (que todos veem).
- **NÃO** colocar flags de módulo no **JWT** (quebraria a revogação imediata —
  ver Ponto A/B). O `access_level` continua no token (é a matriz de ações).
- **NÃO** introduzir biblioteca RBAC de terceiros — `@RequireModule`/`ModuleGuard`
  nativos (Nest `Reflector`), no padrão do `@Roles`/`RolesGuard`.
- **NÃO** quebrar regressões: login, refresh, `/users/me`, `ActiveUserGuard`
  (is_active/token_version), isolamento de tenant, guard-rail 1.3.01.

### Segurança / regressão

- Backend é a **fonte da verdade** — o front esconder o menu é UX, **não**
  segurança. Todo endpoint de módulo carrega `@RequireModule(...)`; sem isso,
  nasce aberto (revisar cada rota nova das 5.2–5.6).
- `owner` sempre passa (não pode se trancar para fora — AC5).
- Endpoints seguem tenant-scoped (id de outro tenant → 404, não 403).
- Nunca vazar `password_hash`.

### Testing

- Unit: `ModuleGuard` (owner/flag on/flag off/sem decorator); `ActiveUserGuard`
  (anexa `currentUser`, segue negando inativo/sessão).
- e2e (MySQL real): revogação imediata (AC6), dupla camada (AC3+AC4),
  interruptores só-Dono (AC5), migration aditiva + conversão de `basic` (AC1/AC2),
  regressões 1.2/1.4.

### References

- [Source: epics.md#Story 5.1] — ACs da 1ª leva (DL-061/DL-062).
- [Source: .decision-log.md#DL-062] — visibilidade de módulo, dupla camada
  obrigatória, papéis Dono/Gestão, interruptores por pessoa, regras 5a/5b/5c.
- [Source: .decision-log.md#DL-061] — bloco/2 levas; [#DL-029] — `ActiveUserGuard`
  com lookup por request (revogação imediata); [#DL-022] — dois eixos (revisado:
  fim do "Básico"); [#DL-059] — fluxo de branches; [#DL-063] — versionamento.
- [Source: active-user.guard.ts / roles.guard.ts / user.entity.ts] — trilho real
  onde os flags entram (linha fresca vs. token).

### Decisões aprovadas (Renato, 2026-08-13)

1. **Migração `basic` → `manager`: aprovada.** Produção está com **zero
   empresas** — sem risco de migração de dados. Ainda assim, least privilege:
   convertidos **sem módulos e sem escopo de agenda ampliado** (todos os flags
   `false`); ninguém ganha alcance novo pela conversão.
2. **Polling dos flags: incluir** (aprovado). A convergência do menu/escopo sem
   relogar entra já na 1ª versão (Task 5), além do 403-reativo.
3. **Colunas por módulo: aprovado.** **Gatilho para migrar depois para tabela
   `user_module_access`** (registrar e respeitar): quando **passar de ~6
   módulos/flags**, **OU** quando o Dono quiser **conceder acesso sem depender de
   deploy** (coluna nova exige migration + deploy; a tabela permite conceder em
   runtime). Até lá, colunas.
4. **Adição — flag de escopo de agenda** `can_manage_all_appointments` (Ponto C,
   AC9): mesmo mecanismo (coluna, só-Dono, OFF, imediato), mas **eixo de ação**,
   não de módulo. Fecha o buraco do "gerente de agenda" sem entregar o financeiro.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia).

### PR-1 — Backend (branch `story/5.1-fundacao-permissoes`)

**Entregue (TDD):**
- Migration `AddModuleFlagsAndRetireBasic`: 3 flags (`can_view_financeiro`,
  `can_view_dashboard`, `can_manage_all_appointments`, tinyint default 0) +
  aposenta `basic` (converte → `manager` em `users` e `user_invites`, estreita os
  enums). Reversível.
- `AccessLevel` = `owner|manager`; entidades/DTOs atualizados.
- `ActiveUserGuard` anexa a **linha fresca** em `req.currentUser`.
- `@RequireModule` + `ModuleGuard` (visibilidade de módulo, 403 pela linha
  fresca; owner passa) — **unit 6/6**.
- `@Actor()` / `toActor` (identidade + `canManageAll` da linha fresca) — usado na
  Agenda no lugar do antigo `accessLevel === "basic"`.
- **Reescopo da Agenda** (AC9): `roleScope`, `resolveProfessionalId` e as 8
  checagens do `appointments.service` passam de `basic` → `!canManageAll`.
- `PATCH /users/:id` aceita os 3 flags (só Dono); **owner ignora flags** → Dono
  não remove o próprio acesso (AC5). `/users/me` e `/users` expõem os flags.
- **e2e `permissions.e2e-spec`**: REVOGAÇÃO IMEDIATA (liga→200, desliga→próxima
  request 403 com o MESMO token), `/users/me` expõe flags, só-Dono concede, owner
  não se autolimita, `basic` rejeitado (400).

**Achado durante a implementação (furo do reescopo):** as rotas de **pendentes**
(`GET /pending`, `/pending-count`) só tinham `@Roles("owner","manager")`. Com o
`basic` aposentado, um `manager` restrito **passaria** a listar/contar pendentes
(o RolesGuard deixa de barrar). Corrigido: as 4 rotas de pendentes agora exigem
`canManageAll` (owner ou o flag) — coerente com "tratar a fila é operação de
agenda de toda a equipe". O teste que provava "basic → 403" virou "Gestão sem o
flag → 403" e segue válido.

**Verificação local:** typecheck **0 erros**; **unit 113/113**; lint limpo. Os
**e2e não rodaram nesta máquina** (Docker daemon indisponível → sem MySQL); eles
compilam e rodam no **CI** (serviço MySQL). A prova visual (screenshots) vem no
**PR-2** com o frontend + script Playwright (decisão "e2e prova + você captura").

**Dependência:** PR-1 estreita o enum de papel — o frontend ainda oferece
"Básico" (será removido no **PR-2**). Landar PR-1 e PR-2 juntos (ou PR-2 logo em
seguida) para o painel de Equipe não enviar `access_level: "basic"` (→ 400).

### PR-2 — Frontend (branch `story/5.1-pr2-frontend-permissoes`)

**Entregue:**
- `lib/permissions.ts`: `canManageAllAppointments` / `canViewModule` (espelham o
  backend; owner ignora flags). É o que 5.2/5.6 usarão para gatear seus menus.
- `AuthContext`: `CurrentUser` ganha os 3 flags; **`refreshUser`** (não desloga em
  falha transitória) + **polling dos flags** (~20s) → concessão/revogação
  "aparece" sem relogar.
- **Menu condicional:** AppShell mostra **Pendentes** só para quem gerencia a
  agenda de toda a equipe (`canManageAll`) — antes era owner/manager.
- **Rota condicional + 403-reativo:** `/pendentes` embrulhada em `RequireManageAll`
  (redireciona quem não tem; converge na revogação via polling). `usePendentes`:
  só consulta com `canManageAll`; **403 → zera o badge**.
- **3 interruptores na Equipe** (só Gestão; Dono não tem): "Pode ver Financeiro",
  "Pode ver Dashboard", "Pode gerenciar agendamentos de toda a equipe" — PATCH dos
  flags, OFF por padrão.
- Agenda/NovoAgendamento: `accessLevel === "basic"` → `canManageAllAppointments`
  (editar/marcar/confirmar/atribuir e o campo Profissional).
- **"Básico" 100% aposentado no front** (tipos, rótulos, mocks).

**Verificação:** web **189 testes** verdes (novos: interruptores; Pendentes por
flag), typecheck 0 erros, lint limpo.

**Screenshots:** **sem Playwright no repo** (decisão do Renato). O e2e do PR-1
prova a revogação imediata; o passo a passo para capturar Equipe + revogação ao
vivo foi entregue no PR.

**Cortes de escopo (Renato, 2026-08-14)** registrados no epics.md: 5.4 só CSV
(PDF = evolução); 5.7 (navegação) não é story (tab bar entra com o módulo); 5.8
(PaymentGateway) sai da 1ª leva (evolução).

### Change Log

| Data | Mudança |
|---|---|
| 2026-08-13 | Spec aprovada (draft→implementação). PR-1 backend: migration + guards + reescopo da Agenda + flags em users + e2e de revogação imediata. |
| 2026-08-14 | PR-2 frontend: permissions helpers + polling de flags + menu/rota condicional (Pendentes) + 403-reativo + 3 interruptores na Equipe. Cortes de escopo 5.4/5.7/5.8 no epics. |
