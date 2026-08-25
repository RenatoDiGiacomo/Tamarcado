# Changelog — Tamarcado

Registro de atualizações em **linguagem de quem usa o sistema** (não de commit).
Serve para demonstrar a atualização ao cliente e para responder "o que mudou?"
meses depois.

As versões seguem **X.Y.Z** (SemVer), decididas no PR `dev → main` — ver
**DL-063**. Durante o beta, a interface exibe **"v1.0…b"** (o "b" some quando o
sistema sair do beta).

## Não lançado

> Entra na próxima versão. O número sai no PR `dev → main` (DL-063).

- **O sistema mudou de endereço:** o painel agora abre em
  **app.tamarcado.tec.br** (antes era tamarcado.tec.br, que passou a ser o site
  do Tamarcado). Os links antigos continuam funcionando — quem abrir o endereço
  velho é levado automaticamente para o novo.
- **Quem usa o sistema pelo ícone no celular precisa instalar de novo:**
  desinstale o ícone antigo e adicione o sistema à tela inicial abrindo
  **app.tamarcado.tec.br**. O endereço antigo agora mostra o site, não o sistema.
- **O link de agendamento das suas clientes também mudou de endereço**
  (app.tamarcado.tec.br/agendar/…). O link antigo redireciona sozinho, mas vale
  atualizar onde ele estiver publicado — bio do Instagram, por exemplo.
- **Novo site do Tamarcado** em tamarcado.tec.br, para quem ainda não é cliente
  conhecer o sistema.

## v1.1.0b — 2026-08-20

- **Financeiro:** registre o pagamento recebido de cada atendimento (pago ou
  pendente, forma de pagamento opcional) e acompanhe os recebimentos por período,
  com filtros e exportação para o Excel (CSV).
- **Clientes:** na lista e no perfil de cada cliente aparece quanto está em aberto
  e o que já foi pago.
- **Dashboard:** um painel de leitura com os números do negócio — faturamento,
  vendas, ticket médio, atendimentos, clientes e o resultado do período — com
  gráficos. Abre como a primeira página ao entrar.
- **Equipe:** virou um menu próprio para cadastrar a remuneração de cada
  profissional (comissão e/ou salário) e ver a previsão do período.
- **Pagamento à equipe:** registre no Financeiro quanto pagou à equipe; o sistema
  passa a mostrar o resultado — o que entrou menos o que saiu.
- **No celular, a navegação mudou:** a barra de baixo ficou fixa com Agenda,
  Pendentes, o botão de novo agendamento no meio, Clientes e um Menu. Dashboard,
  Financeiro, Equipe, Configurações e Perfil ficam no Menu, que abre pelo lado —
  assim nada fica escondido nem espremido quando o sistema ganha uma tela nova.
- **No celular, o Dashboard e o Financeiro ficaram mais fáceis de ler:** os
  números agora deslizam para o lado, como as fotos de uma rede social, em vez de
  ocuparem a tela inteira empilhados. No Dashboard o gráfico já aparece de cara.
  No Financeiro, as datas continuam à mão e os outros filtros (situação, forma de
  pagamento e cliente) abrem pelo botão "Filtros", que mostra quantos estão
  ligados — antes o campo da cliente aparecia cortado no celular.
- **Aviso de novidades:** ao entrar depois de uma atualização, você vê um resumo
  do que mudou. Dá para reabrir em Perfil → Novidades.

> **Sincronize** este arquivo com `apps/web/src/lib/changelog.ts` (fonte do aviso
> na tela) a cada versão. Agora a suíte cobra: `changelog.test.ts` falha se as
> duas listas discordarem em versão, data ou número de novidades.

## v1.0.1b — 2026-08-13

- **Corrigido:** o sistema não perde mais a sessão quando fica muito tempo
  aberto sem uso. Antes, ao voltar depois de um período parado, aparecia um erro
  e o botão "tentar de novo" não resolvia — só recarregando a página na mão.
  Agora a sessão se renova sozinha e a tela volta a funcionar; se o acesso
  realmente tiver expirado, o sistema leva à tela de entrada com um aviso claro,
  em vez de deixar um erro na tela.
