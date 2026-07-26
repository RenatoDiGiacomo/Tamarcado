# Story 5B.2 (spec para revisão): Disponibilidade pública + criar pendente — SEGURANÇA do POST

Status: **PROPOSTA para revisão do Renato** · foco: segurança do endpoint público de criação · **não implementar até o go pós-3.7**

> **Premissa: o POST público é HOSTIL por padrão.** Recebe input de qualquer pessoa, sem login. **Regra de ouro:** toda validação roda no **backend** (DTO + service). O front valida só para UX (erro na hora); a defesa **não** depende dele — um atacante pula o formulário e manda por `curl`/console. Não tentamos bloquear console/devtools (teatro contornável). A proteção real é o backend **não confiar em nada** que vem do cliente. **Os testes de segurança batem a API direto (supertest), sem passar pelo front.**

---

## Endpoint

- **`POST /public/:slug/appointments`** — cria um agendamento **pendente** (a cliente agenda; o salão confirma no painel).
- Sem auth. Tenant resolvido **só** pelo `:slug` da URL (§AC7). Em `PRE_TENANT_CONTROLLERS` (DL-027), exceção auditada pelo guard-rail.
- Efeito **forçado pelo service** (nunca do body): `company_id` = resolvido do slug · `status = "pending"` · `source = "link"` · `professional_id = null` · `created_by_user_id = null`.
- Rate limit + antispam (§5 do plano) por cima — complementar, não substitui as validações abaixo.

## DTO — `CreatePublicAppointmentDto` (única forma de entrada)

`ValidationPipe` com **`whitelist: true` + `forbidNonWhitelisted: true` + `transform: true`** aplicado ao controller público.

| Campo | Validador (class-validator) | Regra |
|---|---|---|
| `name` | `@Matches(/^[\p{L}\p{M}][\p{L}\p{M}\s'’\-]{0,98}[\p{L}\p{M}]$/u)` | letras (com acento) + espaço + apóstrofo (`'`/`’`) + hífen; **2–100**; **proíbe** dígitos, `< > { } ; / ` e símbolos |
| `phone` | `@Matches(/^\d{2}9?\d{8}$/)` | **só dígitos**, DDD(2) + `9?` (celular) + número(8) = **10 ou 11 dígitos** |
| `serviceId` | `@Matches(/^\d+$/)` | id numérico; existência/tenant validados no service (§AC6) |
| `date` | `@Matches(/^\d{4}-\d{2}-\d{2}$/)` | formato fixo; **hoje-ou-futura** (civil, fuso do tenant) no service |
| `time` | `@Matches(/^([01]\d\|2[0-3]):[0-5]\d$/)` | `HH:MM` válido |
| `consent` | `@IsBoolean()` + `@Equals(true)` | **obrigatório `true`** (LGPD, NFR-S2) |

Nada além desses 6 campos. **Sem** `companyId`, `status`, `id`, `professional_id`, `price` (§AC4).

---

## ACs de segurança (testados — não "boa prática implícita")

### AC1 — SQL injection: nada de query crua com input concatenado
**Mecanismo:** todo acesso a banco no caminho público é via **TypeORM parametrizado** (`repo.findOne({ where: { … } })` / query builder com `:param`). Zero concatenação de string com input. A resolução de slug (`where: { slug }`), o lookup de serviço (`where: { id, company_id }`) e o find-or-create de cliente (`where: { company_id, phone_whatsapp_normalized }`) são todos bind de parâmetro.
**Testes (API direto):**
- `serviceId: "1; DROP TABLE appointments; --"` → **400** (regex `^\d+$`); e `SELECT COUNT(*)` de `appointments` **inalterado**, tabela **existe**.
- `name: "Robert'); DROP TABLE clients;--"` → **400** (regex do nome barra `)` `;` `/`).
- Um nome legítimo com apóstrofo (`"O'Brien"` / `"D'Ávila"`) → **cria** e é **gravado literal** (prova de bind: o apóstrofo vira dado, não sintaxe).

### AC2 — XSS: nome renderizado como TEXTO, nunca HTML (defesa na SAÍDA)
**Mecanismo:** a tela de **Pendentes** (recepcionista) renderiza o nome via **JSX `{name}`** (auto-escape do React). **Proibido `dangerouslySetInnerHTML`** em qualquer componente do caminho público/pendentes.
**Testes (independentes da validação de entrada — §nota das duas camadas):**
- **Render (front):** monta a tela de Pendentes com um nome vindo da API contendo `"<img src=x onerror=alert(1)>"` (injetado direto no mock, **simulando um valor que escapou da validação**) → o texto aparece **literal** (`getByText`) e **não** existe elemento `<img>`/`<script>` no DOM.
- **Guarda estática:** teste/grep que **falha** se `dangerouslySetInnerHTML` aparecer nos componentes do caminho (booking público + Pendentes).

### AC3 — Validação por regex ESTRITA em cada campo (no DTO backend)
**Mecanismo:** a tabela do DTO acima. Roda no backend, no `ValidationPipe`.
**Testes (API direto), por campo:**
- **phone:** aceita `"11999998888"` (11) e `"1133334444"` (10); rejeita `"+5511999998888"`, `"(11) 99999-8888"`, `"11999"`, `"abc"` → **400**.
- **name:** aceita `"María D'Ávila-Santos"`, `"José"`, `"Ana Clara"`; rejeita `"João123"`, `"<script>"`, `"Bobby;DROP"`, `"a"` (curto), `"x".repeat(101)` (longo), `"Ana/Maria"` → **400**.
- **date:** rejeita `"2020-01-01"` (passado) e `"31/12/2026"` (formato) → **400**; aceita hoje/futuro.
- **time:** rejeita `"25:00"`, `"9h"` → **400**.
- **consent:** `false`/ausente → **400**.

### AC4 — Whitelist estrita (rejeita campo a mais)
**Mecanismo:** `forbidNonWhitelisted: true` → **qualquer** propriedade fora dos 6 campos → **400** (não "silenciosamente ignorada"). Reforço de defesa em profundidade: o service **hardcoda** `company_id`/`status`/`source`/`professional_id`, então mesmo que um campo passasse, é ignorado.
**Testes (API direto):**
- Body com `companyId: <id de outro salão>` extra → **400** (e nenhum agendamento criado).
- Body com `status: "confirmed"` extra → **400**.
- Body com `id: 1` ou `professional_id: 5` extra → **400**.
- (Prova da 2ª camada) Mesmo hipoteticamente aceito, o agendamento nasce `pending`/`source=link`/sem profissional — assertado no registro criado por um POST **válido**.

### AC5 — Payload limit (teto de tamanho do body)
**Mecanismo:** limite de corpo (ex.: **16 KB**) no parser JSON do caminho público → body gigante retorna **413 Payload Too Large** antes de chegar à lógica. `@MaxLength(100)` no nome é a segunda barreira.
**Teste (API direto):** POST com body de ~1 MB (ex.: `name` gigante) → **413** (ou **400** pelo `MaxLength`), sem estourar memória nem criar registro.

### AC6 — `serviceId` cross-tenant não cria agendamento cruzado
**Mecanismo:** o lookup do serviço é **escopado ao tenant resolvido pelo slug**: `where: { id: serviceId, company_id: <resolvido>, is_active: true }`. Serviço de **outro** salão → não encontrado → **400 "Serviço inválido."**.
**Teste (API direto):** salões A e B; `POST /public/{slugA}/appointments` com `serviceId` = serviço **de B** → **400**; `appointments` de A **e** de B inalterados.

### AC7 — Isolamento por slug (um slug nunca lê/escreve outro salão)
**Mecanismo:** o `PublicBookingController` resolve o tenant **exclusivamente** por `:slug` (via `findBySlugUnscoped`), entra no `TenantContext` com esse `company_id`, e **nunca** aceita `companyId` de body/query/header (§AC4). Registrado em `PRE_TENANT_CONTROLLERS` com justificativa → o **guard-rail (DL-027) quebra a suíte** se a classificação faltar.
**Testes:**
- `GET /public/{slugA}/services` retorna **só** serviços de A (nunca de B).
- Um POST em `{slugA}` cria agendamento **em A** (assert `company_id`), nunca em B.
- Guard-rail: teste de cobertura de tenant reconhece o controller público como exceção **auditada** (some ou está na allowlist com justificativa).

---

## Nota — DUAS camadas independentes (entrada + saída)

A validação estrita de **entrada** (AC3/AC4) **não dispensa** o escape na **saída** (AC2). São defesas independentes:
- Se a validação de entrada tiver brecha (regex frouxo, campo novo), o **escape do React** na tela de Pendentes segura o XSS.
- Se algum dia um valor malicioso entrar por outro caminho (import, seed, bug), a saída continua segura.
Ambas são exigidas e **testadas separadamente**.

## Plano de testes (arquivos)

- **`test/public-booking-security.e2e-spec.ts`** (supertest, **API direto**): AC1, AC3, AC4, AC5, AC6, AC7 — payloads crus simulando `curl`/console.
- **`test/public-booking.e2e-spec.ts`**: caminho feliz (cria pendente `source=link`, sem profissional) + LGPD (consent).
- **Front:** `Pendentes.test.tsx` — AC2 render (nome malicioso vira texto) + guarda `dangerouslySetInnerHTML`.
- **Unit:** `tenant-coverage.spec.ts` (já existe) cobre o AC7 (guard-rail).

## Fora de escopo desta story

- Rate limiting/antispam detalhado (fica no §5 do plano / 5B.2, mas as **7 ACs acima** são o núcleo de validação).
- CAPTCHA/Turnstile (só se houver abuso — plano §5).
- Notificação à cliente (Épico do bot).

## Decisões (revisão do Renato — 2026-07-26) — aprovadas

| # | Decisão | Resolução |
|---|---|---|
| **S1** | phone estrito só-dígitos | ✅ **Sim** (`^\d{2}9?\d{8}$`); o front tira a máscara antes de enviar |
| **S2** | Teto do payload | ✅ **16 KB** no caminho público (→ 413) |
| **S3** | name: apóstrofo curvo `’` além do reto `'` | ✅ **Aceitar os dois** — iPhone/Word convertem `'`→`’` sozinhos; senão "D'Ávila" do iPhone seria rejeitado |
| **S4** | validade de slot | ✅ Regra de **negócio**, não AC de segurança. **Mas registrar como regra:** o slot é **revalidado no BACKEND na criação** (a disponibilidade é recalculada no service, não se confia que o front só ofereceu livres). Conflito **avisa, não bloqueia** (D1). |

> **Nota S4 (regra de negócio, não AC de segurança):** o `POST /public/:slug/appointments` **recalcula a disponibilidade no service** no momento da criação — o backend nunca assume que o horário recebido está livre só porque o front o ofereceu. Se o slot ficou indisponível entre a leitura e o envio, aplica a política da D1 (aviso/`overbooked`, não bloqueio duro) ou 409 conforme o modelo do link (a decidir na spec de implementação da 5B.2, junto com a política de concorrência NFR-C1).

## References

- [plano-epico-agendamento-publico.md §2/§4/§5/§6] · [DL-027] (PRE_TENANT + guard-rail) · [DL-034] (nunca id de fora) · [DL-026] (resolver tenant por slug) · [NFR-S1/S2] (isolamento/LGPD).
