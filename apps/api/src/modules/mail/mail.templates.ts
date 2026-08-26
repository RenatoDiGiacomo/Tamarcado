import type { OutgoingEmail } from "./mail.service";

/**
 * Corpo dos e-mails transacionais.
 *
 * Escritos em **linguagem de dona de salão**, não de sistema: nada de "token",
 * "credenciais" ou "solicitação processada". Frases curtas, um botão grande, e
 * o prazo dito com todas as letras.
 *
 * HTML de e-mail é o HTML de 2005 de propósito: tabela, estilo em atributo
 * `style`, largura fixa. Cliente de e-mail (Gmail, Outlook) ignora `<style>` no
 * `<head>`, não tem flexbox confiável e recorta CSS externo. Cada e-mail leva
 * também uma versão em texto puro — quem lê no relógio ou tem imagens
 * bloqueadas recebe a mesma mensagem, e filtro antispam pontua melhor.
 */

const ROXO = "#5B4FE0"; // --primary do design system, escurecido para o branco do texto passar em contraste
const TEXTO = "#1a1a1a";
const CINZA = "#666666";
const BORDA = "#dedede";

/** Escapa o que vem de fora (nome do estabelecimento, nome da pessoa) antes de
 *  entrar no HTML — um nome com `&` ou `<` não pode quebrar o e-mail. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Moldura comum: cabeçalho com o nome, corpo, botão e rodapé. */
function moldura(params: {
  titulo: string;
  paragrafos: string[];
  botao: { texto: string; url: string };
  aviso: string;
  rodape: string;
}): string {
  const paragrafos = params.paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${TEXTO};">${p}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDA};border-radius:12px;">
    <tr>
      <td style="padding:28px 32px 8px;">
        <p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:${ROXO};letter-spacing:-0.5px;">Tamarcado</p>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:${TEXTO};">${params.titulo}</h1>
        ${paragrafos}
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:${ROXO};border-radius:8px;">
              <a href="${params.botao.url}" style="display:inline-block;padding:16px 28px;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;">${params.botao.texto}</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:${CINZA};">${params.aviso}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 28px;border-top:1px solid ${BORDA};">
        <p style="margin:0;font-size:13px;line-height:1.5;color:${CINZA};">${params.rodape}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** E-mail de redefinição de senha. */
export function emailRedefinirSenha(params: {
  para: string;
  nome: string;
  estabelecimento: string;
  link: string;
}): OutgoingEmail {
  const nome = escapar(params.nome.split(" ")[0] || params.nome);
  const estabelecimento = escapar(params.estabelecimento);

  return {
    to: params.para,
    toName: params.nome,
    subject: "Criar uma nova senha do Tamarcado",
    html: moldura({
      titulo: "Vamos criar uma senha nova",
      paragrafos: [
        `Oi, ${nome}!`,
        `Alguém pediu para trocar a senha de acesso do <strong>${estabelecimento}</strong>. Se foi você, é só clicar no botão abaixo e escolher a senha nova.`,
      ],
      botao: { texto: "Criar minha senha nova", url: params.link },
      aviso:
        "Este link vale por <strong>1 hora</strong> e só pode ser usado uma vez. Depois disso é só pedir outro.",
      rodape:
        "Se não foi você que pediu, pode ignorar esta mensagem — a sua senha atual continua funcionando normalmente.",
    }),
    text: [
      `Oi, ${params.nome.split(" ")[0] || params.nome}!`,
      "",
      `Alguém pediu para trocar a senha de acesso do ${params.estabelecimento}.`,
      "Se foi você, abra o endereço abaixo e escolha a senha nova:",
      "",
      params.link,
      "",
      "Este link vale por 1 hora e só pode ser usado uma vez.",
      "",
      "Se não foi você que pediu, pode ignorar esta mensagem — a sua senha atual continua funcionando.",
      "",
      "Tamarcado",
    ].join("\n"),
  };
}

/** E-mail de convite para a equipe. */
export function emailConviteEquipe(params: {
  para: string;
  nome: string;
  estabelecimento: string;
  link: string;
  diasParaExpirar: number;
}): OutgoingEmail {
  const nome = escapar(params.nome.split(" ")[0] || params.nome);
  const estabelecimento = escapar(params.estabelecimento);
  const prazo =
    params.diasParaExpirar === 1 ? "1 dia" : `${params.diasParaExpirar} dias`;

  return {
    to: params.para,
    toName: params.nome,
    subject: `Você foi convidada para o ${params.estabelecimento} no Tamarcado`,
    html: moldura({
      titulo: `Bem-vinda ao ${estabelecimento}`,
      paragrafos: [
        `Oi, ${nome}!`,
        `Você foi convidada para usar o Tamarcado no <strong>${estabelecimento}</strong> — é lá que ficam a agenda, as clientes e os seus atendimentos.`,
        "Para começar, clique no botão e escolha a sua senha.",
      ],
      botao: { texto: "Criar minha senha e entrar", url: params.link },
      aviso: `Este link vale por <strong>${prazo}</strong> e só pode ser usado uma vez.`,
      rodape:
        "Recebeu sem esperar? Pode ignorar esta mensagem — sem clicar no link, nenhuma conta é criada.",
    }),
    text: [
      `Oi, ${params.nome.split(" ")[0] || params.nome}!`,
      "",
      `Você foi convidada para usar o Tamarcado no ${params.estabelecimento} —`,
      "é lá que ficam a agenda, as clientes e os seus atendimentos.",
      "",
      "Para começar, abra o endereço abaixo e escolha a sua senha:",
      "",
      params.link,
      "",
      `Este link vale por ${prazo} e só pode ser usado uma vez.`,
      "",
      "Recebeu sem esperar? Pode ignorar — sem clicar no link, nenhuma conta é criada.",
      "",
      "Tamarcado",
    ].join("\n"),
  };
}
