# Changelog — Tamarcado

Registro de atualizações em **linguagem de quem usa o sistema** (não de commit).
Serve para demonstrar a atualização ao cliente e para responder "o que mudou?"
meses depois.

As versões seguem **X.Y.Z** (SemVer), decididas no PR `dev → main` — ver
**DL-063**. Durante o beta, a interface exibe **"v1.0…b"** (o "b" some quando o
sistema sair do beta).

## v1.0.1b — 2026-08-13

- **Corrigido:** o sistema não perde mais a sessão quando fica muito tempo
  aberto sem uso. Antes, ao voltar depois de um período parado, aparecia um erro
  e o botão "tentar de novo" não resolvia — só recarregando a página na mão.
  Agora a sessão se renova sozinha e a tela volta a funcionar; se o acesso
  realmente tiver expirado, o sistema leva à tela de entrada com um aviso claro,
  em vez de deixar um erro na tela.
