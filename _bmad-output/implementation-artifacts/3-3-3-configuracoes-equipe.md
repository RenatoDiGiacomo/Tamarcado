# Story 3.3.3: Configurações → Equipe (gestão de equipe e permissões)

Status: **aprovada — em implementação** (Renato aprovou em 2026-07-19; D2 ajustado: confirmação no ativar/desativar)

> **Painel de Configurações — a última aba (DL-039).** Preenche a aba **Equipe** que hoje está
> "em breve". Backend pronto desde a **Story 1.4** (`UsersController`: listar, convidar, editar
> papel/atende/ativo; `RolesGuard`; `ActiveUserGuard` com revogação imediata; bloqueio do último
> Dono). **Frontend** — mesma situação da 3.3.2. Segue o padrão das abas de Configurações.
>
> **Inclui a página de aceite de convite** (`/aceitar-convite`): o `POST /users/invite` gera um link
> `…/aceitar-convite?token=…` para o qual **não existe tela** — sem ela o convite é um beco sem
> saída e o profissional convidado nunca vira usuário real. É a peça que fecha o fluxo da 1.4
> (UX-DR14: "cria a própria senha no primeiro acesso").

## Story

As a dono do salão,
I want gerenciar minha equipe — ver, convidar, editar papel/atende e ativar/desativar —,
so that as pessoas usem o sistema com as permissões certas e novos profissionais entrem na agenda.

## Acceptance Criteria

1. **(AC1 — Aba habilitada)** A aba **Equipe** deixa de ser "em breve": vira `NavLink` ativa
   (`/configuracoes/equipe`) na `ConfiguracoesTabs`. Owner-only (ver D6).

2. **(AC2 — Listar equipe, FR-I1)** Lista os membros (`GET /users`) com **nome, e-mail, papel**
   (Dono/Gerente/Básico) e **se atende clientes**. O status **ativo/inativo** é visível.

3. **(AC3 — Convidar, FR-G4/UX-DR14)** Um formulário **"+ Convidar membro"** (nome, e-mail, papel
   `Gerente`/`Básico`, atende sim/não) chama `POST /users/invite` e mostra o **link de aceite**
   gerado, com botão **Copiar**. (Não se convida Dono — DTO.)

4. **(AC4 — Aceite de convite, UX-DR14)** A rota pública **`/aceitar-convite?token=…`** apresenta
   uma tela para a pessoa **criar a própria senha** (mín. 8); `POST /auth/accept-invite` → entra
   logada (tokens salvos) e vai para o painel. Token inválido/expirado → mensagem clara.

5. **(AC5 — Editar membro, FR-G5/FR-I1)** Por membro, editar **papel** (Gerente/Básico) e **atende
   clientes** via `PATCH /users/:id` com **auto-save** (feedback; erro mostra a mensagem real).
   **Ativar/desativar exige CONFIRMAÇÃO** antes de aplicar (D2 ajustado): **desativar dispara
   revogação imediata** e derruba a pessoa da sessão — um clique acidental tiraria a profissional
   do sistema no meio do expediente. Confirmação explícita nesse controle; auto-save nos outros.

6. **(AC6 — Último Dono, FR-I3)** A UI **não deixa** rebaixar/desativar o **único Dono** — mostra o
   **motivo** ("Transfira a titularidade antes"), não só bloqueia. Se ainda assim a API recusar
   (409), a mensagem real aparece.

7. **(AC7 — Reflete na agenda)** Um membro novo com **atende clientes** aparece no **seletor da aba
   Horários** e no **campo Profissional do modal** de novo agendamento (validação end-to-end — §Verificação).

## Pré-requisitos e contexto (API da 1.4 — sem mudança)

- `GET /api/users` → `{ total, users: [{ id, name, email, accessLevel, attendsClients, isActive }] }`.
- `POST /api/users/invite` (owner) — `{ name, email, access_level: "manager"|"basic", attends_clients }` → `{ link, expiresAt }`. Link: `…/aceitar-convite?token=…`.
- `PATCH /api/users/:id` (owner) — `{ access_level?: "manager"|"basic", attends_clients?, is_active? }` → perfil atualizado. **Bloqueio do último Dono:** `409 ConflictException` "Não é possível rebaixar ou desativar o único Dono. Transfira a titularidade antes." (não é possível promover a `owner` — DTO).
- `POST /api/auth/accept-invite` (público, pré-tenant) — `{ token, password }` → tokens de sessão.
- **`ActiveUserGuard`** já revoga o acesso de um usuário desativado na hora (nada extra no front).

## Frontend

- **Aba Equipe** (`ConfiguracoesEquipe`, rota `/configuracoes/equipe`): lista + edição inline
  (papel/atende/ativo) + "+ Convidar" (form → link). Reusa DS (`Card`, `Button`, `Input`, `Label`,
  toggle/segmented) e o padrão de mensagem de erro real (3.3.1).
- **Página de aceite** (`AceitarConvite`, rota pública `/aceitar-convite`): lê `?token`, form de
  senha (mín. 8) + confirmação, `POST /auth/accept-invite`, salva tokens e entra no painel.
- **`ConfiguracoesTabs`:** habilitar a aba Equipe (remover "em breve").

## Verificação (obrigatória antes de fechar)

Cadastrar um profissional **real pela tela** (convidar com **atende=sim** → aceitar o convite
criando a senha) e confirmar que ele aparece **(1)** na lista da Equipe, **(2)** no seletor da aba
**Horários** e **(3)** no campo **Profissional** do modal de agendamento. **Screenshot dos três.**

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** mexer no backend da 1.4 (users/auth) nem no modelo de dois eixos.
- **NÃO** implementar **transferência de titularidade** (promover a Dono) — fora da 1.4 (DL-029).
- **NÃO** construir gestão de sessões/tokens além do aceite; nem reenvio/revogação de convite (só o essencial).

## Tasks / Subtasks

- [ ] `ConfiguracoesTabs`: habilitar a aba **Equipe** (`to: "/configuracoes/equipe"`).
- [ ] `App.tsx`: rota `/configuracoes/equipe` → `ConfiguracoesEquipe`; rota **pública**
      `/aceitar-convite` → `AceitarConvite`.
- [ ] `ConfiguracoesEquipe`: lista (`GET /users`) com papel/atende/ativo; edição inline de **papel**
      e **atende** (auto-save, `PATCH`); **ativar/desativar com confirmação** (D2); Dono read-only;
      último Dono com motivo (D4); erro com a mensagem real da API.
- [ ] Convite: form (nome, e-mail, papel Gerente/Básico, atende) → `POST /users/invite` → mostra o
      **link** + **Copiar**.
- [ ] `AceitarConvite` (pública): lê `?token`, form de senha (mín. 8) + confirmação →
      `POST /auth/accept-invite` → aplica a sessão e entra no painel; token inválido → mensagem.
- [ ] `AuthContext`: método para **aplicar a sessão** a partir de tokens (usado no aceite).
- [ ] Testes (Vitest): lista + papel/atende auto-save; **confirmação no desativar**; último Dono
      (motivo + 409); convite (link); aceite (senha → tokens → entra); token ausente.

## Decisões — **aprovadas por Renato (2026-07-19)** ✅

| # | Decisão | Resolução |
|---|---|---|
| **D1** | Layout da Equipe | ✅ Lista de membros com controles inline. |
| **D2** | Salvar edição | ✅ **Auto-save** em **papel** e **atende**. **Ativar/desativar exige CONFIRMAÇÃO** (desativar dispara revogação imediata e derruba a sessão — clique acidental é grave). |
| **D3** | Papel do Dono read-only (backend só `manager`/`basic`) | ✅ |
| **D4** | Último Dono: desabilitar na UI com o motivo visível + surfacear o 409 real | ✅ |
| **D5** | Construir `/aceitar-convite` junto (senão o convite é beco sem saída) | ✅ incluído na story |
| **D6** | Acesso à aba | ✅ **Owner-only** (a 1.4 restringiu invite/edit a `owner`; sem mudança de backend). Abrir p/ Gerente fica p/ quando um cliente pedir. |

## References

- [Source: epics.md#UX-DR13/DR14] — Configurações subseção Equipe (convite por link, troca de papel); aceite cria a senha no 1º acesso.
- [Source: prd.md#FR-G4/G5, FR-I1–I3] — gerenciar equipe, papéis, dois eixos, único Dono.
- [Source: .decision-log.md#DL-039] — Equipe = Story 3.3.3, fecha o Painel de Configurações; [#DL-029] — transferência de titularidade manual (fora da 1.4).
- Story 1.4 (`1-4-gestao-de-equipe-e-permissoes.md`) — API de equipe/convite; Story 2.1.03 / 3.3.2 — padrão das abas.

## Dev Agent Record

*(a preencher na implementação, após aprovação das decisões)*
