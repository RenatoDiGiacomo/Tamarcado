import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isDevEnv } from "../../app-setup";
import { GatedByCapability } from "../../common/decorators/require-capability.decorator";
import type {
  TenantWhatsAppCredentials,
  WhatsAppProvider,
  WhatsAppProviderName,
} from "./whatsapp.provider";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import {
  WhatsAppConfigException,
  WhatsAppNotConnectedException,
} from "./whatsapp.errors";
import { CloudApiProvider } from "./providers/cloud-api.provider";
import { EvolutionApiProvider } from "./providers/evolution-api.provider";

/**
 * Decide QUAL implementação atende cada tenant e a constrói **já ligada às
 * credenciais daquela empresa** (AC-1, NFR-O3).
 *
 * A REGRA QUE NÃO PODE SER AFROUXADA (DL-054): **produção é exclusivamente a
 * Cloud API oficial.** Um provider não oficial fora de desenvolvimento é
 * recusado aqui, com erro — não com aviso, não com fallback. O número em risco é
 * o **do cliente**, e o banimento não tem recurso.
 *
 * A checagem usa o mesmo `isDevEnv()` do CORS, que é **fail-closed**: `NODE_ENV`
 * ausente ou desconhecido conta como PRODUÇÃO. Um VPS que suba sem a variável
 * não cai no modo permissivo.
 *
 * `@GatedByCapability`: esta factory é a única porta para um objeto capaz de
 * enviar mensagem, então marcá-la faz o guard-rail do DL-072 enxergar todo
 * controller que alcance o envio — e FALHAR a suíte se algum deles não gatear.
 * Os dois controllers que tocam este domínio **sem** ser rota de usuário estão
 * declarados, com justificativa, em `CAPABILITY_UNGUARDED_CONTROLLERS`.
 */
@GatedByCapability("whatsapp_bot")
@Injectable()
export class WhatsAppProviderFactory {
  private readonly logger = new Logger(WhatsAppProviderFactory.name);

  constructor(
    private readonly connections: WhatsAppConnectionService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Provider do tenant, pronto para enviar. Lança
   * `WhatsAppNotConnectedException` se a empresa não tem conexão utilizável.
   *
   * **NÃO checa capability**: quem checa é quem chama (`WhatsAppService` no
   * envio, `WhatsAppWebhookService` no processamento). Separar é de propósito —
   * o operador precisa conseguir VERIFICAR uma conexão recém-preenchida de uma
   * empresa que ainda não comprou nada.
   */
  async forCompany(companyId: string): Promise<WhatsAppProvider> {
    const credenciais = await this.connections.credenciais(companyId);
    if (!credenciais) {
      throw new WhatsAppNotConnectedException(companyId);
    }
    return this.build(credenciais);
  }

  /** Igual a `forCompany`, mas devolve `null` em vez de lançar. */
  async tryForCompany(companyId: string): Promise<WhatsAppProvider | null> {
    const credenciais = await this.connections.credenciais(companyId);
    return credenciais ? this.build(credenciais) : null;
  }

  /** `true` se o provider pode ser escolhido NESTE ambiente (AC-1). */
  static selecionavel(provider: WhatsAppProviderName): boolean {
    return provider === "cloud_api" || isDevEnv();
  }

  private build(credenciais: TenantWhatsAppCredentials): WhatsAppProvider {
    if (!WhatsAppProviderFactory.selecionavel(credenciais.provider)) {
      // Ruidoso de propósito: é uma conexão gravada com um provider que este
      // ambiente não aceita, ou seja, dado que veio de outro lugar.
      this.logger.error(
        `provider "${credenciais.provider}" recusado fora de desenvolvimento ` +
          `(empresa ${credenciais.companyId}) — produção é exclusivamente Cloud API oficial (DL-054)`,
      );
      throw new WhatsAppConfigException(
        `o provider "${credenciais.provider}" só pode ser usado em desenvolvimento; ` +
          "produção opera exclusivamente na Cloud API oficial da Meta (DL-054)",
      );
    }

    switch (credenciais.provider) {
      case "cloud_api":
        return new CloudApiProvider(credenciais, {
          baseUrl: this.config.get<string>(
            "WHATSAPP_GRAPH_URL",
            "https://graph.facebook.com",
          ),
          version: this.config.get<string>("WHATSAPP_GRAPH_VERSION", "v21.0"),
          timeoutMs: this.timeoutMs(),
        });
      case "evolution_api":
        return new EvolutionApiProvider(
          credenciais,
          this.config.get<string>("EVOLUTION_API_URL", "http://127.0.0.1:8080"),
          this.timeoutMs(),
        );
      default: {
        // Provider desconhecido no banco (dado manual torto, recurso removido).
        // Nunca vira "tenta o padrão": sem saber com quem falar, não fala.
        const desconhecido: string = credenciais.provider;
        throw new WhatsAppConfigException(
          `provider desconhecido em company_whatsapp_connections: "${desconhecido}"`,
        );
      }
    }
  }

  /**
   * Teto de espera por chamada ao provider. Curto de propósito: nesta story o
   * processamento do webhook ainda roda no ciclo da resposta, e demora faz a
   * Meta **desativar o webhook do aplicativo inteiro** (DL-080). A 6.20 tira o
   * processamento desse caminho; até lá, o timeout é o que segura.
   */
  private timeoutMs(): number {
    const bruto = Number(this.config.get<string>("WHATSAPP_TIMEOUT_MS"));
    return Number.isInteger(bruto) && bruto > 0 ? bruto : 10_000;
  }
}
