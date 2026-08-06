---
title: "Arquitetura Técnica — Tamarcado"
status: final
created: 2026-06-15
updated: 2026-06-20
author: Winston (System Architect)
prd_ref: "_bmad-output/planning-artifacts/prds/prd-Tamarcado-2026-06-15/prd.md"
ux_ref: "_bmad-output/planning-artifacts/ux/ux-Tamarcado-2026-06-15/ux-spec.md"
---

# Arquitetura Técnica — Tamarcado

---

## 1. Visão Geral

Tamarcado é um SaaS de agendamento WhatsApp-first para profissionais de beleza no Brasil. A arquitetura reflete três restrições permanentes: **dev solo**, **infra ≤ R$130/mês**, e **MVP em 90 dias**. A escolha central é um **monolito modular NestJS** — módulos com fronteiras claras que podem ser extraídos futuramente, sem a sobrecarga operacional de microsserviços.

### Stack definitiva

| Camada | Tecnologia |
|---|---|
| Backend | NestJS + TypeScript |
| Banco de dados | MySQL 8 |
| Cache / Filas | Redis + BullMQ |
| Frontend web | React + TypeScript + Vite |
| Acesso mobile | Painel web responsivo + PWA (mesmo `apps/web`) — DL-051 revoga o app React Native/Expo somente leitura |
| WhatsApp (MVP) | Evolution API (self-hosted) |
| WhatsApp (futuro) | Cloud API oficial Meta |
| Pagamentos (futuro) | Asaas |
| Processo prod | PM2 |
| Proxy | Nginx |
| TLS | Certbot (Let's Encrypt) |
| CI/CD | GitHub Actions |

---

## 2. Estrutura do Monorepo

```
tamarcado/
├── apps/
│   ├── api/                          # NestJS — monolito modular
│   ├── web/                          # React + Vite — painel web
│   └── mobile/                       # React Native + Expo — app leitura
├── packages/
│   ├── shared-types/                 # DTOs e types compartilhados entre apps
│   └── shared-utils/                 # Utilitários sem dependência de framework
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── web.Dockerfile
│   │   └── evolution-api.Dockerfile
│   ├── compose/
│   │   ├── docker-compose.yml        # Dev (tudo local)
│   │   └── docker-compose.staging.yml # Staging (local, build de produção — ver ADR-010)
│   ├── nginx/
│   │   └── tamarcado.conf
│   └── scripts/
│       ├── deploy.sh
│       ├── seed-dev.sh
│       └── backup-mysql.sh
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── package.json                      # root (workspaces)
├── pnpm-workspace.yaml
└── turbo.json
```

### Estrutura interna do API (NestJS)

```
apps/api/src/
├── main.ts
├── app.module.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── local.strategy.ts
│   │   └── guards/
│   │       ├── jwt-auth.guard.ts
│   │       └── roles.guard.ts
│   ├── tenant/
│   │   ├── tenant.module.ts
│   │   ├── tenant.service.ts
│   │   └── tenant.middleware.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── clients/
│   │   ├── clients.module.ts
│   │   ├── clients.controller.ts
│   │   └── clients.service.ts
│   ├── services/                     # Serviços do salão (ex: corte, manicure)
│   │   ├── services.module.ts
│   │   ├── services.controller.ts
│   │   └── services.service.ts
│   ├── professionals/
│   │   ├── professionals.module.ts
│   │   ├── professionals.controller.ts
│   │   └── professionals.service.ts
│   ├── schedules/                    # Horários de trabalho por profissional
│   │   ├── schedules.module.ts
│   │   ├── schedules.controller.ts
│   │   ├── schedules.service.ts
│   │   └── availability.service.ts  # Lógica de slots disponíveis
│   ├── appointments/
│   │   ├── appointments.module.ts
│   │   ├── appointments.controller.ts
│   │   ├── appointments.service.ts
│   │   └── jobs/
│   │       └── appointment-timeout.processor.ts
│   ├── notifications/
│   │   ├── notifications.module.ts
│   │   └── notifications.service.ts
│   ├── whatsapp/
│   │   ├── whatsapp.module.ts
│   │   ├── whatsapp-provider.interface.ts
│   │   ├── providers/
│   │   │   ├── evolution-api.provider.ts  # MVP — ativo
│   │   │   └── cloud-api-meta.provider.ts # Futuro — plugável
│   │   ├── bot/
│   │   │   ├── bot.orchestrator.ts
│   │   │   └── conversation-state.service.ts
│   │   └── whatsapp.controller.ts         # Webhook endpoint
│   ├── payments/
│   │   ├── payments.module.ts
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   └── gateways/
│   │       ├── payment-gateway.interface.ts
│   │       └── null-payment.gateway.ts    # MVP — sem integração real
│   ├── reports/
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts
│   │   └── reports.service.ts
│   └── installation/                      # Configurações da instalação
│       ├── installation.module.ts
│       ├── installation.controller.ts
│       └── installation.service.ts
├── common/
│   ├── decorators/
│   │   ├── tenant.decorator.ts            # @CurrentTenant()
│   │   └── roles.decorator.ts             # @Roles('owner', 'manager') — por access_level
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── logging.interceptor.ts
│   └── repository/
│       └── tenant-aware.repository.ts     # Base class multi-tenant
└── database/
    ├── database.module.ts
    ├── typeorm.config.ts
    └── migrations/
        └── ...
```

---

## 3. Modelo de Dados

> Todas as tabelas de domínio carregam `company_id`. Índices compostos sempre têm `company_id` como coluna líder para garantir isolamento e performance por tenant.

> **Ordem de criação das tabelas (migrations) — DL-020:** as FKs impõem uma ordem. `clients` deve ser criada **antes** de `appointments` (que tem FK `client_id → clients`). `appointments` deve existir antes de `whatsapp_conversations.appointment_id` ser ligada por FK. Ordem de dependência: `companies` → `users` → `salon_services`/`professional_services`/`professional_schedules` → `clients` → `appointments` → `whatsapp_conversations` → `payments`. No Épico 2, isso significa criar `clients` antes da story de cálculo de disponibilidade (que cria `appointments`).

### 3.1 `companies` (tenants)

```sql
CREATE TABLE companies (
  id                    BIGINT        NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(100)  NOT NULL,
  slug                  VARCHAR(50)   NOT NULL,
  logo_url              VARCHAR(500)  NULL,
  primary_color         VARCHAR(7)    NULL DEFAULT '#6C63FF',
  -- tema (light/dark) é preferência individual do usuário — ver users.theme (DL-021)
  business_hours_start  TIME          NOT NULL DEFAULT '08:00:00',
  business_hours_end    TIME          NOT NULL DEFAULT '19:00:00',
  business_days         VARCHAR(20)   NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat',
  timezone                  VARCHAR(50)   NOT NULL DEFAULT 'America/Sao_Paulo',  -- por tenant; default Brasília
  whatsapp_provider         ENUM('evolution_api', 'cloud_api_meta') NOT NULL DEFAULT 'evolution_api',
  evolution_instance_name   VARCHAR(100)  NULL,   -- nome da instance Evolution API desta instalação
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_slug (slug)
);
```

### 3.2 `users` (dono, profissional, funcionário)

```sql
CREATE TABLE users (
  id              BIGINT        NOT NULL AUTO_INCREMENT,
  company_id      BIGINT        NOT NULL,
  name            VARCHAR(100)  NOT NULL,
  email           VARCHAR(200)  NOT NULL,
  phone_whatsapp  VARCHAR(20)   NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  access_level    ENUM('owner', 'manager', 'basic') NOT NULL,   -- eixo 1: nível de acesso (DL-022)
  attends_clients BOOLEAN       NOT NULL DEFAULT FALSE,          -- eixo 2: tem agenda própria? (DL-022)
  slot_interval_minutes INT     NOT NULL DEFAULT 0,             -- intervalo entre atendimentos, por profissional (FR-G3, DL-032)
  theme           ENUM('light', 'dark') NOT NULL DEFAULT 'light', -- preferência individual do usuário (DL-021)
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_tenant_email (company_id, email),   -- email único POR TENANT (DL-026): mesma pessoa pode atender em >1 salão
  KEY idx_users_company_access   (company_id, access_level),
  KEY idx_users_company_attends  (company_id, attends_clients),
  KEY idx_users_company_active   (company_id, is_active),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

**Modelo de acesso em dois eixos (DL-022):** papéis não são mutuamente exclusivos. Cada usuário combina um *nível de acesso* com o atributo *atende clientes*.

**Eixo 1 — `access_level`:**
- `owner` (Dono) — acesso total; vê relatórios financeiros consolidados, configura instalação, gerencia usuários
- `manager` (Gestão) — vê todas as agendas, confirma/cancela/cria agendamentos de todos, registra pagamentos de todos, gerencia clientes; **não** vê relatórios consolidados nem configura o sistema (antigo "funcionário/recepcionista")
- `basic` (Básico) — vê e gerencia apenas a própria agenda e os próprios agendamentos (ou não atribuídos) (antigo "profissional")

**Eixo 2 — `attends_clients`:** se `true`, o usuário tem agenda própria — entra no cálculo de disponibilidade (`AvailabilityService`) e pode ser atribuído como `appointments.professional_id`, **independentemente do `access_level`**. Quem define disponibilidade e serviços executados são as tabelas `professional_schedules` e `professional_services`, que se aplicam a usuários com `attends_clients = true`.

> Exemplos: dona que atende = `owner` + `attends_clients=true`; manicure que recepciona = `manager` + `attends_clients=true`; recepcionista pura = `manager` + `attends_clients=false`; profissional puro = `basic` + `attends_clients=true`.

### 3.3 `clients` (clientes finais)

```sql
CREATE TABLE clients (
  id                          BIGINT        NOT NULL AUTO_INCREMENT,
  company_id                  BIGINT        NOT NULL,
  name                        VARCHAR(100)  NOT NULL,
  phone_whatsapp              VARCHAR(20)   NULL,
  phone_whatsapp_normalized   VARCHAR(20)   NULL,   -- E.164 (+5511999999999)
  notes                       TEXT          NULL,
  is_deleted                  BOOLEAN       NOT NULL DEFAULT FALSE,  -- soft delete; ver seção 3.11 LGPD
  created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_tenant_phone (company_id, phone_whatsapp_normalized),
  KEY idx_clients_company_name    (company_id, name),
  KEY idx_clients_company_deleted (company_id, is_deleted),
  CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

> `phone_whatsapp` guarda o número como digitado; `phone_whatsapp_normalized` guarda em E.164 para matching e deduplicação. Cliente sem WhatsApp: ambos NULL. A constraint UNIQUE usa NULL seguro — duas linhas com NULL não conflitam no MySQL.

### 3.4 `salon_services` (serviços oferecidos pela instalação)

```sql
CREATE TABLE salon_services (
  id                BIGINT          NOT NULL AUTO_INCREMENT,
  company_id        BIGINT          NOT NULL,
  name              VARCHAR(100)    NOT NULL,
  duration_minutes  INT             NOT NULL,
  price             DECIMAL(10,2)   NULL,            -- opcional: serviço "sob consulta"/variável (DL-030)
  is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_services_company_active (company_id, is_active),
  CONSTRAINT fk_services_company FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

### 3.5 `professional_services` (quais serviços cada profissional executa)

```sql
CREATE TABLE professional_services (
  professional_id   BIGINT    NOT NULL,
  service_id        BIGINT    NOT NULL,
  company_id        BIGINT    NOT NULL,   -- desnormalizado para filtros rápidos
  PRIMARY KEY (professional_id, service_id),
  KEY idx_prof_services_company_service (company_id, service_id),
  CONSTRAINT fk_ps_professional  FOREIGN KEY (professional_id) REFERENCES users(id),
  CONSTRAINT fk_ps_service       FOREIGN KEY (service_id)      REFERENCES salon_services(id)
);
```

### 3.6 `professional_schedules` (configuração de horários de trabalho)

```sql
CREATE TABLE professional_schedules (
  id                BIGINT      NOT NULL AUTO_INCREMENT,
  company_id        BIGINT      NOT NULL,
  professional_id   BIGINT      NOT NULL,
  day_of_week       TINYINT     NOT NULL,   -- 0=Dom, 1=Seg ... 6=Sab
  start_time        TIME        NOT NULL,
  end_time          TIME        NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY idx_pschedules_company_prof_day (company_id, professional_id, day_of_week),
  CONSTRAINT fk_pschedules_professional FOREIGN KEY (professional_id) REFERENCES users(id),
  CONSTRAINT fk_pschedules_company FOREIGN KEY (company_id) REFERENCES companies(id)  -- consistência (DL-032)
);
```

### 3.7 `appointments` (agendamentos)

```sql
CREATE TABLE appointments (
  id                    BIGINT          NOT NULL AUTO_INCREMENT,
  company_id            BIGINT          NOT NULL,
  client_id             BIGINT          NOT NULL,
  service_id            BIGINT          NOT NULL,
  professional_id       BIGINT          NULL,         -- nullable; MVP: bot não atribui
  scheduled_at          DATETIME        NOT NULL,
  duration_minutes      INT             NOT NULL,     -- snapshot do serviço
  price_snapshot        DECIMAL(10,2)   NULL,         -- snapshot do preço; NULL quando serviço sem preço (DL-030/DL-038 D1)
  status                ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show') NOT NULL,
  source                ENUM('whatsapp', 'manual', 'app') NOT NULL,
  created_by_user_id    BIGINT          NULL,         -- NULL quando criado pelo bot
  cancellation_reason   TEXT            NULL,
  cancelled_by          ENUM('client', 'professional', 'system') NULL,
  timeout_notified_at   DATETIME        NULL,         -- quando notificação 2h foi enviada
  is_deleted            BOOLEAN         NOT NULL DEFAULT FALSE,  -- soft delete; ver seção 3.11 LGPD
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apt_company_date           (company_id, scheduled_at),
  KEY idx_apt_company_status_date    (company_id, status, scheduled_at),
  KEY idx_apt_company_prof_date      (company_id, professional_id, scheduled_at),
  KEY idx_apt_company_client         (company_id, client_id),
  KEY idx_apt_company_source         (company_id, source),
  CONSTRAINT fk_apt_company      FOREIGN KEY (company_id)         REFERENCES companies(id),
  CONSTRAINT fk_apt_client       FOREIGN KEY (client_id)          REFERENCES clients(id),
  CONSTRAINT fk_apt_service      FOREIGN KEY (service_id)         REFERENCES salon_services(id),
  CONSTRAINT fk_apt_professional FOREIGN KEY (professional_id)    REFERENCES users(id),
  CONSTRAINT fk_apt_created_by   FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
```

**Estado inicial por origem:**
- `source = 'whatsapp'` → `status = 'pending'`
- `source = 'manual'`   → `status = 'confirmed'`
- `source = 'app'`      → reservado, não usado no MVP

> **`no_show` (não compareceu) — DL-023:** status válido, definido **apenas por marcação manual** no painel (`confirmed → no_show`), respeitando a matriz de permissões. No MVP é informativo: sem detecção automática de falta e sem notificação à cliente. Habilita relatório de faltas futuro (FR-D9).

### 3.8 `payments` (pagamentos manuais)

```sql
CREATE TABLE payments (
  id                    BIGINT          NOT NULL AUTO_INCREMENT,
  company_id            BIGINT          NOT NULL,
  appointment_id        BIGINT          NOT NULL,
  recorded_by_user_id   BIGINT          NOT NULL,
  amount                DECIMAL(10,2)   NOT NULL,
  method                ENUM('cash', 'pix', 'debit', 'credit', 'other') NOT NULL,
  notes                 TEXT            NULL,
  paid_at               TIMESTAMP       NOT NULL,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_company_appointment (company_id, appointment_id),
  KEY idx_payments_company_date        (company_id, paid_at),
  CONSTRAINT fk_payments_company     FOREIGN KEY (company_id)         REFERENCES companies(id),
  CONSTRAINT fk_payments_appointment FOREIGN KEY (appointment_id)     REFERENCES appointments(id),
  CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);
```

### 3.9 `whatsapp_conversations` (estado das conversas ativas do bot)

```sql
CREATE TABLE whatsapp_conversations (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  company_id        BIGINT        NOT NULL,
  phone_whatsapp    VARCHAR(20)   NOT NULL,   -- E.164
  state             VARCHAR(50)   NOT NULL,   -- ex: AWAITING_SERVICE, AWAITING_DATE, AWAITING_TIME, AWAITING_CONFIRM
  context_json      JSON          NULL,       -- { service_id, date, time, client_id }
  appointment_id    BIGINT        NULL,       -- preenchido quando appointment é criado
  last_message_at   TIMESTAMP     NOT NULL,
  expires_at        TIMESTAMP     NOT NULL,   -- TTL para limpeza de conversas abandonadas
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversation_tenant_phone (company_id, phone_whatsapp),
  KEY idx_conversations_expires (expires_at),
  CONSTRAINT fk_conversations_company     FOREIGN KEY (company_id)     REFERENCES companies(id),
  CONSTRAINT fk_conversations_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);
```

> **Cache de estado ativo em Redis:** o `ConversationStateService` espelha o estado da conversa em Redis (TTL 4h) para leituras rápidas durante o fluxo do bot. MySQL é a fonte de verdade — Redis é cache de estado ativo. A chave Redis é `conv:{company_id}:{phone_normalized}`.

### 3.10 LGPD — Soft Delete e Anonimização

**Fluxo normal (cancelamento, inativação):** `is_deleted = true` em `clients` e `appointments`. Registros permanecem no banco para auditoria operacional. Queries de domínio sempre filtram `WHERE is_deleted = false`.

**Direito de exclusão do titular (LGPD art. 18, VI):** soft delete sozinho não é suficiente — se o cliente solicitar exclusão dos próprios dados, o sistema deve efetivamente remover ou anonimizar o vínculo identificável.

**Mecanismo no MVP:** procedimento manual (Renato executa via script), mas a arquitetura viabiliza agora:

```sql
-- Anonimização de cliente (mantém appointments para integridade do histórico financeiro)
UPDATE clients SET
  name                      = 'ANONIMIZADO',
  phone_whatsapp            = NULL,
  phone_whatsapp_normalized = NULL,
  notes                     = NULL,
  is_deleted                = TRUE,
  updated_at                = NOW()
WHERE id = :clientId AND company_id = :companyId;

-- Remove conversas WhatsApp ativas
DELETE FROM whatsapp_conversations
WHERE company_id = :companyId AND phone_whatsapp = :phone;
```

**Por que manter appointments:** para integridade do relatório financeiro e auditoria operacional, o appointment permanece com `client_id` referenciando o registro anonimizado. O relatório exibirá "ANONIMIZADO" como nome — aceitável para fins contábeis.

**Feature futura:** endpoint de self-service de exclusão de dados no painel (MVP: processo manual documentado).

---

### 3.11 Diagrama de relacionamento (texto)

```
companies (1) ────── (N) users
companies (1) ────── (N) clients
companies (1) ────── (N) salon_services
companies (1) ────── (N) appointments
companies (1) ────── (N) payments
companies (1) ────── (N) whatsapp_conversations

users (professional) (N) ── (N) salon_services  [via professional_services]
users (professional) (1) ── (N) professional_schedules

appointments (N) ── (1) clients
appointments (N) ── (1) salon_services
appointments (N) ── (0..1) users [professional_id nullable]
appointments (N) ── (0..1) users [created_by_user_id nullable]
appointments (1) ── (N) payments
```

---

## 4. Módulos NestJS — Responsabilidades

### 4.1 `AuthModule`

**Responsabilidade:** autenticação e autorização.

- Login com email + senha → JWT (access 15 min + refresh 7 dias)
- **Resolução de tenant no login pelo e-mail (DL-052):** o painel tem **URL única, sem slug**. O `AuthService` descobre a empresa a partir do **e-mail** informado (a checagem de senha vem **depois** de resolver o tenant, pois o e-mail é único **por empresa** — `UNIQUE (company_id, email)`, DL-026, não global). **E-mail em >1 empresa → desambiguação:** o backend responde com as empresas daquele e-mail e o front pede a **escolha do estabelecimento**; o login então valida a senha no tenant escolhido e emite o JWT. *(Revoga o DL-050 — slug na rota `/app/{slug}/login`; o slug permanece só no link público `/agendar/{slug}`.)*
- `JwtStrategy`: valida token, extrai `{ userId, companyId, accessLevel, attendsClients }` (DL-022)
- `JwtAuthGuard`: aplica em todos os endpoints protegidos
- `RolesGuard`: valida `@Roles(...)` decorator por endpoint, comparando contra `access_level`
- Refresh token endpoint

**Faz um lookup de tenant SÓ no login** (resolver a empresa pelo e-mail, acima). O multi-tenant lookup **por request** (JWT → `company_id` → `AsyncLocalStorage`) continua no `TenantModule`.

---

### 4.2 `TenantModule`

**Responsabilidade:** multi-tenancy runtime.

- `TenantMiddleware`: extrai `company_id` do JWT → valida empresa ativa → injeta em `AsyncLocalStorage`
- `TenantAwareRepository<T>`: base class que todos os repositórios herdam; aplica `WHERE company_id = ?` automaticamente
- CRUD da company (configurações da instalação: nome, logo, cores, horário comercial, dias, provider WhatsApp)

---

### 4.3 `UsersModule`

**Responsabilidade:** gestão de usuários internos nos dois eixos de acesso (DL-022).

- CRUD de usuários filtrado por tenant, gerenciando `access_level` (owner/manager/basic) e `attends_clients` (sim/não) de forma independente
- Endpoint para o usuário listar e atualizar suas próprias informações, incluindo a preferência de `theme` (DL-021)
- Seed do primeiro `owner` na criação do tenant
- Lista de usuários com `attends_clients = true` (quem possui agenda própria) consumida por `SchedulesModule`/`AvailabilityService`

---

### 4.4 `ClientsModule`

**Responsabilidade:** gestão do cadastro de clientes finais.

- CRUD filtrado por tenant
- Busca por `phone_whatsapp_normalized` (E.164) — usado pelo bot para reconhecer clientes recorrentes
- Deduplicação: `findOrCreate` por número normalizado
- Histórico de agendamentos do cliente
- Profissional pode editar o nome cadastrado do cliente (FR-E3: nome vem do banco, não do perfil WhatsApp)

---

### 4.5 `ServicesModule`

**Responsabilidade:** catálogo de serviços do salão.

- CRUD de serviços (nome, duração, preço, ativo/inativo)
- Associação profissional ↔ serviço (`professional_services`)
- Listagem dos serviços disponíveis para o bot (somente `is_active = true`)

---

### 4.6 `SchedulesModule`

**Responsabilidade:** horários de trabalho e disponibilidade de slots.

- CRUD de `professional_schedules` por usuário que atende (`attends_clients = true`)
- **`AvailabilityService`** — lógica central:
  1. Recebe `{ companyId, serviceId, date }`
  2. Busca usuários com `attends_clients = true` que oferecem o serviço (`professional_services`)
  3. Para cada um, busca `professional_schedules` do dia da semana
  4. Gera slots de `duration_minutes` dentro do horário de trabalho
  5. Subtrai slots já ocupados (`appointments` não-cancelados sobrepostos)
  6. Retorna union de slots únicos disponíveis (se ≥1 usuário que atende estiver livre → slot disponível)
  7. Bot apresenta até 5 datas com slots (FR-A2)

---

### 4.7 `AppointmentsModule`

**Responsabilidade:** ciclo de vida dos agendamentos.

- Create com atomicidade (ver seção 7)
- State machine: `pending → confirmed | cancelled`, `confirmed → completed | cancelled | no_show`
- Eventos emitidos (EventEmitter2): `AppointmentCreatedEvent`, `AppointmentStatusChangedEvent`, `AppointmentCancelledEvent`
- BullMQ job scheduling: ao criar appointment `pending` via WhatsApp, agenda `appointment-timeout` com delay de 2h úteis
- Cancelamento: registra `cancellation_reason` e `cancelled_by`

**Permissões de operação (aplicadas em service layer, por `access_level` — DL-022):**
- `owner` / `manager`: qualquer appointment do tenant
- `basic`: apenas appointments com `professional_id = self` ou `professional_id IS NULL`

**Confirmação/recusa de pendentes (FR-B2, DL-051):** via `PATCH /appointments/:id/confirm` e `PATCH /appointments/:id/refuse`, chamados pelas **telas do painel — desktop ou celular**. O acesso mobile é o próprio painel responsivo/PWA (**DL-051** revoga a leitura-apenas de **DL-018**), então essas rotas ficam disponíveis também no celular. A confirmação/recusa **não** ocorre pelo WhatsApp do bot (premissa do canal, que **permanece**).

**Endpoint de polling (DL-019, ver ADR-011):** `GET /appointments/pending-count` — consultado pelo painel a cada 15–30s para atualizar o badge de pendentes. Leitura pura sobre o estado já persistido; não interfere na atomicidade da criação (seção 7).

---

### 4.8 `NotificationsModule`

**Responsabilidade:** orquestração de notificações WhatsApp.

- Consome eventos de `AppointmentsModule`
- Para cada evento, resolve: quem notificar? qual mensagem? tem WhatsApp?
- Chama `WhatsAppProvider.sendMessage` se WhatsApp disponível
- Regra: cliente sem `phone_whatsapp_normalized` → sem notificação (FR-D8, DL-010)
- Mensagens mapeadas por evento (referência ao ux-spec.md MSG-*; **o ux-spec.md é a fonte canônica das mensagens**):
  - `AppointmentCreatedEvent` (whatsapp): MSG-A06 (solicitação enviada, à cliente) + MSG-B01 (solo) / MSG-B02 (multi) — notificação ao salão, direcionando ao painel, desktop ou celular (premissa do canal mantida por DL-051; antes DL-018)
  - `AppointmentCreatedEvent` (manual): sem mensagem automática à cliente (entra *confirmed*; cliente sem WhatsApp não é notificada — FR-D8). Aviso interno ao profissional atribuído é opcional e não tem MSG canônica no MVP
  - `AppointmentStatusChangedEvent` (confirmed pelo painel): MSG-B04 à cliente
  - `AppointmentStatusChangedEvent` (refused pelo painel): MSG-B05 à cliente (motivo + alternativas)
  - `AppointmentStatusChangedEvent` (cancelled by pro/painel): MSG-C06 à cliente (se tiver WhatsApp)
  - `AppointmentCancelledEvent` (by client): MSG-C03 à cliente (confirmação) + MSG-C05 ao profissional/gestão
  - `appointment-timeout` (job, 2h úteis): MSG-B06 à cliente ("em análise")

---

### 4.9 `WhatsAppModule`

**Responsabilidade:** provider WhatsApp + orquestração do bot.

- `WhatsAppProvider` interface (ver seção 5.1)
- `EvolutionApiProvider` (MVP, ativo)
- `CloudApiMetaProvider` (futuro, não ativo no MVP — apenas a classe existe)
- **`BotOrchestrator`**: recebe `IncomingMessage` → consulta estado da conversa → decide próximo passo → chama `AvailabilityService` / `AppointmentsService` / `NotificationsService` conforme estado
- **`ConversationStateService`**: lê/escreve estado em Redis com fallback para MySQL
- `WhatsAppController`: endpoint de webhook para receber mensagens do provider

**Factory de provider:** `WhatsAppModule` lê `companies.whatsapp_provider` e instancia o provider correto por tenant. No MVP, todos os tenants usam `evolution_api`.

---

### 4.10 `PaymentsModule`

**Responsabilidade:** registro manual de pagamentos e preparação para gateway.

- CRUD de pagamentos manuais (method = dropdown, não texto livre — DL-012)
- `PaymentGateway` interface (ver seção 5.2) — apenas estrutura no MVP
- `NullPaymentGateway`: implementação de placeholder que lança `NotImplementedException`
- Relatório de pagamentos por período filtrado por tenant

---

### 4.11 `ReportsModule`

**Responsabilidade:** relatórios financeiros consolidados.

- Acesso restrito a `access_level = 'owner'`
- Faturamento por período, serviço mais demandado, taxa de confirmação por origem
- Queries agregadas com `GROUP BY` — sem ORM complexo, queries diretas via TypeORM QueryBuilder

---

### 4.12 `InstallationModule`

**Responsabilidade:** configurações visuais e operacionais da instalação.

- Nome do estabelecimento, logo, cores (o tema light/dark **não** é configuração da instalação — é preferência individual em `users.theme`, gerida pelo `UsersModule`; ver DL-021)
- Horário comercial e dias de funcionamento
- Configuração do provider WhatsApp ativo

---

## 5. Abstrações — Contratos de Interface

### 5.1 `WhatsAppProvider`

```typescript
// apps/api/src/modules/whatsapp/whatsapp-provider.interface.ts

export interface IncomingMessage {
  from: string;           // E.164
  body: string;
  messageId: string;
  timestamp: Date;
  companyId: number;      // resolvido pelo webhook a partir da instalação
}

export interface OutgoingMessage {
  to: string;             // E.164
  body: string;
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'unknown';
  details?: string;
}

export interface WhatsAppProvider {
  /**
   * Envia mensagem de texto para um número.
   * Lança WhatsAppDeliveryException em caso de falha permanente.
   */
  sendMessage(companyId: number, message: OutgoingMessage): Promise<void>;

  /**
   * Retorna status da conexão WhatsApp para a instalação.
   */
  getConnectionStatus(companyId: number): Promise<ConnectionStatus>;

  /**
   * Registra handler para mensagens recebidas.
   * Chamado uma vez na inicialização do módulo.
   * Implementações podem usar webhook push (Evolution API, Cloud API)
   * ou polling (não recomendado).
   */
  registerIncomingMessageHandler(
    handler: (message: IncomingMessage) => Promise<void>
  ): void;
}
```

**Implementações:**

| Classe | Status no MVP | Mecanismo |
|---|---|---|
| `EvolutionApiProvider` | Ativo | Webhook push; HTTP para Evolution API local |
| `CloudApiMetaProvider` | Plugável (não ativo) | Webhook push; HTTPS para graph.facebook.com |

**Seleção de provider:** `WhatsAppModule` usa factory function que lê `company.whatsapp_provider` e retorna o provider correto. No MVP, `evolution_api` para todos.

---

### 5.2 `PaymentGateway`

```typescript
// apps/api/src/modules/payments/gateways/payment-gateway.interface.ts

export interface CreateChargeParams {
  companyId: number;
  appointmentId: number;
  clientName: string;
  clientDocument?: string;   // CPF/CNPJ para PIX
  amount: number;
  dueDate: Date;
  description: string;
}

export interface ChargeResult {
  chargeId: string;
  paymentUrl?: string;       // link de pagamento para enviar ao cliente
  pixCode?: string;          // copia-e-cola PIX
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
}

export interface PaymentGateway {
  createCharge(params: CreateChargeParams): Promise<ChargeResult>;
  getChargeStatus(chargeId: string): Promise<ChargeResult['status']>;
  refund(chargeId: string, reason?: string): Promise<void>;
}
```

**Implementações:**

| Classe | Status no MVP |
|---|---|
| `NullPaymentGateway` | Ativo — todos os métodos lançam `NotImplementedException` |
| `AsaasGateway` | Futuro — Asaas suporta PIX, split, assinatura recorrente |

---

## 6. Estratégia de Multi-tenancy

### 6.1 Fluxo de isolamento por request

```
HTTP Request
  └─ JwtAuthGuard          → valida JWT, extrai { userId, companyId, accessLevel, attendsClients }
  └─ TenantMiddleware       → valida company ativa, injeta companyId em AsyncLocalStorage
  └─ Controller             → chama Service com parâmetros sem companyId explícito
  └─ Service                → chama Repository (TenantAwareRepository)
  └─ TenantAwareRepository  → lê companyId do AsyncLocalStorage, aplica WHERE automaticamente
  └─ MySQL Query            → sempre filtrada por company_id
```

### 6.2 `TenantAwareRepository<T>`

```typescript
// apps/api/src/common/repository/tenant-aware.repository.ts

export abstract class TenantAwareRepository<T> {
  constructor(
    protected readonly repo: Repository<T>,
    private readonly tenantContext: TenantContext,  // wraps AsyncLocalStorage
  ) {}

  protected get companyId(): number {
    const id = this.tenantContext.getCurrentCompanyId();
    if (!id) throw new Error('TenantContext not set — possible missing middleware');
    return id;
  }

  findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: { ...options?.where, company_id: this.companyId } as any,
    });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: { ...options?.where, company_id: this.companyId } as any,
    });
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save({ ...entity, company_id: this.companyId } as any);
  }

  // delete e update análogos
}
```

### 6.3 Índices compostos — política

Todo índice de lookup em tabelas de domínio começa com `company_id`:

```
(company_id, scheduled_at)              -- agenda principal
(company_id, status, scheduled_at)      -- pendentes / confirmados
(company_id, professional_id, date)     -- agenda por profissional
(company_id, source)                    -- filtros FR-K4
(company_id, phone_whatsapp_normalized) -- lookup de cliente por WhatsApp
```

Razão: MySQL usa o índice mais seletivo possível. Com dados de múltiplos tenants no mesmo schema, `company_id` como coluna líder garante que queries de um tenant não leiam páginas de outro.

### 6.4 Bot WhatsApp e identificação de tenant

O webhook do Evolution API recebe mensagens sem `company_id` explícito. O `WhatsAppController` resolve o tenant assim:

1. Evolution API envia `{ instance: "tamarcado-fernanda", from: "+5511...", body: "..." }`
2. Controller mapeia `instance` → `company_id` via tabela de configuração (campo `evolution_instance_name` em `companies`)
3. Injeta `company_id` no `IncomingMessage` antes de repassar ao `BotOrchestrator`

---

## 7. Atomicidade de Agendamentos

### 7.1 Problema

Dois clientes solicitam o mesmo slot simultaneamente → race condition → double-booking.

### 7.2 Solução: `SELECT ... FOR UPDATE` em transação explícita

```typescript
// apps/api/src/modules/appointments/appointments.service.ts

async createFromBot(params: CreateAppointmentParams): Promise<Appointment> {
  return this.dataSource.transaction(async (manager) => {
    // 1. Lock: busca appointments não-cancelados que sobrepõem o slot alvo.
    //    FOR UPDATE bloqueia as linhas — segunda requisição concorrente espera.
    const slotStart = params.scheduledAt;
    const slotEnd = new Date(slotStart.getTime() + params.durationMinutes * 60_000);

    const occupying = await manager
      .createQueryBuilder(Appointment, 'a')
      .setLock('pessimistic_write')
      .where('a.company_id = :companyId', { companyId: params.companyId })
      .andWhere('a.status NOT IN (:...cancelled)', { cancelled: ['cancelled'] })
      .andWhere('a.scheduled_at < :slotEnd', { slotEnd })
      .andWhere(
        'DATE_ADD(a.scheduled_at, INTERVAL a.duration_minutes MINUTE) > :slotStart',
        { slotStart }
      )
      .getMany();

    // 2. Verifica disponibilidade: ainda existe profissional livre?
    const available = await this.availabilityService.hasAvailableSlot({
      companyId: params.companyId,
      serviceId: params.serviceId,
      scheduledAt: params.scheduledAt,
      excludeAppointmentIds: occupying.map(a => a.id),
    });

    if (!available) {
      throw new SlotUnavailableException(
        'O horário selecionado não está mais disponível.'
      );
    }

    // 3. Cria o appointment dentro da mesma transação.
    const appointment = manager.create(Appointment, {
      ...params,
      status: 'pending',
      source: 'whatsapp',
    });
    const saved = await manager.save(appointment);

    // 4. Agenda job de timeout (fora da transação — BullMQ é externo).
    // Feito em evento pós-commit para não bloquear a transação.
    return saved;
  });
}
```

### 7.3 Cálculo do delay do timeout (2h em horário útil)

```typescript
// apps/api/src/modules/appointments/jobs/appointment-timeout.processor.ts

function calcTimeoutDelay(company: Company, from: Date): number {
  // Avança 2h contando apenas minutos dentro do horário comercial.
  // Usa company.timezone — nunca timezone global hardcoded.
  // Leva em conta business_hours_start, business_hours_end, business_days.
  // Retorna delay em ms para BullMQ.
}
```

O job BullMQ é agendado em evento `AppointmentCreatedEvent` — **após o commit da transação** — para evitar agendar jobs de agendamentos que falharam no commit.

### 7.4 O que acontece ao disparar o timeout

```typescript
@Process('appointment-timeout')
async handleTimeout(job: Job<{ appointmentId: number; companyId: number }>) {
  const apt = await this.appointmentsService.findOne(job.data);
  if (!apt || apt.status !== 'pending') return; // já foi confirmado ou cancelado

  // Notifica cliente: "seu agendamento está em análise"
  await this.notificationsService.notifyClientInAnalysis(apt);
  await this.appointmentsService.markTimeoutNotified(apt.id);
  // [ASSUMPTION] Status permanece 'pending' após timeout no MVP —
  // cancelamento automático é feature futura (addendum C.6)
}
```

---

## 8. Ambientes

### 8.1 Dev (local)

**Custo:** R$0

```yaml
# infra/compose/docker-compose.yml
services:
  api:
    build: ./infra/docker/api.Dockerfile
    ports: ["3000:3000"]
    volumes: ["./apps/api:/app/apps/api"]   # hot reload
    environment:
      - DATABASE_URL=mysql://root:root@mysql:3306/tamarcado_dev
      - REDIS_URL=redis://redis:6379
      - WHATSAPP_PROVIDER=evolution_api
      - EVOLUTION_API_URL=http://evolution-api:8080
      - JWT_SECRET=dev-secret-change-in-prod

  web:
    build: ./infra/docker/web.Dockerfile
    ports: ["5173:5173"]
    volumes: ["./apps/web:/app/apps/web"]

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: tamarcado_dev
    ports: ["3306:3306"]
    volumes: ["mysql_dev_data:/var/lib/mysql"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  evolution-api:
    image: atendai/evolution-api:latest
    ports: ["8080:8080"]

volumes:
  mysql_dev_data:
```

**Seeds:** `infra/scripts/seed-dev.sh` cria uma instalação de teste com profissional, serviços e clientes de exemplo.

---

### 8.2 Staging (local)

**Custo:** R$0

- Ambiente local, na máquina do desenvolvedor — não é um clone em nuvem de produção (ver ADR-010)
- `docker-compose.staging.yml` builda as imagens como em produção (sem hot-reload, sem volumes de dev) e roda localmente com variáveis de ambiente equivalentes às de produção (exceto secrets reais)
- Banco MySQL separado (`tamarcado_staging`) com dados sintéticos, recriado via seed antes de cada rodada de validação
- Evolution API apontando para instância de teste (número de WhatsApp dedicado a testes, nunca o número real de um cliente)
- Usado como smoke test manual do build de produção antes de cada push para `main` — valida que a imagem builda e roda corretamente fora do modo dev, sem custo de infraestrutura
- Não substitui o CI automatizado (`ci.yml`) — é a última validação manual antes do deploy

---

### 8.3 Produção

**Custo estimado:** R$45–96/mês total (meta NFR-O1 ≤ R$130/mês)

| Componente | Solução | Custo estimado |
|---|---|---|
| VPS | VPS brasileiro — Hostinger (preferencial, plano KVM 2 ou equivalente) ou HostGator VPS; datacenter São Paulo; ~2 vCPU / 8GB RAM, NVMe | R$40–86/mês |
| TLS | Certbot / Let's Encrypt | R$0 |
| Armazenamento logos/assets | Cloudflare R2 ou S3 | R$5–10/mês |
| Backup MySQL | cron → R2/S3 | incluso acima |
| **Total** | | **R$45–96/mês** |

> **Por que VPS brasileiro (ver ADR-009):** pagamento em real sem IOF nem variação cambial, suporte em português, e dados de clientes finais (nome, WhatsApp) residentes em datacenter no Brasil — reforça NFR-S2 ao evitar transferência internacional de dados pessoais.

**Layout no VPS:**

```
/opt/tamarcado/
├── api/                    # build do NestJS (dist/)
├── web/                    # build estático do React (dist/)
├── .env.production
└── ecosystem.config.js     # PM2

/etc/nginx/sites-enabled/
└── tamarcado.conf          # reverse proxy + serve web estático

/var/backups/tamarcado/
└── mysql/                  # dumps diários via cron
```

**PM2 processos:**
- `tamarcado-api` — NestJS (porta 3000)

**Nginx:** proxy reverso para `/api` → porta 3000; serve `web/dist` diretamente para `/`.

**TLS:** Certbot com auto-renovação.

**Backup MySQL:** cron diário às 03h → `mysqldump` → comprime → upload para R2.

**Teste de carga pré-go-live:** antes do primeiro cliente em produção, executar teste simples no VPS de produção medindo conversas WhatsApp simultâneas suportadas (CPU, RAM, Redis). Definir limite de alerta (ex: CPU > 70% sustentado por 5 min) para acionar upgrade de plano. Não é requisito de bloqueio para desenvolvimento — é checklist de go-live.

---

## 9. Pipeline CI/CD

### 9.1 `ci.yml` — Validação contínua

**Trigger:** push em qualquer branch + pull request para `main` e `staging`

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, staging]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r lint
      - run: pnpm -r typecheck
      - run: pnpm -r test

      - name: Build all packages
        run: pnpm -r build
```

### 9.2 `deploy.yml` — Deploy em Produção

**Trigger:** push para branch `main` (após CI verde)

```yaml
# .github/workflows/deploy.yml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []   # CI roda como check separado; deploy só ativa se CI passou
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_VPS_HOST }}
          username: deploy
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/tamarcado
            git pull origin main
            pnpm install --frozen-lockfile --prod
            pnpm -r build
            pm2 restart tamarcado-api
            # Copia web build para Nginx serve dir
            cp -r apps/web/dist/* /var/www/tamarcado/
```

### 9.3 Secrets necessários no GitHub

| Secret | Valor |
|---|---|
| `PROD_VPS_HOST` | IP do VPS |
| `PROD_SSH_KEY` | Chave privada SSH do usuário `deploy` |
| `PROD_DATABASE_URL` | Injetado via `.env.production` no VPS (não passa pelo Actions) |

---

## 10. ADRs — Architecture Decision Records

### ADR-001: Monolito Modular vs. Microsserviços

**Status:** Aceito

**Contexto:** Produto novo, domínio não explorado, dev solo, custo de infra limitado.

**Decisão:** Monolito modular NestJS com fronteiras de módulo claras.

**Consequências positivas:**
- Deploy simples (um processo)
- Sem latência inter-serviço
- Manutenção solo viável
- Módulos com interfaces claras permitem extração futura sem reescrita

**Consequências negativas:**
- Escalabilidade horizontal requer replicar toda a aplicação
- Falha de um módulo pode afetar os demais (mitigado por error boundaries no NestJS)

**Alternativa rejeitada:** Microsserviços — overhead operacional injustificável para o estágio atual.

---

### ADR-002: MySQL Shared Schema com `company_id` vs. Database por Tenant

**Status:** Aceito

**Contexto:** Custo de infra ≤ R$130/mês. Database por tenant exigiria connection pooling complexo e VPS maior.

**Decisão:** Schema único, isolamento por `company_id` em todas as tabelas de domínio.

**Mitigação de risco de vazamento entre tenants:**
1. `TenantMiddleware` obrigatório em todos os requests autenticados
2. `TenantAwareRepository` aplica `WHERE company_id = ?` automaticamente
3. Code review: qualquer query sem `company_id` é tratada como bug

**Consequências negativas:**
- Backup por tenant requer query filtrada (não dump completo)
- Se um tenant crescer muito, impacta outros (mitigado por índices compostos)

**Alternativa rejeitada:** Database por tenant — R$X/mês adicional por cliente, inviável no launch.

---

### ADR-003: Redis para Estado de Conversas WhatsApp

**Status:** Aceito

**Contexto:** O bot precisa manter estado de conversação entre mensagens (qual etapa do fluxo o cliente está). Leitura ocorre a cada mensagem recebida.

**Decisão:** Redis como cache ativo do estado da conversa; MySQL como fonte de verdade.

**Fluxo:**
1. Mensagem chega → `ConversationStateService` lê Redis
2. Se não encontrar → lê MySQL → popula Redis (TTL 4h)
3. Atualiza Redis e MySQL em cada transição de estado

**Consequências positivas:** leitura de estado em ~1ms vs. ~5-10ms no MySQL.

**Consequências negativas:** complexidade de sincronização (mitigada pela política de Redis como cache read-through, não fonte de verdade).

---

### ADR-004: BullMQ para Job de Timeout de 2h

**Status:** Aceito

**Contexto:** O timeout de 2h em horário útil precisa ser persistido e sobreviver a restarts do servidor.

**Decisão:** BullMQ (Redis-backed) para agendar `appointment-timeout` job com delay calculado.

**Por que não `setTimeout`:** não sobrevive a restart. `setTimeout` é volátil.

**Por que BullMQ e não cron:** o delay é calculado por agendamento (depende do horário do appointment e do horário comercial do tenant). Cron genérico exigiria varredura a cada minuto de todos os pendentes — menos eficiente.

---

### ADR-005: `SELECT FOR UPDATE` para Atomicidade de Slots

**Status:** Aceito

**Contexto:** Dois clientes podem solicitar o mesmo slot concorrentemente.

**Decisão:** Transação MySQL com `SELECT ... FOR UPDATE` nos appointments do slot alvo. O lock garante que apenas um dos requests cria o appointment; o outro recebe `SlotUnavailableException`.

**Trade-off:** pequena latência extra (~1-5ms) no path de criação via bot. Aceitável para garantir consistência.

**Alternativa considerada:** Optimistic locking com versão. Rejeitada porque exige retry no client (bot precisaria retomar o fluxo) — experiência pior para o usuário.

---

### ADR-006: Abstração `WhatsAppProvider` — Seleção por Tenant

**Status:** Aceito

**Contexto:** MVP usa Evolution API. Futuro: Cloud API Meta. Ambos devem ser substituíveis sem alterar `AppointmentsModule` ou `NotificationsModule`.

**Decisão:** Interface `WhatsAppProvider` com factory que instancia o provider correto via `companies.whatsapp_provider`. Ambas as implementações existem no codebase; apenas uma é ativa por instalação.

**Implicação:** `WhatsAppModule` carrega ambos os providers mas só ativa o configurado. Overhead mínimo.

---

### ADR-007: `PaymentGateway` com `NullPaymentGateway` no MVP

**Status:** Aceito

**Contexto:** Pagamento dentro do fluxo é feature futura. No MVP, registro é manual.

**Decisão:** Interface `PaymentGateway` definida agora. `NullPaymentGateway` implementa todos os métodos lançando `NotImplementedException`. Quando Asaas for integrado, `AsaasGateway` substitui sem alterar `PaymentsModule`.

**Benefício:** força o design correto da interface antes de ter pressão de deadline para "só fazer funcionar".

---

### ADR-008: Timezone por Tenant (campo) vs. Constante Global

**Status:** Aceito

**Contexto:** Toda lógica de horário comercial e timeout de 2h depende de timezone. MVP tem tenants em `America/Sao_Paulo` (Brasília), mas futuros tenants em Manaus (`America/Manaus`) ou Acre (`America/Rio_Branco`) exigiriam refwork se timezone fosse hardcoded.

**Decisão:** Campo `timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo'` na tabela `companies`. Toda lógica de horário (disponibilidade de slots, cálculo de 2h úteis, apresentação de datas no bot) lê `company.timezone` — sem nenhuma constante global de timezone no código.

**Implementação:**
- MySQL: `time_zone = 'UTC'` (banco em UTC, conversão na camada de aplicação)
- Node.js: biblioteca `luxon` ou `date-fns-tz` para todas as operações de data/hora com timezone
- `AvailabilityService` e `calcTimeoutDelay` recebem `company.timezone` como parâmetro explícito

**Consequência positiva:** adicionar tenant em outro fuso = zero refwork, só preencher o campo.

**Consequência negativa:** nenhuma relevante — custo de implementação é o mesmo.

---

### ADR-009: Hospedagem de Produção — VPS Brasileiro vs. Provedor Internacional

**Status:** Aceito (substitui decisão anterior — ver `.decision-log.md` DL-016)

**Contexto:** A versão anterior desta arquitetura especificava Hetzner CX22 (datacenter na Alemanha) como VPS de produção. Reavaliação identificou riscos e custos não considerados originalmente: IOF de 3,5% sobre pagamento internacional, exposição à variação cambial mês a mês, risco de recusa de cartão internacional por bandeiras/bancos brasileiros, suporte apenas em inglês, e dados de clientes finais (nome, número de WhatsApp) armazenados fora do Brasil.

**Decisão:** Hospedar produção em VPS brasileiro — **Hostinger (preferencial)**, plano KVM 2 ou equivalente (~2 vCPU / 8GB RAM, NVMe), com **HostGator VPS** como alternativa caso necessário. Datacenter em São Paulo. Acesso root com Docker, mesma stack de aplicação (PM2 + Nginx + Certbot) independente do provider escolhido.

**Consequências positivas:**
- Pagamento em real — sem IOF, sem spread de câmbio, sem variação cambial mês a mês
- Aceita cartão, boleto e PIX — sem risco de recusa de pagamento internacional
- Suporte em português
- Dados de clientes residentes em datacenter brasileiro — reforça NFR-S2 (LGPD) ao evitar transferência internacional de dados pessoais
- Latência menor para usuárias finais no Brasil (~1–5ms vs. ~200ms partindo da Europa)

**Consequências negativas:** ecossistema de tooling e documentação de terceiros para VPS brasileiro é menos maduro que Hetzner/DigitalOcean. Mitigado por: stack já documentada nesta arquitetura é independente de provider (Docker + scripts próprios em `infra/scripts/`), sem dependência de funcionalidades proprietárias do host.

**Alternativa rejeitada:** Hetzner CX22 (Alemanha) — decisão original deste documento, revertida por custo real em BRL (IOF + câmbio) e por simplificar a postura de compliance LGPD ao manter dados de clientes em território nacional.

---

### ADR-010: Staging Local vs. Staging em Nuvem (Clone de Produção)

**Status:** Aceito (ver `.decision-log.md` DL-017)

**Contexto:** A versão anterior desta arquitetura especificava Staging como clone em nuvem de produção (Railway Hobby ou VPS menor, R$30–50/mês), espelhando fielmente o ambiente de produção para validação pré-deploy. Essa descrição contradizia a decisão original de produto: dev solo, sem equipe distribuída, MVP com apenas produção na nuvem.

**Decisão:** No MVP, Staging roda localmente na máquina do desenvolvedor (custo R$0), usando build de produção via `docker-compose.staging.yml`. Não há ambiente de staging hospedado em nuvem nesta fase.

**Consequências positivas:**
- Custo zero — economiza R$30–50/mês ainda sem uso enquanto não há receita recorrente
- Validação pré-deploy (build de produção, variáveis de ambiente, migrations) é alcançável localmente, sem replicar infraestrutura
- Coerente com o perfil de dev solo, sem deploys concorrentes de equipe que justifiquem um ambiente compartilhado

**Consequências negativas:** staging local não captura diferenças do ambiente real de produção (rede, latência, configuração do host, diferenças de SO). Risco aceito no estágio atual — baixo volume de tenants e deploys controlados pelo próprio desenvolvedor mitigam o impacto.

**Evolução futura:** quando houver clientes pagantes e o risco de quebrar produção em um deploy ruim justificar o custo adicional, promover Staging para ambiente em nuvem (clone fiel de produção, conforme descrito na versão anterior desta seção).

**Alternativa rejeitada:** Staging em nuvem desde o MVP — custo e complexidade operacional não justificados nesta fase.

---

### ADR-011: Notificação de Pendentes no Painel — Polling vs. WebSocket (Tempo Real)

**Status:** Aceito (ver `.decision-log.md` DL-019)

**Contexto:** O painel web precisa avisar dono/funcionário/profissional quando um novo agendamento *aguardando confirmação* chega via bot. Push em tempo real (WebSocket/SSE) traria atualização instantânea, mas adiciona complexidade de infraestrutura (conexões persistentes, reconexão, scaling) não justificada no volume de tenants do MVP.

**Decisão:** O painel consulta `GET /appointments/pending-count` (e o detalhe da lista, quando a tela Pendentes está aberta) em polling de **15–30 segundos**, em segundo plano (`fetch`), sem nunca recarregar a página. A atualização afeta exclusivamente o badge de pendentes (UX-DR7) e dispara um toast momentâneo quando há item novo — nunca fecha modais abertos nem descarta texto em edição. MySQL é a fonte de verdade do pendente, gravado no momento em que a cliente confirma com o bot (`AppointmentsService.createFromBot`, seção 7); o polling apenas lê esse estado, sem risco de perda de dado. A atomicidade do slot (NFR-C1, `SELECT ... FOR UPDATE`) já está garantida na escrita, independente de quando o painel exibe a notificação.

**Consequências positivas:**
- Implementação simples (endpoint REST + `refetchInterval` no cliente), sem infraestrutura de conexão persistente
- Sem impacto na fonte de verdade — puramente uma camada de leitura/exibição
- Atraso de até 30s na percepção visual é aceitável para o caso de uso (agendamento de salão, não chat ao vivo)

**Consequências negativas:** não é "tempo real" — atraso de até 30s para o badge refletir um novo pendente. Aceito no MVP pelo baixo volume de tenants e pela natureza do negócio.

**Evolução futura:** substituir o polling por push em tempo real (WebSocket ou Server-Sent Events) quando o volume de instalações justificar o custo de infraestrutura adicional. Troca apenas do mecanismo de entrega — não exige reescrever a fonte de verdade nem o contrato de dados.

**Alternativa rejeitada:** WebSocket/SSE desde o MVP — complexidade operacional não justificada nesta fase.

---

## 11. Fluxo Completo: Bot WhatsApp (referência de implementação)

> Este fluxo mapeia os estados da `whatsapp_conversations` para o código. Referência cruzada com UX-spec.md MSG-A01 a MSG-A07. **Nota de numeração:** os rótulos MSG-A* abaixo seguem a ordem lógica do fluxo de código; o ux-spec.md usa numeração própria (greeting/serviço = A01/A02, dias = A03, horários = A05, **confirmação da cliente = A05b**, solicitação enviada = A06, slot tomado = A07). Em caso de divergência, o ux-spec.md é a fonte canônica das mensagens.

```
IDLE (sem conversa ativa)
  └─ keyword detectada (ex: "agendar", "marcar", "quero")
      → cria conversa, state = AWAITING_SERVICE
      → bot envia MSG-A01 (lista de serviços)

AWAITING_SERVICE
  └─ cliente responde com número do serviço
      → valida opção, salva service_id em context_json
      → state = AWAITING_DATE
      → bot chama AvailabilityService.getNextAvailableDates(serviceId, 5)
      → bot envia MSG-A02 (lista de datas disponíveis)

AWAITING_DATE
  └─ cliente responde com número da data
      → valida opção, salva date em context_json
      → state = AWAITING_TIME
      → bot chama AvailabilityService.getSlotsForDate(serviceId, date)
      → bot envia MSG-A03 (lista de horários)

AWAITING_TIME
  └─ cliente responde com número do horário
      → valida opção, salva time em context_json
      → state = AWAITING_CONFIRMATION
      → bot envia resumo + pede confirmação "1 sim / 2 não" (ux-spec MSG-A05b)

AWAITING_CONFIRMATION
  └─ cliente confirma com "1"
      → findOrCreate client by phone_whatsapp_normalized
      → AppointmentsService.createFromBot() [transação com FOR UPDATE]
          ├─ sucesso → appointment salvo (status=pending)
          │   → NotificationsService notifica profissional (ux-spec MSG-B01/B02 — direciona ao painel, sem 1/2 por WhatsApp)
          │   → BullMQ agenda appointment-timeout (2h úteis)
          │   → bot envia "solicitação enviada ao salão" (ux-spec MSG-A06)
          │   → state = IDLE (conversa encerrada)
          └─ SlotUnavailableException
              → bot envia "horário indisponível, oferece nova escolha" (ux-spec MSG-A07)
              → state = AWAITING_DATE
  └─ cliente responde "2" → volta para AWAITING_TIME/AWAITING_DATE (escolher outro horário)

  └─ cliente não confirma / cancela no fluxo
      → bot envia confirmação de cancelamento do fluxo
      → state = IDLE

  └─ cliente digita intenção de cancelar agendamento existente
      → bot reconhece keyword de cancelamento
      → busca appointment ativo do cliente
      → confirma cancelamento
      → AppointmentsService.cancel(by='client')
      → bot confirma à cliente (MSG-C03) + NotificationsService notifica profissional/gestão (MSG-C05)
      → state = IDLE
```

---

## 12. Decisões Arquiteturais Confirmadas (AQ → resolvidas)

| ID | Decisão | Impacto no código |
|---|---|---|
| AQ-1 | Timezone por tenant: campo `timezone` em `companies` (default `America/Sao_Paulo`). Banco em UTC; conversão na camada de aplicação via `luxon`/`date-fns-tz`. Zero constante global de timezone. | `AvailabilityService`, `calcTimeoutDelay`, todas as queries de data |
| AQ-2 | Uma Evolution API instance por tenant via `evolution_instance_name` em `companies`. Instance compartilhada descartada (quebra isolamento). Consequência operacional: provisionar nova instance no setup de cada cliente. | `EvolutionApiProvider`, webhook routing, `WhatsAppController` |
| AQ-3 | Soft delete (`is_deleted`) para fluxo normal. Mecanismo de anonimização/hard delete para solicitações LGPD: MVP = procedimento manual via script SQL (seção 3.10). Arquitetura viabiliza o procedimento sem refwork. | `clients`, `appointments`, todas as queries filtram `is_deleted = false` |
| AQ-4 | Não assumido — é medição. Teste de carga simples no VPS de produção (Hostinger/HostGator brasileiro, ver ADR-009) antes do go-live; definir limite de alerta para escalar plano. Não bloqueia desenvolvimento. | Checklist pré-go-live (seção 8.3) |

---

*Documento gerado por Winston (System Architect) — Tamarcado — 2026-06-15*
