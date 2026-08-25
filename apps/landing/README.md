# Landing page — `tamarcado.tec.br`

Site institucional do Tamarcado. **HTML, CSS e um JS pequeno — sem build, sem
framework, sem dependência.** É servido direto pelo Nginx a partir de
`/var/www/tamarcado-lp`; o deploy copia esta pasta como está.

> **Por que não usar o bundle do painel:** a LP precisa carregar rápido no 4G e
> ser lida pelo Google. Um SPA React entregaria a mesma página com bem mais peso
> e com o conteúdo montado por JavaScript. Aqui o HTML já vem pronto na resposta.

## Endereços (decisão DL-069)

| Endereço | O que serve |
|---|---|
| `tamarcado.tec.br` | **esta landing page** |
| `app.tamarcado.tec.br` | painel (`/login`) e link público (`/agendar/{slug}`) |
| `api.tamarcado.tec.br` | API |

## Arquivos

```
apps/landing/
  index.html      página inteira (SEO, dados estruturados, conteúdo)
  styles.css      estilo — tokens copiados do design system do produto
  main.js         menu do celular, fallback das capturas, ano do rodapé
  robots.txt      libera a indexação e aponta o sitemap
  sitemap.xml     uma URL hoje; acrescente uma <url> por página nova
  assets/
    logo-*.svg            logos (cópia de apps/web/src/logos)
    favicon-192.png       ícone da aba
    apple-touch-icon.png  ícone do iOS
    icone-512.png         usado no dado estruturado da organização
    og-image.png          ⚠️ FALTA — imagem do compartilhamento (1200×630)
    screens/              ⚠️ FALTAM — capturas reais do sistema
```

## O que ainda falta (imagens)

A página está completa; o que falta são os arquivos de imagem. Enquanto não
existirem, cada bloco de captura aparece como uma moldura tracejada com o nome
do arquivo esperado — o layout **não quebra**. Basta colocar os PNGs nos
caminhos abaixo e recarregar; não é preciso mexer no código.

| Arquivo | Proporção sugerida | Tela a capturar |
|---|---|---|
| `assets/screens/agenda-desktop.png` | 1440×900 | Agenda semanal no computador |
| `assets/screens/agenda-mobile.png` | 390×844 | Agenda do dia no celular (lista) |
| `assets/screens/link-publico-mobile.png` | 390×844 | `/agendar/{slug}` no celular, na escolha de horário |
| `assets/screens/financeiro-desktop.png` | 1440×900 | Financeiro com recebimentos e totais |
| `assets/screens/dashboard-desktop.png` | 1440×900 | Dashboard com faturamento e atendimentos |
| `assets/og-image.png` | **1200×630 exatos** | Arte de compartilhamento (logo + frase sobre fundo da marca) |

Ao capturar:

- **Use dados de verdade** (ou plausíveis). Nome de teste tipo "aaa" aparece na
  imagem e queima a página.
- **Esconda o que for sensível** — telefone e valor de cliente real. Se precisar,
  troque o nome antes de capturar.
- Exporte em PNG. Se algum arquivo passar de ~400 KB, comprima (TinyPNG ou
  `pngquant`) — a página é indexada também por velocidade.
- O texto alternativo (`alt`) de cada imagem já está escrito no `index.html`
  descrevendo a tela. **Se você trocar a tela capturada, ajuste o `alt`.**

## Antes de publicar

1. **Google Analytics (GA4)** — no `index.html`, procure
   `PONTO DE INSERÇÃO — Google Analytics`, troque `G-XXXXXXXXXX` pelo ID da
   propriedade e **descomente** o bloco.
2. **Search Console** — na mesma região do arquivo, cole a meta
   `google-site-verification`. Depois, no Search Console, envie
   `https://tamarcado.tec.br/sitemap.xml`.
3. **Capturas e `og-image.png`** — conforme a tabela acima.

## Ver localmente

Precisa ser por servidor HTTP (os caminhos são absolutos, começando com `/`):

```bash
cd apps/landing
python -m http.server 8080     # ou: npx serve -l 8080 .
# abre em http://localhost:8080
```

## Ao editar o conteúdo

- **Uma `<h1>` por página** — a do hero. Seções são `<h2>`, itens dentro delas `<h3>`.
- O bloco de **dados estruturados** (JSON-LD) no `<head>` repete as perguntas do
  FAQ e a lista de funcionalidades. **Mudou o texto visível, mude lá também** —
  dado estruturado que não corresponde à página é penalizado pelo Google.
- O número de WhatsApp aparece em vários links (`wa.me/5511998325320`), no rodapé
  e no dado estruturado. Ao trocar, procure por `5511998325320` no `index.html`.
- Não prometa o que o produto ainda não faz. O agendamento **pela cliente** é
  pelo link público; o bot de WhatsApp é o Épico 6 e **ainda não existe** — não
  entra no texto até estar no ar.
