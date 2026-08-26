# Redesenho da página pública de agendamento — `/agendar/{slug}`

**Status:** ✅ **aprovada** (2026-08-26), com as três decisões fechadas no fim do
documento e o ajuste do endereço já aplicado no protótipo.
**Protótipo navegável:** publicado como artifact (link no PR).
**Referência olhada:** `agendin.com.br` — entrega uma página que parece catálogo;
a nossa hoje parece um formulário.

## O problema

A página funciona: a cliente escolhe, envia, e o pedido cai no painel. Mas ela
**não vende**. É uma lista de campos, sem foto, sem descrição, sem dizer onde o
lugar fica nem onde ver o trabalho de quem vai atender. A cliente que chega pelo
Instagram, no celular, decide em segundos — e a página não dá nada para decidir.

## O que NÃO muda

- **Texto neutro (DL-048).** Serve qualquer prestador com agenda: nada de
  "salão", "cliente" no feminino fixo, ou vocabulário de beleza na interface.
- **Sem login e sem cadastro** para agendar.
- **O agendamento entra pendente**; o estabelecimento confirma (5B.3).
- **Consentimento LGPD** antes do envio.
- **Design system existente** — os mesmos tokens do painel.

## Estrutura da tela (mobile-first)

```
┌─────────────────────────────┐
│ logo · nome                 │  capa: identidade, onde fica e prova
│ endereço · Como chegar      │  ← uma vez só, e ANTES de escolher
│ [Instagram] [WhatsApp]      │
├─────────────────────────────┤
│ 1 Escolha o serviço         │  card com FOTO, nome, DESCRIÇÃO, duração, preço
│ 2 Com quem você quer ser…   │  cards com rosto — o nosso diferencial
│ 3 Escolha o dia             │  faixa de dias, não seletor de calendário
│ 4 Escolha o horário         │  agrupado em manhã / tarde / noite
│ 5 Seus dados                │  resumo do que foi escolhido + nome + WhatsApp
├─────────────────────────────┤
│ assinatura discreta         │  o endereço NÃO se repete aqui
└─────────────────────────────┘
```

A **numeração das etapas é informação**, não enfeite: a ordem importa, porque a
profissional escolhida filtra os horários (corrigido em
`fix/agendamento-publico-ordem-do-fluxo`).

## Item a item

### 1. Imagem no serviço

Card em duas colunas: **foto quadrada de 88px** à esquerda, texto à direita. No
computador a mesma proporção — a página continua sendo uma coluna estreita,
porque o uso real é no celular.

**Sem foto cadastrada o card não pode parecer quebrado:** vira um bloco neutro
com a inicial do serviço. Foto é opcional e vai continuar vazia em muita conta.

### 2. Descrição do serviço

Texto curto sob o nome, **cortado em duas linhas** (`line-clamp`). É apoio à
decisão ("inclui lavagem", "pode passar de 2h em cabelo longo"), não texto
corrido. Sugestão de limite: **280 caracteres**.

### 3. Endereço e como chegar

**Só na capa, uma vez:** o endereço e o **"Como chegar"** juntos, logo abaixo do
nome. Quem vai pela primeira vez procura isso **antes** de escolher o serviço —
repetir no rodapé só empurrava a decisão para o fim da página. O rodapé fica com
uma assinatura discreta.

Sem geocoding e sem mapa embutido: o link abre o app de mapas do aparelho, que é
o que a pessoa vai usar de qualquer forma. Guardamos a **URL do mapa** que o
estabelecimento colar, ou montamos a busca a partir do endereço.

### 4. Redes do estabelecimento

**Instagram** e **WhatsApp** na capa, como botões. É onde a cliente confere o
trabalho antes de marcar — e o WhatsApp resolve a dúvida que a página não
responde. Ambos opcionais: sem cadastro, o botão não aparece.

### 5. Seleção de profissional — o diferencial

Hoje é um `<select>` chamado "Profissional (opcional)", **depois** do horário.
Passa a ser a **etapa 2**, em cards com rosto, roláveis na horizontal:

- **"Sem preferência" continua sendo o padrão** e é o primeiro card.
- Cada profissional aparece com **foto** (ou iniciais, quando não houver) e o
  primeiro nome.
- A dica embaixo explica o que acontece ao deixar sem preferência.

O concorrente não deixa escolher. Num lugar com várias profissionais, a cliente
quer **a Ana** — e essa é a diferença que precisa estar visível na primeira tela,
não escondida num campo opcional.

---

## O que isso exige de backend

### A. Campos novos — migration aditiva, custo baixo

| Tabela | Campo | Tipo | Para quê |
|---|---|---|---|
| `salon_services` | `description` | `varchar(280) NULL` | descrição curta |
| `salon_services` | `image_url` | `varchar(500) NULL` | foto do serviço — **leva 2** |
| `companies` | `address` | `varchar(200) NULL` | endereço |
| `companies` | `maps_url` | `varchar(500) NULL` | link do mapa |
| `companies` | `instagram_url` | `varchar(200) NULL` | perfil |
| `companies` | `whatsapp_phone` | `varchar(20) NULL` | contato |
| `users` | `avatar_url` | `varchar(500) NULL` | foto da profissional — **leva 2** |

Além da migration: expor nos endpoints públicos
(`/public/{slug}/installation`, `/services`, `/professionals`) e acrescentar os
campos aos formulários de **Configurações → Identidade / Serviços** e ao cadastro
de **Equipe**.

**Nada disso muda regra de negócio** — são campos de exibição. Estimativa: **1 a
2 dias**, incluindo testes e os formulários.

### B. Upload de imagem — o item caro, e o que decide o cronograma

Hoje **não existe upload nenhum**: o logo é uma **URL colada**. Três caminhos:

| Caminho | Esforço | O problema |
|---|---|---|
| **URL colada** (como o logo) | ~0 | A dona não sabe hospedar imagem. Na prática o campo fica vazio e o redesenho não acontece. |
| **Upload no próprio VPS** | ~2–3 dias | Endpoint multipart, validação de tipo e tamanho, redimensionamento (dependência nova: `sharp`), disco, backup e limpeza de órfãos. |
| **Storage externo (R2/S3)** | ~2 dias | Some o problema de disco e backup, mas entra um fornecedor e uma credencial nova. |

**Recomendação: upload no VPS**, com um cuidado que já nos mordeu: os arquivos
**não podem ficar em `/var/www/tamarcado`** — o deploy roda `rsync --delete` ali
e apagaria tudo a cada release. Guardar em `/var/lib/tamarcado/uploads/{company}/`
e servir por `location /uploads/` no Nginx, com o diretório incluído no backup.

> **Sugestão de sequência:** não deixar o resto esperando o upload.

### C. Sem backend nenhum — só front

- faixa de dias no lugar do `<input type="date">`;
- horários agrupados em manhã / tarde / noite;
- profissional em cards (os dados já existem — só falta a foto);
- resumo do que foi escolhido antes do envio;
- a ordem do fluxo (**já corrigida**).

## Sequência sugerida

**Leva 1 — sem upload (entrega a maior parte do impacto):** campos de texto
(descrição, endereço, mapa, redes), profissional em cards com iniciais, faixa de
dias, agrupamento por período, resumo. Migration pequena + formulários + front.

**Leva 2 — imagens:** upload, foto no serviço e avatar da profissional.

## Decisões — FECHADAS (2026-08-26)

1. **Upload no próprio VPS**, fora de qualquer caminho tocado pelo
   `rsync --delete`. Confirma o diretório `/var/lib/tamarcado/uploads/{company}/`
   servido por `location /uploads/` no Nginx — **nunca** `/var/www/tamarcado`,
   que o deploy limpa a cada release. Entra no backup.
2. **Endereço em UM campo só** (`companies.address`, `varchar(200)`), com o link
   do mapa ao lado. Sem rua/número/bairro separados.
3. **Card compacto quando não houver foto**, como está no protótipo: bloco neutro
   com a inicial, sem espaço vazio nem imagem quebrada.

## Levas — confirmadas

**Leva 1 — sem upload.** Faixa de dias, agrupamento por período, cards de
profissional (iniciais), resumo, e os campos de texto: `description`, `address`,
`maps_url`, `instagram_url`, `whatsapp_phone`. Migration aditiva + formulários de
Configurações + endpoints públicos + front.

**Leva 2 — imagens.** Upload no VPS, `salon_services.image_url` e
`users.avatar_url`, com redimensionamento no envio e limpeza de órfãos.
