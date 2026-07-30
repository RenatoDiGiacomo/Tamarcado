# Bug crítico 1.2.01 — Resolução de tenant no login com N empresas

> **Classificação:** bug **bloqueador** para deploy **multi-tenant compartilhado** (N salões numa mesma instalação). **Não** é regressão da 5B.3 — é uma lacuna herdada da decisão de login da Story 1.2 (DL-026). **Não corrigir dentro da 5B.3.** Story de origem: **1.2** (Autenticação do dono).
>
> **Status:** **corrigido (PR #46, 2026-07-30)** — resolução por **slug na rota do painel** (`/app/{slug}/login`), decisão **DL-050** (2026-07-29). Ver §4 (decisão) e **§6 (as-built)**. A correção — roteamento no front, slug guardado para sessão expirada, remoção do fallback atrás de flag, e2e de isolamento — está implementada e validada (smoke real + suites verdes). Falta só o **merge** (do Renato).

## 1. Sintoma observado

Com **2 empresas** no banco, o login do painel (`dono@tamarcado.dev` e qualquer outro) passou a devolver **401** e a UI mostrou "E-mail ou senha incorretos" — dando a **falsa** impressão de senha trocada. A senha estava correta; o problema é a **resolução do tenant**.

## 2. Reprodução controlada (banco `tamarcado_multi`, 2 empresas + 1 owner cada)

Estado semeado — o **normal de um SaaS**, não uma anomalia:
- `salao-a` → `owner-a@multi.dev`
- `salao-b` → `owner-b@multi.dev`
- senha `multi123` para os dois

`POST /api/auth/login`:

| # | Corpo enviado | Resultado |
|---|---|---|
| 1 | `{email: owner-a, password}` **sem slug** (o que a UI faz hoje) | **401** `{"message":"Informe a instalação (companySlug)"}` |
| 2 | `{email: owner-b, password}` **sem slug** | **401** `{"message":"Informe a instalação (companySlug)"}` |
| 3 | `{email: owner-a, password, companySlug:"salao-a"}` | **200** ✅ |
| 4 | `{email: owner-b, password, companySlug:"salao-b"}` | **200** ✅ |
| 5 | `{email: owner-a, password, companySlug:"salao-b"}` (slug errado) | **401** `{"message":"Credenciais inválidas"}` |

**Leitura:** o backend **resolve N empresas corretamente QUANDO recebe o `companySlug`** (casos 3 e 4). O que quebra é o login **sem slug** com 2+ empresas (casos 1 e 2).

## 3. Causa raiz (código exato)

### (a) O login resolve a EMPRESA primeiro; não busca o usuário por e-mail global

`AuthService.validateUser` ([auth.service.ts:47-59](../../apps/api/src/modules/auth/auth.service.ts)):

```ts
const companyId = await this.resolveCompanyId(companySlug); // resolve tenant ANTES
const user = await this.users.findByCompanyAndEmail(companyId, email);
```

`findByCompanyAndEmail` faz `findOne({ where: { company_id, email } })`. O e-mail é **único POR TENANT** (`UNIQUE (company_id, email)`, **DL-026**), **não** globalmente — dois salões podem ter `owner@gmail.com`. Logo, **buscar por e-mail sozinho é ambíguo por design**; a empresa tem que ser resolvida antes. Isso está **correto** para multi-tenant.

### (b) O 401 vem da resolução do tenant, antes de qualquer checagem de senha

`AuthService.resolveCompanyId` ([auth.service.ts:30-45](../../apps/api/src/modules/auth/auth.service.ts)):

```ts
if (companySlug) { /* busca por slug; não achou → 401 "Credenciais inválidas" */ }
const companies = await this.companies.find({ take: 2 });   // SELECT ... FROM companies LIMIT 2
if (companies.length === 1) return companies[0].id;         // fallback tenant único
throw new UnauthorizedException("Informe a instalação (companySlug)"); // 0 ou 2+ empresas
```

Com 2+ empresas e sem slug, **estoura aqui** — a query de senha (`bcrypt.compare`) **nem roda**. A resposta é `401 {"message":"Informe a instalação (companySlug)"}`.

### (c) O front mascara a causa

A tela de Login ([Login.tsx](../../apps/web/src/pages/Login.tsx)) **não tem campo de instalação** e chama `login(email, password)` **sem `companySlug`** ([AuthContext.tsx](../../apps/web/src/auth/AuthContext.tsx)). No `catch`, mostra sempre "E-mail ou senha incorretos" — escondendo o "Informe a instalação". Por isso pareceu senha errada.

## 4. Decisão (DL-050) — slug na ROTA do painel

**Resolução por slug na rota do painel:** `/app/{slug}/login` (e demais telas do painel sob `/app/{slug}/…`). O front **extrai o slug da URL** e o envia no `POST /auth/login`; o backend **já** resolve por slug (`resolveCompanyId(companySlug)`) — **provado** no §2 (com slug = 200 para owner-a e owner-b). **Zero mudança de backend.**

- **Por que rota e não subdomínio:** sem DNS/certificado wildcard, sem infra nova. É a variação enxuta da "opção A".
- **Subdomínio por marca** (`fernanda.tamarcado.app`) fica como **evolução futura**: quando entrar, muda só o roteamento (derivar o slug do host) — o backend continua idêntico.

### (a) Slug da URL inexistente

`resolveCompanyId(companySlug)` com slug que não casa **já** lança `401 "Credenciais inválidas"` (§3b, caso 5) — **não** revela se o tenant existe (não vaza enumeração de salões). O front, em `/app/{slug}/*` com slug desconhecido, renderiza a **tela de login com erro genérico** ("E-mail ou senha incorretos") — mesma resposta de credencial errada, sem distinguir "salão não existe" de "senha errada". Nunca redireciona para um "salão não encontrado" que confirme a ausência.

### (b) e2e de isolamento com 2+ empresas (critério de aceite da correção)

A story de correção **deve** incluir e2e que, com **2 empresas** semeadas (cada uma com owner + dados próprios), prove:

1. `POST /auth/login` com `{email: owner-a, companySlug: salao-a}` → 200; o JWT carrega `companyId` de **salao-a**.
2. Com esse token, `GET /appointments` (e demais rotas tenant-aware) retorna **só** dados de salao-a — **nenhum** de salao-b.
3. `owner-a` com `companySlug: salao-b` → **401** (não existe naquele tenant); e um token de salao-a **jamais** enxerga `salao-b` (o `TenantMiddleware`/`TenantAwareRepository` já filtra por `companyId` do JWT — DL-022/DL-026).
4. Login **sem** slug (contrato novo) → **401** determinístico (ver §c).

> Já existe `tenant-isolation.e2e` (Story 1.3) provando o isolamento **pós-login** por `companyId` do JWT. O que falta e esta correção adiciona é o e2e do **caminho de login por slug de rota** com 2+ empresas (itens 1, 3-sem-slug e 4 acima).

### (c) Fallback de tenant único — **REMOVER** (recomendado)

Hoje `resolveCompanyId` sem slug retorna a única empresa se `companies.length === 1` ([auth.service.ts:40-44](../../apps/api/src/modules/auth/auth.service.ts#L40-L44)). **Recomendo remover** (contrato: **sem slug → 401 sempre**), porque:

- Com o slug **sempre** na rota do painel, produção **nunca** depende do fallback.
- O fallback é um caminho **silencioso e dependente de estado**: o login "funciona" com 1 empresa e **muda de comportamento** quando surge uma 2a — foi exatamente o que **mascarou este incidente** (o 401 parecia senha errada).
- Contrato explícito é mais simples de testar e raciocinar; elimina a classe de bug "resolve o tenant errado por acaso".

**Conveniência de dev** (login local sem digitar slug) fica atrás de flag **`AUTH_ALLOW_SINGLE_TENANT`** (default **off**; ligada só em `.env` de dev, se desejado). Assim o default de produção é seguro e o dev não perde ergonomia.

## 5. Guard-rails

- **Fora do escopo da 5B.3.** Nada aqui é corrigido dentro daquela story.
- **A correção é story própria** (deriva de 1.2). Backend praticamente não muda (só a possível remoção do fallback + flag); o grosso é **roteamento no front** (`/app/{slug}/…`, extrair slug, enviar no login) + os e2e do §b.
- **DL-050** registra a decisão; atualiza **DL-026** no ponto do fallback.

## 6. Como foi construído (as-built, PR #46 — `fix/1.2.01-login-tenant`)

> Registro do que a correção **efetivamente** entregou, para a spec sobreviver ao corpo do PR. Confere com a decisão do §4 e detalha as bordas que só surgiram na implementação (sessão expirada, slug guardado). Evidência: smoke real no navegador (5 prints, `salao-teste`) + suites verdes.

### 6.1 Backend — `resolveCompanyId` (contrato final)

- **Com slug:** `findOne({ where: { slug } })`; não achou → **401 "Credenciais inválidas"** (sem 500, sem enumeração).
- **Sem slug:** resolve a única empresa **somente** se `AUTH_ALLOW_SINGLE_TENANT` estiver **ligada** *e* existir **exatamente 1** empresa; caso contrário → **401 "Informe a instalação (companySlug)"**.
- Fallback de tenant único do §4(c) **removido do caminho padrão** e movido para trás da flag. `singleTenantLoginAllowed()` aceita só `"1"` ou `"true"`; **ausente (`undefined`), `"0"`, `"false"` e `""` = desligado** — **fail-closed** (ausente = slug obrigatório). Travado por unit (`auth.service.spec.ts`, incl. `it.each(["0","false",""])` + caso variável ausente).

### 6.2 Front — roteamento e slug na URL

- Rota **`/app/:slug/login`** ([App.tsx](../../apps/web/src/App.tsx)); a `Login` lê o slug com `useParams` e envia no `login(email, password, slug)` ([Login.tsx](../../apps/web/src/pages/Login.tsx)). Rota `/login` genérica mantida para dev tenant-único e primeiro acesso sem link.
- **Slug inexistente em `/app/{slug}/login`:** a tela renderiza normalmente; o submit recebe **401 genérico** ("E-mail ou senha incorretos. Tente novamente.") — sem 500, sem confirmar se o salão existe. Verificado no smoke (`/app/salao-fantasma/login`).

### 6.3 Bordas de sessão (o que o §4 não previa e a implementação resolveu)

As rotas internas do painel (`/`, `/clientes`, …) **não** carregam o slug na URL — então, ao expirar o token, o front precisa saber para qual `/app/{slug}/login` voltar. Resolvido guardando o slug no navegador:

- No **login bem-sucedido com slug**, grava `localStorage["tamarcado.slug"]` ([AuthContext.tsx](../../apps/web/src/auth/AuthContext.tsx)).
- **`loginPath()`** devolve `/app/{slug}/login` quando há slug guardado; senão, `/login` genérico.
- **`Protected`** ([App.tsx](../../apps/web/src/App.tsx)) redireciona por `loginPath()` — cobre **sessão expirada**, **logout** e **acesso direto a rota interna sem sessão**.
- O slug **persiste no logout** (identifica o tenant daquele navegador para o próximo login).
- **Sem sessão e sem slug guardado** (navegador novo, acesso direto a rota interna): vai para o **`/login` genérico**. Em produção (flag off) esse login sem slug dá 401 determinístico — o dono reentra pelo **`painelUrl`** que a Story 1.9 emite (`/app/{slug}/login`). Em dev (flag on) o `/login` resolve a instalação única.

### 6.4 Testes e CI

- **Unit** `auth.service.spec.ts` (14): senha ok/errada, inativo, múltiplas instalações → 401, **sem slug + flag off/ausente/`"0"`/`"false"`/`""` → 401**, sem slug + flag on → resolve, slug inexistente → 401.
- **e2e** `login-multi-tenant.e2e-spec.ts`: 2 empresas, cada owner loga pelo próprio slug e vê só os próprios dados; slug do outro → 401; sem slug com 2+ → 401; slug inexistente → 401.
- **Front**: `Login.test` (lê/envia slug da rota; `/login` genérico envia `undefined`), `AuthContext.test` (`loginPath()`, persistência do slug).
- **CI**: `turbo.json` (`test.env`) passou a declarar `AUTH_ALLOW_SINGLE_TENANT` e `PLATFORM_KEY` — o env-mode strict do Turbo só repassa ao processo de teste as variáveis da allowlist; sem isso a flag chegava vazia e os e2e sem slug caíam em 401 no CI.

### 6.5 Nota de deploy (VPS)

- **`AUTH_ALLOW_SINGLE_TENANT` fica OFF** em produção (ausente ou `0`) — o contrato multi-tenant exige slug na rota. A flag é **conveniência de dev/CI apenas**.
- **`PLATFORM_KEY`** (Story 1.9) é **gerada nova e longa no VPS**, **fora do repositório** — o valor de dev do `.env` **não** vai para produção. Ver também a "Nota de deploy" no `epics.md` (Épico 1).

## 7. Nota operacional (como o bug apareceu aqui)

O `tamarcado_dev` ficou com 2 empresas porque uma revalidação de e2e rodou com `DATABASE_NAME=tamarcado_dev` forçado (o e2e deve rodar em `tamarcado_test`), deixando a company de teste `salao-pend` para trás. Já foi limpo (voltou a 1 empresa; login OK). Isso foi só o **gatilho** que expôs a lacuna — a lacuna em si é a resolução de tenant descrita acima.
