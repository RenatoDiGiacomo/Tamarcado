# Story 5B.1 (spec para revisão): Fundação pública — tenant por slug, guard-rail, branding sem login

Status: **PROPOSTA para revisão do Renato** · a parte a olhar com cuidado (pré-tenant + isolamento) · **não implementar até o go**

> **Escopo:** a base do link — resolver o tenant por **slug** (sem login), com o **mesmo isolamento** do painel; e as leituras públicas seguras (**branding** + **serviços**). A disponibilidade e a criação do pendente são a **5B.2**; a tela de Pendentes/polling são a **5B.3/5B.4**.

---

## O problema central: tenant sem JWT, mas com o mesmo isolamento

Hoje o `TenantMiddleware` resolve o tenant pelo **JWT** (`req.user.companyId`) e é aplicado **por controller** via `TENANT_AWARE_CONTROLLERS` (DL-027). O guard-rail (DL-027) **quebra a suíte** se um controller que toca `TenantAwareRepository` não estiver coberto — evitando vazamento silencioso entre salões.

A página pública **não tem JWT**. Precisa resolver o tenant pelo **`:slug` da URL** (`/agendar/{slug}`) e, ainda assim, manter todo o acesso a dados **tenant-scoped** (nada de vazar entre salões). Duas famílias de precedente:
- **DL-026:** o `AuthController` resolve a company por `companySlug` (login) usando métodos **unscoped**.
- **DL-027:** `PRE_TENANT_CONTROLLERS` = toca repo tenant-aware **antes** de existir tenant (só o `AuthController` hoje).

**Nenhuma das duas encaixa perfeito:** o `AuthController` opera *unscoped* e resolve na mão; o público **quer** o scoping automático do `TenantAwareRepository` (para `salon_services`/`appointments` saírem filtrados sozinhos), só que a chave é o **slug**, não o token.

### Recomendação: uma TERCEIRA categoria — `PUBLIC_TENANT_CONTROLLERS` + `PublicSlugTenantMiddleware`

1. **`PublicSlugTenantMiddleware`** (novo), aplicado **só** às rotas `/public/:slug/*`:
   - lê **exclusivamente** o `:slug` do path (nunca body/query/header);
   - `companies.findBySlugUnscoped(slug)` → **404** se não existe;
   - **entra no `TenantContext`** com o `company_id` resolvido.
   - A partir daí, **todo `TenantAwareRepository` downstream fica scoped** ao salão do slug — igual ao painel, só que a origem do `company_id` é o slug. Zero acesso a repo tenant sem `company_id` setado (slug inválido = 404 antes do handler).
2. **`PUBLIC_TENANT_CONTROLLERS`** (nova fonte de verdade, ao lado de `TENANT_AWARE_CONTROLLERS`/`PRE_TENANT_CONTROLLERS`): lista os controllers públicos resolvidos por slug. O `AppModule.configure()` aplica o `PublicSlugTenantMiddleware` **exatamente** a essa lista.
3. **Guard-rail estendido (DL-027):** o teste passa a aceitar a cobertura por **qualquer** das três listas — um controller tenant-aware é válido se está em `TENANT_AWARE` **ou** `PRE_TENANT` **ou** `PUBLIC_TENANT`. Assim o invariante continua: **todo controller tenant-aware tem um middleware que seta `company_id` antes do handler** — só muda a **fonte** do id (JWT vs slug). Um controller público novo que esqueça a lista → **suíte quebra**.

> **Por que não jogar no `PRE_TENANT`?** Porque `PRE_TENANT` significa "resolve na mão, unscoped" (como o login). O público quer o **scoping automático** — mais seguro que scoping manual. Uma categoria própria deixa a intenção **explícita e auditável**, sem afrouxar o guard-rail. **(Decisão P-A a confirmar.)**

### Isolamento — o que garante que um slug nunca lê outro salão (AC7 da 5B.2)
- O middleware resolve **só** por `:slug` e seta o `TenantContext`; o controller/serviços **nunca** aceitam `companyId` de body/query (whitelist estrita — AC4 da 5B.2).
- `salon_services`/`appointments` saem do `TenantAwareRepository` **já filtrados** pelo `company_id` do contexto.
- **Testado:** `GET /public/{slugA}/services` retorna só serviços de A; o guard-rail cobre a classificação; a 5B.2 prova o cross-tenant (serviceId de B → 400).

---

## Branding sem login (DL-034, sem brecha)

O DL-034 proíbe **confiar em id de company vindo de fora** — para um **usuário logado** não ler outro tenant. Aqui **não há login**, o **slug é público** (o salão distribui o link) e expomos **só branding**:

- **`GET /public/:slug/installation`** → DTO **whitelisted** `{ name, logoUrl, primaryColor }`. Nada além.
- Resolve por slug (o `companies` **não** é tenant-aware — DL-034; a leitura é direta por slug, retornando só os campos de marca).
- O `InstallationController` **autenticado** (`req.user.companyId`) **não muda** — continua fechado.
- **Não é brecha:** sem token não há "outro tenant" para vazar; slug é handle público deliberado; DTO limitado; endpoint separado.

## Endpoints da 5B.1

| Método | Rota | Retorna | Notas |
|---|---|---|---|
| GET | `/public/:slug/installation` | `{ name, logoUrl, primaryColor }` | branding whitelisted; 404 se slug não existe |
| GET | `/public/:slug/services` | `[{ id, name, durationMinutes, price }]` | **só ativos**; tenant-scoped pelo slug |

- Ambos em `PUBLIC_TENANT_CONTROLLERS`. **Rate-limit** de leitura (frouxo) por cima; o POST estrito é a 5B.2.
- Sem PII, sem dados de agenda — só o que o salão **quer** público.

## Frontend da 5B.1

- **Rota pública** `/agendar/:slug` (React Router) — **sem** guard de auth (fora do `ProtectedRoute`).
- **Casca branded:** carrega `GET /public/:slug/installation` e aplica **nome + logo + cor primária** (a cor como acento, via variável CSS — mesmo mecanismo do DL-034/AppShell). Slug inexistente → tela "salão não encontrado".
- **Lista de serviços:** `GET /public/:slug/services` — a cliente escolhe o serviço (nome + duração + preço). É o **ponto de entrada**; escolher horário e confirmar é a 5B.2.
- **LGPD:** o aviso/consentimento aparece no passo de dados (5B.2); a 5B.1 é só leitura pública.

## Tasks / Subtasks (5B.1)

- [ ] `PublicSlugTenantMiddleware` (resolve slug → `TenantContext`; 404 se não existe).
- [ ] `PUBLIC_TENANT_CONTROLLERS` (fonte única) + wiring no `AppModule.configure()`.
- [ ] Estender o guard-rail (`tenant-coverage`) para aceitar a 3ª categoria; teste atualizado.
- [ ] `PublicBookingController` (`GET :slug/installation`, `GET :slug/services`) + DTOs de saída whitelisted.
- [ ] Front: rota `/agendar/:slug` pública, casca branded, lista de serviços.
- [ ] e2e: slug válido resolve e retorna branding/serviços do salão certo; **slug inexistente → 404**; **isolamento** (slug A nunca vê B); guard-rail reconhece o controller público.

## Fronteiras de escopo (5B.1)

- **NÃO** cria agendamento (5B.2). **NÃO** calcula disponibilidade (5B.2). **NÃO** tem a tela de Pendentes (5B.3).
- **NÃO** expõe nada além de branding + serviços ativos.

## Decisões a confirmar (5B.1)

| # | Decisão | Recomendação |
|---|---|---|
| **P-A** | 3ª categoria `PUBLIC_TENANT_CONTROLLERS` + middleware por slug (vs. jogar no PRE_TENANT com scoping manual) | **3ª categoria** — scoping automático + guard-rail intacto |
| **P-B** | `companies.findBySlug` unscoped | **Sim** — slug é a chave pública; retorna só branding/id p/ o contexto |
| **P-C** | Rota pública fora do `ProtectedRoute` | **Sim** — `/agendar/:slug` é aberta |

## References

- [plano-epico-agendamento-publico.md §2/§4] · [5B-2-*.md] (segurança do POST) · [DL-027] (guard-rail/PRE_TENANT) · [DL-026] (resolver tenant por slug) · [DL-034] (branding, nunca id de fora) · [NFR-S1] (isolamento).
