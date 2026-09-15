# Story 6.15: Marcador de recurso bloqueado (coroa) — componente reutilizável

Status: **implementada** — PR aberto para `dev` (Amelia, 2026-09-08). DL-075, sobre a base de
capabilities da Story 6.11 (DL-072).

> **Deixou de ser cosmética.** O screenshot da 6.11 mostrou que, com a tela bloqueada, o dono via
> *"Tivemos um problema no servidor. Tente de novo em instantes"* e um botão que nunca ia funcionar.
> Bloqueio comercial com cara de defeito. Esta story fecha isso — nos **dois** caminhos.

## Story

As a dono no plano básico,
I want entender o que eu ganharia liberando o recurso e falar com alguém sobre isso,
so that eu decida contratar em vez de topar com uma porta fechada sem explicação.

---

## ⭐ Ponto A — Sempre existem DOIS caminhos até o bloqueio

| | caminho **desenhado** | caminho **cru** |
|---|---|---|
| Como se chega | o usuário vê a coroa e clica | link antigo, favorito, endereço digitado, alguém mandou o link |
| O que existe na tela | a coroa | **nada** — só o 403 |
| Quem trata | `<CoroaPro>` / `<ComCoroa>` | `<RequireCapability>` / `<RequireModule>` + `ErrorState` |

O caminho cru **não é exceção rara**: é o que acontece quando o produto tem usuários de verdade. Se
ele não for tratado, a coroa não resolve nada — e é nele que se decide se o produto **explica** ou
**parece quebrado**.

**O caminho cru já estava quebrado para permissão, antes desta story.** O `RequireModule`
(`App.tsx:56`) respondia com `<Navigate to="/" replace />`: quem colava `/financeiro` sem acesso era
**jogado na Agenda em silêncio**, sem uma palavra. Mesma família de defeito do 403 virando "erro de
servidor", com outra roupa. Agora a rota explica quem libera.

**O menu continua escondendo** o módulo de quem não o tem — o DL-062 segue intacto. Esconder onde a
pessoa **navega** é diferente de emudecer onde ela **já chegou**.

---

## ⭐ Ponto B — Os TRÊS 403 (a spec pedia dois)

Depois da 6.11 o sistema tem três motivos distintos de 403. A spec desta story citava dois; o
terceiro entrou junto porque, sem a marca, ele seguiria caindo no "erro de servidor" genérico — o
mesmo defeito, entrando por outra porta.

| motivo | quem barrou | o que o usuário pode fazer | tela |
|---|---|---|---|
| `capability` | a EMPRESA não contratou (DL-072) | **contratar** | coroa + modal + WhatsApp |
| `module` | a PESSOA não tem o módulo (DL-062) | falar com o dono | cadeado, **sem oferta** |
| `role` | o PAPEL não permite (FR-I2) | falar com o dono | cadeado, **sem oferta** |

**Por que isso importa e não é detalhe técnico:** tratar os três igual faria a profissional **sem
permissão** receber oferta de plano que ela **não tem como comprar** — e ela vai cobrar o dono por
isso. Por outro lado, `module` e `role` são motivos diferentes no backend mas a **mesma coisa** para
quem está na tela (quem libera é o dono), então a UI os funde de propósito.

**O motivo viaja no CORPO da resposta** (`common/errors/forbidden-reason.ts`), num campo `reason`. O
front lê o **campo**, nunca o texto da mensagem nem a rota: texto muda no primeiro ajuste de copy e
rota não diz nada sobre o porquê.

**Guard-rail** (padrão DL-027/DL-053): a suíte falha se um guard lançar `ForbiddenException` cru.
Um 403 sem motivo é um bloqueio que volta a parecer defeito.

---

## ⭐ Ponto C — Por que o `authedRequest` LANÇA em vez de devolver

O padrão das telas é `if (!res.ok) setErrorKind("server")` — **hardcoded, sem olhar o status**
(`Financeiro.tsx:129` é o caso exemplar). Devolver a resposta 403 manteria o bug em toda tela que
faz isso, e corrigir página por página seria justamente a "lista de exceções por tela" que o DL-075
proíbe.

Então o `authedRequest` **lança** `ApiForbiddenError` quando o 403 vem marcado. O `throw` desvia do
caminho `!res.ok` e cai no `catch` que as telas **já têm**; o `errorKindFrom` classifica e o
`ErrorState` despacha para o componente certo.

```
403 marcado → authedRequest lança → catch da tela → errorKindFrom → ErrorState
                                                                      ├─ capability → <BloqueioPro>      (vende)
                                                                      └─ permission → <BloqueioPermissao> (explica)
```

**Toda tela que já usa `<ErrorState>` ganhou o comportamento sem ser editada.** 403 **sem** marca
(proxy, versão antiga da API) continua voltando como resposta — nada muda para quem não conhece o
campo.

**Sem "Tentar de novo" em bloqueio.** Repetir não contrata plano nem muda permissão; o botão era uma
promessa falsa.

---

## ⭐ Ponto D — A coroa é componente de PLATAFORMA

`components/PlanoPro.tsx` é o tratamento **único** de "isto existe e a sua empresa não tem",
alimentado pela capability. Financeiro, Dashboard e limite de equipe herdam o **mesmo** componente
quando virarem pagos: recurso novo é **entrada no mapa** de `lib/plano-pro.ts` — não componente
novo, não `if` numa tela.

Se nascesse dentro da tela de WhatsApp, o próximo recurso pago ganharia uma cópia levemente
diferente — foi o que já aconteceu com o `.social` no CSS do projeto.

| peça | papel |
|---|---|
| `<CoroaPro>` | o marcador clicável; `stopPropagation` porque vive dentro de links de menu |
| `<ComCoroa>` | envolve um item, acrescentando a coroa **só** quando bloqueado |
| `<ModalPro>` | o que o Pró desbloqueia + botão do WhatsApp |
| `<BloqueioPro>` | tela cheia do caminho cru (vende) |
| `<BloqueioPermissao>` | tela cheia de permissão (**não** vende) |

**Recurso liberado → nenhum vestígio:** nem coroa, nem espaço reservado, nem tooltip (AC final).
`<ComCoroa bloqueado={false}>` devolve o filho sem wrapper.

---

## ⭐ Ponto E — O conteúdo comercial, e o que ele não pode ter

**Sem preço.** A landing vende plano único hoje, e Básico/Pró não têm escopo nem valor definidos.
Número aqui prenderia a decisão antes do primeiro cliente pagante e obrigaria a mexer no sistema (e
nos Termos) a cada ajuste comercial. Há teste varrendo os textos por `R$`, valores e "mensalidade".

**Número: (11) 99832-5320** — o comercial da landing. **Nunca** o 94245-8672, que é a WABA de
desenvolvimento e estará ocupada com o bot: mandar cliente interessado para lá é mandar cliente para
o robô. Há teste afirmando os dois lados.

**A mensagem identifica o estabelecimento** — sem isso o Renato recebe *"quero dar update"* de um
número desconhecido. O nome vem do `/installation` e vai **codificado na URL** (testado com acento e
`&`, que apareceriam em "Corte & Cor"; sem codificar, o `&` cortaria a frase no meio).

**Linguagem de dona de salão:** *"Funciona de madrugada e no domingo: você não perde a cliente que
resolveu marcar fora do horário"* — não "webhook", não "API".

---

## Arquivos

**Backend**

| Arquivo | Papel |
|---|---|
| `src/common/errors/forbidden-reason.ts` | as três exceções marcadas + o tipo do corpo |
| `src/common/errors/forbidden-reason.spec.ts` | os três motivos distintos + guard-rail dos guards |
| `src/modules/auth/guards/{capability,module,roles}.guard.ts` | passam a lançar a exceção marcada |

**Frontend**

| Arquivo | Papel |
|---|---|
| `lib/api.ts` | `ApiForbiddenError` + `forbiddenErrorFrom` (lê o `reason`, nunca o texto) |
| `lib/session.ts` | `authedRequest` propaga o 403 marcado |
| `lib/plano-pro.ts` | número, texto do WhatsApp e o que cada recurso desbloqueia |
| `components/PlanoPro.tsx` | coroa, modal e as duas telas de bloqueio |
| `components/RotaBloqueada.tsx` | `RequireModule` (agora explica) e `RequireCapability` |
| `components/ErrorState.tsx` | `ErrorKind` ganha `capability`/`permission` e despacha |

`RequireCapability` **ainda não tem consumidor em produção** — a primeira tela gateada por
capability é a **6.17**. Nasce aqui, exportado e testado, porque é o mesmo mecanismo da coroa:
separá-los garantiria que os dois caminhos divergissem.

## Testes

| Arquivo | Cobre |
|---|---|
| `forbidden-reason.spec.ts` | os três motivos, sem vazamento de `capability` no de módulo, sem preço, guard-rail |
| `test/forbidden-reason.e2e-spec.ts` | os três chegam distintos ponta a ponta; rota que exige plano E módulo devolve o motivo comercial |
| `lib/plano-pro.test.ts` | número comercial, nome codificado, acento e `&`, ausência de preço |
| `components/PlanoPro.test.tsx` | coroa acessível, modal, link em nova aba, clique que não navega, nenhum vestígio quando liberado |
| `components/RotaBloqueada.test.tsx` | os dois caminhos crus — e que **não parecem iguais** |
| `components/ErrorState.test.tsx` | classificação pelos três `reason`, ausência de "Tentar de novo" |

## Achado do screenshot

O print da tela de permissão mostrou **"Você não tem acesso a o Financeiro"**. A frase interpolava o
rótulo do módulo, e em português a preposição concorda com o gênero ("ao Financeiro", "à Equipe") —
o que não se monta a partir de um rótulo genérico sem carregar o gênero de cada módulo. Corrigido
para uma frase neutra; o nome da área já está no cabeçalho da tela, então nada se perde.

É o segundo defeito seguido que só o screenshot pegou.

## Fora de escopo

O endpoint de ativação é a **6.16**; a tela de WhatsApp e as preferências do dono são a **6.17**. As
4 falhas e2e pré-existentes do commit `99d1e66` continuam sem correção aqui — fix fora de escopo,
numeração própria (DL-028), branch separada.
