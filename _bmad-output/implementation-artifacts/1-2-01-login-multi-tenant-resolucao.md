# Bug crítico 1.2.01 — Resolução de tenant no login com N empresas

> **Classificação:** bug **bloqueador** para deploy **multi-tenant compartilhado** (N salões numa mesma instalação). **Não** é regressão da 5B.3 — é uma lacuna herdada da decisão de login da Story 1.2 (DL-026). **Não corrigir dentro da 5B.3.** Story de origem: **1.2** (Autenticação do dono). Spec própria para investigação/decisão + correção posterior.

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

## 4. Por que isto é (ou não é) bloqueador — questão de produto em aberto

O backend **já** suporta N tenants **via slug**. O gap é **como o front obtém o tenant** no login em produção. Depende do **modelo de deployment**, que precisa ser decidido:

- **Uma instalação por salão** (banco/subdomínio dedicado, tenant único por deploy) → o fallback atual é **suficiente**; **não é bloqueador**.
- **Multi-tenant compartilhado** (N salões numa instalação) → **é bloqueador**: todo login precisa do tenant, e hoje a UI não fornece.

## 5. Opções de correção (para decidir na spec — **não implementar agora**)

- **A. Subdomínio → slug.** `fernanda.tamarcado.app` deriva o slug do host e envia no login. Sem campo extra para a dona. (Requer wildcard DNS/roteamento.)
- **B. Campo "instalação" no login.** A dona digita/seleciona o salão; o front envia `companySlug`. Simples, mas expõe o slug na UX.
- **C. Assumir tenant único por deploy.** Formaliza o fallback; remove ambiguidade documentando que cada salão é um deploy. Zero código no login, mas fecha a porta do multi-tenant compartilhado.

## 6. Guard-rails

- **Fora do escopo da 5B.3.** Nada aqui deve ser corrigido dentro daquela story.
- **Não corrigir de improviso.** A escolha A/B/C é decisão de produto/arquitetura (atualiza DL-026); a implementação vira sua própria story.
- O e2e de multi-tenant login **já cobre** o caminho com slug (A/B/C do 1.3). Falta cobrir o caminho de produção escolhido.

## 7. Nota operacional (como o bug apareceu aqui)

O `tamarcado_dev` ficou com 2 empresas porque uma revalidação de e2e rodou com `DATABASE_NAME=tamarcado_dev` forçado (o e2e deve rodar em `tamarcado_test`), deixando a company de teste `salao-pend` para trás. Já foi limpo (voltou a 1 empresa; login OK). Isso foi só o **gatilho** que expôs a lacuna — a lacuna em si é a resolução de tenant descrita acima.
