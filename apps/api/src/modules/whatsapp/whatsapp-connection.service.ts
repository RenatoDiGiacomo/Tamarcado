import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CompanyWhatsAppConnection,
  type WhatsAppProviderName,
} from "../../database/entities/company-whatsapp-connection.entity";
import type { TenantWhatsAppCredentials } from "./whatsapp.provider";
import { WhatsAppTokenCipher } from "./whatsapp-token.cipher";

/**
 * A conexão como ela pode ser MOSTRADA — para o operador hoje, para a tela da
 * Story 6.17 depois. **Não existe campo de token aqui, e isso é o desenho.**
 *
 * O jeito de garantir que um segredo não vaza para o front não é lembrar de
 * removê-lo: é o tipo da resposta nunca ter tido o campo. Quem quiser expor o
 * token precisa mudar esta interface — e aí é uma decisão visível no diff, não
 * um esquecimento.
 */
export interface WhatsAppConnectionView {
  companyId: string;
  provider: WhatsAppProviderName;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  status: "conectado" | "desconectado";
  connectedAt: string | null;
  connectedBy: string | null;
}

/** O que o endpoint de plataforma grava ao conectar um tenant à mão. */
export interface UpsertConnectionInput {
  provider: WhatsAppProviderName;
  phoneNumberId: string;
  wabaId?: string | null;
  displayPhoneNumber?: string | null;
  accessToken: string;
  connectedBy: string;
}

/**
 * Guarda e devolve as credenciais de WhatsApp **por tenant** (Story 6.1).
 *
 * É o ÚNICO lugar do sistema que lê a coluna do token. Quem precisa enviar pede
 * as credenciais aqui e recebe um objeto ligado a uma empresa; quem precisa
 * mostrar a conexão recebe uma `WhatsAppConnectionView`, que não tem o campo.
 *
 * NÃO É GATEADO POR CAPABILITY, e isso é decisão, não esquecimento: **conectar
 * não é usar**. O DL-082 é explícito — rebaixar plano desliga o USO e preserva o
 * VÍNCULO, porque refazer a conexão com a Meta é a parte cara para o dono. Quem
 * é gateado é o envio (`WhatsAppService`) e o processamento
 * (`WhatsAppWebhookService`).
 *
 * Repositório CRU, sem `TenantAwareRepository` — exceção consciente ao ADR-002,
 * pela mesma razão do `CapabilitiesService`: este serviço é usado TAMBÉM fora de
 * request (webhook chamado pela Meta, endpoint de plataforma pré-tenant), onde
 * não existe `TenantContext` para o repositório ler. O escopo é garantido pela
 * ASSINATURA: todo método exige `companyId` explícito.
 */
@Injectable()
export class WhatsAppConnectionService {
  private readonly logger = new Logger(WhatsAppConnectionService.name);

  constructor(
    @InjectRepository(CompanyWhatsAppConnection)
    private readonly repo: Repository<CompanyWhatsAppConnection>,
    private readonly cipher: WhatsAppTokenCipher,
  ) {}

  /**
   * Credenciais prontas para uso, já decifradas. `null` quando a empresa nunca
   * conectou, desconectou, ou a linha ficou sem token.
   *
   * O objeto devolvido carrega o token em claro — por isso ele **não** é
   * guardado em campo, cache nem log: nasce na chamada e morre com ela.
   */
  async credenciais(
    companyId: string,
  ): Promise<TenantWhatsAppCredentials | null> {
    const linha = await this.repo.findOne({ where: { company_id: companyId } });
    if (!linha || linha.status !== "conectado" || !linha.access_token) {
      return null;
    }
    return {
      companyId: linha.company_id,
      provider: linha.provider,
      phoneNumberId: linha.phone_number_id,
      wabaId: linha.waba_id,
      accessToken: this.cipher.decrypt(linha.access_token),
    };
  }

  /**
   * ROTEAMENTO DO WEBHOOK: de quem é o número que a Meta citou?
   *
   * É **lookup, não regra de negócio** (AC-3) — por isso pode continuar no
   * caminho do endpoint mesmo depois da fila da 6.20. Devolve `null` para número
   * desconhecido, e quem chama trata isso como "não roteado": **nunca** como
   * erro, porque a Meta manda evento para número que já não é nosso e derrubar o
   * webhook por isso tiraria o canal de todos os tenants do ar (DL-080).
   *
   * Aceita conexão `desconectado`: se o número ainda está vinculado, o evento é
   * dela — quem decide não processar é o gate, não o roteamento.
   */
  async empresaDoNumero(phoneNumberId: string): Promise<string | null> {
    const linha = await this.repo.findOne({
      where: { phone_number_id: phoneNumberId },
      select: { company_id: true },
    });
    return linha?.company_id ?? null;
  }

  /** Estado do vínculo, sem segredo nenhum. `null` se a empresa nunca conectou. */
  async view(companyId: string): Promise<WhatsAppConnectionView | null> {
    const linha = await this.repo.findOne({ where: { company_id: companyId } });
    return linha ? paraView(linha) : null;
  }

  /**
   * Grava (ou regrava) a conexão de um tenant. Hoje é chamado **à mão** pelo
   * endpoint de plataforma; quando a Story 6.12 nascer, o Embedded Signup chama
   * o mesmo método com os mesmos campos (DL-073). Nada aqui pressupõe origem.
   *
   * Regravar substitui o token — é o caminho de "o token expirou, gere outro".
   */
  async upsert(
    companyId: string,
    entrada: UpsertConnectionInput,
  ): Promise<WhatsAppConnectionView> {
    const existente = await this.repo.findOne({
      where: { company_id: companyId },
    });
    const linha =
      existente ?? this.repo.create({ company_id: companyId });

    linha.provider = entrada.provider;
    linha.phone_number_id = entrada.phoneNumberId;
    linha.waba_id = entrada.wabaId ?? null;
    linha.display_phone_number = entrada.displayPhoneNumber ?? null;
    linha.access_token = this.cipher.encrypt(entrada.accessToken);
    linha.status = "conectado";
    linha.connected_at = new Date();
    linha.connected_by = entrada.connectedBy;

    const salva = await this.salvar(linha, entrada.phoneNumberId);
    // Log SEM token e SEM o número completo: o que serve ao suporte é saber que
    // a empresa X passou a ter conexão Y, não qual era o segredo.
    this.logger.log(
      `conexão de WhatsApp gravada: empresa=${companyId} provider=${salva.provider} phone_number_id=${salva.phone_number_id} origem=${salva.connected_by}`,
    );
    return paraView(salva);
  }

  /**
   * Desliga a conexão: apaga o token e mantém a linha.
   *
   * Manter a linha não é preguiça — ela registra **quem esteve conectado** e
   * mantém o `phone_number_id` reservado, de modo que um evento atrasado da Meta
   * ainda roteie para a empresa certa em vez de virar "não roteado" sem
   * explicação. O que some é o segredo, que é o que não pode sobrar.
   */
  async desconectar(companyId: string): Promise<WhatsAppConnectionView | null> {
    const linha = await this.repo.findOne({ where: { company_id: companyId } });
    if (!linha) {
      return null;
    }
    linha.status = "desconectado";
    linha.access_token = null;
    const salva = await this.repo.save(linha);
    this.logger.warn(
      `conexão de WhatsApp desligada: empresa=${companyId} phone_number_id=${salva.phone_number_id}`,
    );
    return paraView(salva);
  }

  /**
   * Grava traduzindo a violação da UNIQUE de `phone_number_id` em **409 com
   * explicação**.
   *
   * Sem isto, tentar conectar um número que já é de outro estabelecimento
   * devolve 500 e um erro cru de banco. O erro está CERTO — a unicidade global é
   * o que torna o roteamento do webhook determinístico —, mas quem está do outro
   * lado é o operador preenchendo credencial à mão, e "Internal server error"
   * não diz o que ele precisa saber: que o número já tem dono e que o caminho é
   * desconectar lá primeiro.
   */
  private async salvar(
    linha: CompanyWhatsAppConnection,
    phoneNumberId: string,
  ): Promise<CompanyWhatsAppConnection> {
    try {
      return await this.repo.save(linha);
    } catch (erro) {
      if (numeroJaVinculado(erro)) {
        throw new ConflictException(
          `O número ${phoneNumberId} já está vinculado a outro estabelecimento. ` +
            "Desconecte-o de lá antes de conectá-lo aqui.",
        );
      }
      throw erro;
    }
  }
}

/** Violação da UNIQUE de `phone_number_id` (MySQL). */
function numeroJaVinculado(erro: unknown): boolean {
  const codigo = (erro as { driverError?: { code?: string } })?.driverError?.code;
  const mensagem = erro instanceof Error ? erro.message : "";
  return codigo === "ER_DUP_ENTRY" && mensagem.includes("phone_number_id");
}

function paraView(linha: CompanyWhatsAppConnection): WhatsAppConnectionView {
  return {
    companyId: linha.company_id,
    provider: linha.provider,
    phoneNumberId: linha.phone_number_id,
    wabaId: linha.waba_id,
    displayPhoneNumber: linha.display_phone_number,
    status: linha.status,
    connectedAt: linha.connected_at?.toISOString() ?? null,
    connectedBy: linha.connected_by,
  };
}
