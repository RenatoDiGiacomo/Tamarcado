import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Um e-mail a enviar. `text` é obrigatório: cliente que não renderiza HTML
 *  (ou filtro antispam) precisa de uma versão legível. */
export interface OutgoingEmail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Envio de e-mail transacional pelo **Brevo**, usando a **API HTTP**
 * (`POST /v3/smtp/email`) — não SMTP. Por quê:
 *
 * 1. **Zero dependência nova.** `fetch` é nativo no Node 20; um cliente SMTP
 *    exigiria nodemailer no pacote de produção.
 * 2. **Não depende de porta de saída.** VPS costuma bloquear 25/465/587 (a
 *    Hostinger bloqueia por padrão em vários planos, e liberar é chamado com o
 *    suporte). HTTPS na 443 já sai.
 * 3. **Erro legível.** A API devolve status HTTP + JSON com o motivo; SMTP
 *    devolve código numérico e desconecta.
 * 4. **Timeout nosso.** `AbortSignal.timeout` corta em 10s — a requisição do
 *    usuário não fica pendurada esperando o provedor.
 *
 * **Falha de envio NUNCA derruba a requisição** (regra do escopo): `send`
 * devolve `boolean` e registra o motivo. Quem chama decide o que fazer — no
 * "esqueci minha senha" a resposta ao usuário é a mesma de qualquer jeito, para
 * não virar sonda de e-mails cadastrados.
 *
 * Sem `BREVO_API_KEY` o serviço fica **desligado**: registra o que enviaria e
 * segue. É o modo de desenvolvimento — ninguém precisa de credencial real para
 * rodar o projeto.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private static readonly ENDPOINT = "https://api.brevo.com/v3/smtp/email";
  private static readonly TIMEOUT_MS = 10_000;

  constructor(private readonly config: ConfigService) {}

  /** Configurado = tem chave. Sem chave, roda em modo "só log". */
  get enabled(): boolean {
    return Boolean(this.config.get<string>("BREVO_API_KEY"));
  }

  /**
   * Envia e diz se conseguiu. **Não lança** — nem em erro de rede, nem em 4xx
   * do provedor. O motivo vai para o log com o destinatário, para dar para
   * rastrear "não recebi o e-mail" sem adivinhação.
   */
  async send(email: OutgoingEmail): Promise<boolean> {
    const apiKey = this.config.get<string>("BREVO_API_KEY");
    const from = this.config.get<string>("MAIL_FROM", "contato@tamarcado.tec.br");
    const fromName = this.config.get<string>("MAIL_FROM_NAME", "Tamarcado");

    if (!apiKey) {
      this.logger.warn(
        `e-mail NÃO enviado (BREVO_API_KEY ausente): to=${email.to} assunto="${email.subject}"`,
      );
      return false;
    }

    try {
      const resposta = await fetch(MailService.ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: fromName, email: from },
          to: [{ email: email.to, ...(email.toName ? { name: email.toName } : {}) }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
        }),
        signal: AbortSignal.timeout(MailService.TIMEOUT_MS),
      });

      if (!resposta.ok) {
        // O corpo do Brevo traz `{ code, message }` — é o que diz se o problema
        // é chave inválida, remetente não verificado ou limite do plano.
        const corpo = await resposta.text().catch(() => "");
        this.logger.error(
          `Brevo recusou o envio: status=${resposta.status} to=${email.to} corpo=${corpo.slice(0, 300)}`,
        );
        // 401 merece explicação: a chave do Brevo expira com 1 ano de validade
        // OU com 90 dias SEM NENHUMA chamada. Como recuperação de senha e
        // convite são eventos raros, a expiração por inatividade é o caso mais
        // provável — e sem esta linha alguém perderia tempo procurando bug de
        // código. (Prevenção: cron mensal do RUNBOOK §11.4.)
        if (resposta.status === 401) {
          this.logger.error(
            "A chave do Brevo foi recusada (401): expirada, revogada ou errada. " +
              "Gere outra no painel, atualize BREVO_API_KEY em /etc/tamarcado/api.env " +
              "e rode `pm2 restart tamarcado-api --update-env`. Ver RUNBOOK §11.4.",
          );
        }
        return false;
      }

      this.logger.log(`e-mail enviado: to=${email.to} assunto="${email.subject}"`);
      return true;
    } catch (erro) {
      // Rede fora, DNS, timeout. Idem: registra e segue.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`falha ao enviar e-mail para ${email.to}: ${motivo}`);
      return false;
    }
  }
}
