import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import {
  WhatsAppConnectionService,
  type WhatsAppConnectionView,
} from "../whatsapp/whatsapp-connection.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import type { WhatsAppConnectionStatus } from "../whatsapp/whatsapp.provider";

/** Conexão + conferência ao vivo. **Sem token**, por construção do tipo. */
export interface PlatformWhatsAppView {
  slug: string;
  conexao: WhatsAppConnectionView | null;
  /** Resultado da conversa com o provider. `null` quando não há conexão. */
  estado: WhatsAppConnectionStatus | null;
}

/**
 * Conexão de WhatsApp **por tenant**, preenchida à mão (Story 6.1, DL-073).
 *
 * É o endpoint de plataforma da Story 6.16 estendido para o que a 6.1 precisa:
 * enquanto o Embedded Signup (6.12) estiver bloqueado pelo CNPJ inapto, é assim
 * que um estabelecimento ganha credenciais. **Não é um caminho provisório com
 * formato provisório** — a 6.12 vai preencher os MESMOS campos, e o que muda é
 * só a origem do dado.
 *
 * Controller SEPARADO do `PlatformController` de propósito. Dois motivos:
 * - ele toca o domínio gateado por capability (a factory do provider), e por
 *   isso precisa de entrada em `CAPABILITY_UNGUARDED_CONTROLLERS`; misturá-lo
 *   com o de provisionamento arrastaria as rotas de plano para a mesma exceção;
 *   o escopo da exceção tem de ser o menor possível para continuar auditável;
 * - "criar empresa" e "conectar canal" são operações de momentos diferentes.
 *
 * ⚠️ **Em produção esta rota só existe por TÚNEL SSH.** O Nginx bloqueia
 * `/api/platform/*` para a internet inteira (`deny all`, RUNBOOK §5.1) — o
 * acesso legítimo é direto na API por `127.0.0.1:3000`, com a `x-platform-key`.
 * Isso importa mais aqui do que nas outras rotas de plataforma: quem chegar
 * nesta **grava credencial de WhatsApp de um cliente**.
 *
 * ⚠️ **O webhook (`/api/whatsapp/webhook`) é o oposto e PRECISA ficar aberto** —
 * quem o chama é a Meta. Ele não está sob `/api/platform/`, então o `deny` não o
 * alcança; qualquer endurecimento futuro do Nginx tem de preservá-lo.
 */
@ApiTags("platform")
@Controller("platform/companies/:slug/whatsapp")
@UseGuards(PlatformKeyGuard)
export class PlatformWhatsAppController {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly connections: WhatsAppConnectionService,
    private readonly whatsapp: WhatsAppService,
    private readonly rateLimit: PlatformRateLimitService,
  ) {}

  /**
   * Estado do vínculo **e** conferência ao vivo com o provider. A conferência é
   * o que responde a pergunta que o operador tem de fato depois de preencher à
   * mão: *"preenchi certo?"*. Sem ela, o primeiro sinal de token errado seria
   * uma mensagem que não sai, dias depois.
   */
  @Get()
  async mostrar(
    @Param("slug") slug: string,
    @Ip() ip: string,
  ): Promise<PlatformWhatsAppView> {
    this.rateLimit.assertWithinLimit(ip);
    const companyId = await this.companyId(slug);
    const conexao = await this.connections.view(companyId);
    const estado =
      conexao?.status === "conectado"
        ? await this.whatsapp.connectionStatus(companyId)
        : null;
    return { slug, conexao, estado };
  }

  /**
   * Grava (ou regrava) a conexão. `PUT` porque é **estado final**: mandar de
   * novo com outro token é o caminho de "o token expirou, gere outro", e não
   * cria uma segunda conexão.
   *
   * A resposta traz a conferência ao vivo. Ela **não** faz a gravação falhar:
   * credencial gravada e provider fora do ar são problemas diferentes, e
   * desfazer a gravação por causa do segundo obrigaria a digitar o token de novo.
   */
  @Put()
  async conectar(
    @Param("slug") slug: string,
    @Body() dto: ConnectWhatsAppDto,
    @Ip() ip: string,
  ): Promise<PlatformWhatsAppView> {
    this.rateLimit.assertWithinLimit(ip);
    const companyId = await this.companyId(slug);
    const conexao = await this.connections.upsert(companyId, {
      provider: dto.provider,
      phoneNumberId: dto.phoneNumberId,
      wabaId: dto.wabaId ?? null,
      displayPhoneNumber: dto.displayPhoneNumber ?? null,
      accessToken: dto.accessToken,
      // Origem do dado (DL-073). Quando a 6.12 nascer, aqui vem
      // `embedded_signup` — e é a única diferença entre os dois caminhos.
      connectedBy: "manual:plataforma",
    });
    const estado = await this.whatsapp.connectionStatus(companyId);
    return { slug, conexao, estado };
  }

  /**
   * Desliga a conexão: apaga o token, mantém a linha. Ver
   * `WhatsAppConnectionService#desconectar` para o porquê de a linha ficar.
   *
   * NÃO é o caminho de rebaixar plano. Rebaixar desliga o USO e **preserva o
   * vínculo** (DL-082) — quem confundir os dois vai obrigar o dono a refazer a
   * conexão com a Meta, que é a parte cara e a que faz gente desistir no meio.
   */
  @Delete()
  async desconectar(
    @Param("slug") slug: string,
    @Ip() ip: string,
  ): Promise<PlatformWhatsAppView> {
    this.rateLimit.assertWithinLimit(ip);
    const companyId = await this.companyId(slug);
    const conexao = await this.connections.desconectar(companyId);
    return { slug, conexao, estado: null };
  }

  /**
   * Empresa pelo SLUG, como no resto do endpoint de plataforma (Story 6.16): é
   * o que o operador tem na mão, e pedir o id do banco obrigaria a consultar o
   * banco antes de operar.
   */
  private async companyId(slug: string): Promise<string> {
    const company = await this.companies.findOne({
      where: { slug },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }
    return company.id;
  }
}
