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
    screens/              capturas do sistema (ver a seção abaixo)
```

## As capturas de tela

| Arquivo | Tamanho atual | Onde aparece |
|---|---|---|
| `assets/screens/agenda-desktop.png` | 1920×790 | hero, na moldura de navegador |
| `assets/screens/agenda-mobile.png` | 498×969 | hero, na moldura de celular |
| `assets/screens/financeiro-desktop.png` | 1920×790 | vitrine, **em destaque** (largura inteira) |
| `assets/screens/dashboard-desktop.png` | 1920×790 | vitrine, abaixo do destaque |
| `assets/screens/link-publico-mobile.png` | 497×520 | vitrine, na moldura de celular |
| `assets/og-image.png` | **1200×630 exatos** | ⚠️ FALTA — arte de compartilhamento |

**As telas de computador precisam ter a MESMA proporção** (hoje 1920×790).
É o que mantém a vitrine alinhada; uma captura fora do padrão desalinha a linha
inteira. Ao trocar uma delas:

- capture em 1920 de largura e **corte a barra de janela do aplicativo** (os
  ~26px do topo) — a moldura de navegador da página já faz esse papel, e as duas
  juntas ficam redundantes;
- **corte o vazio do rodapé** da tela, deixando a altura em 790. Espaço vazio
  numa captura é o que faz a imagem parecer "fraca" na página;
- para a tela de celular, corte a área sem conteúdo do rodapé pelo mesmo motivo
  (o link público ficou 497×520 depois do corte).

Ao capturar, também:

- **use dados que pareçam de salão.** As capturas atuais mostram serviços de TI
  ("Suporte Tecnico", "Consultoria Sistêmica") e o estabelecimento "TamarcadoTec"
  — a dona de salão vê isso e não se reconhece. Cadastre Escova, Manicure,
  Coloração, com nomes e preços plausíveis, antes de capturar;
- **cuide dos números.** O Dashboard e o Financeiro de hoje mostram
  `RESULTADO −R$ 4.430,00` em vermelho: a página está vendendo organização
  financeira com uma tela de prejuízo. Registre alguns recebimentos e uma saída
  menor para o resultado ficar positivo;
- esconda o que for sensível — telefone e valor de cliente real;
- se algum arquivo passar de ~400 KB, comprima (TinyPNG ou `pngquant`);
- o texto alternativo (`alt`) de cada imagem descreve a tela: **se trocar a
  captura, ajuste o `alt`** no `index.html`.

Se uma captura sumir da pasta, o bloco não quebra: aparece uma área com o nome
do arquivo que falta, e volta ao normal quando o PNG é reposto.

## Antes de publicar

1. **Google Analytics (GA4)** — no `index.html`, procure
   `PONTO DE INSERÇÃO — Google Analytics`, troque `G-XXXXXXXXXX` pelo ID da
   propriedade e **descomente** o bloco.
2. **Search Console** — na mesma região do arquivo, cole a meta
   `google-site-verification`. Depois, no Search Console, envie
   `https://tamarcado.tec.br/sitemap.xml`.
3. **`og-image.png`** — conforme a tabela acima (as capturas de tela já estão
   na pasta; falta só a arte de compartilhamento).

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
