import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { MailService } from "../mail/mail.service";
import { emailRedefinirSenha } from "../mail/mail.templates";
import { UsersService } from "../users/users.service";

/**
 * "Esqueci minha senha" — o fluxo que a própria dona dispara na tela de login.
 *
 * **Não reimplementa nada do mecanismo de token**: reusa
 * `UsersService.createPasswordReset` (Story 1.9.01) — token único hasheado,
 * validade de 1 hora, uso único, gerar novo invalida o anterior. O que muda
 * aqui é só o **canal**: em vez de o link voltar na resposta para o operador
 * repassar à mão, ele sai por e-mail.
 *
 * O endpoint de plataforma (`/api/platform/password-reset`) continua existindo
 * para o caso de a pessoa não ter acesso ao e-mail cadastrado.
 *
 * **O e-mail é único por empresa, não global** (DL-026): a mesma pessoa pode
 * ter conta em mais de um estabelecimento. Nesse caso sai **um e-mail por
 * conta**, cada um dizendo de qual estabelecimento é — senão ela recebe um link
 * e não sabe para onde ele leva.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  /**
   * Gera e envia o(s) link(s) de redefinição.
   *
   * **Não devolve nada e não lança** quando o e-mail não existe: quem chama
   * responde sempre a mesma coisa. Um endpoint que respondesse diferente para
   * e-mail cadastrado e não cadastrado viraria uma sonda para descobrir quem
   * tem conta no sistema.
   *
   * Falha de envio também não propaga (o `MailService` já engole e registra):
   * do lado de fora, pedir o link é sempre uma operação que "deu certo".
   */
  async requestReset(email: string, ip: string): Promise<void> {
    const normalizado = email.trim().toLowerCase();
    const usuarios = await this.users.findActiveByEmail(normalizado);

    if (usuarios.length === 0) {
      // Registrado para dar para investigar "pedi e não chegou" — sem isso, o
      // silêncio da resposta uniforme também esconderia o problema de nós.
      this.logger.log(
        `password-reset solicitado para e-mail sem conta ativa: email=${normalizado} ip=${ip}`,
      );
      return;
    }

    const empresas = await this.companies.find({
      where: { id: In(usuarios.map((u) => u.company_id)) },
    });
    const nomePorEmpresa = new Map(empresas.map((c) => [c.id, c.name]));

    for (const usuario of usuarios) {
      const { link } = await this.users.createPasswordReset(
        usuario.company_id,
        usuario,
      );
      const estabelecimento =
        nomePorEmpresa.get(usuario.company_id) ?? "seu estabelecimento";

      const enviado = await this.mail.send(
        emailRedefinirSenha({
          para: usuario.email,
          nome: usuario.name,
          estabelecimento,
          link,
        }),
      );

      // Auditoria: quem, de onde, e se o e-mail saiu. O link NUNCA entra no log.
      this.logger.log(
        `password-reset enviado: user=${usuario.id} company=${usuario.company_id} ip=${ip} entregue=${enviado}`,
      );
    }
  }
}
