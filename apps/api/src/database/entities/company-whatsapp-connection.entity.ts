import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

/** Provider do canal. Produção é EXCLUSIVAMENTE `cloud_api` (DL-054). */
export type WhatsAppProviderName = "cloud_api" | "evolution_api";

/** Estado do VÍNCULO (a linha), não da sessão com a Meta. */
export type WhatsAppConnectionState = "conectado" | "desconectado";

/**
 * Credenciais de WhatsApp **POR TENANT** (Story 6.1, DL-073).
 *
 * TABELA PRÓPRIA, e não colunas em `companies` (DL-084 — diverge da letra do
 * AC-2 da story). O motivo é o token: `companies` é carregada em quase todo
 * request (TenantMiddleware, página pública, branding do painel), então um
 * token nela viaja junto de toda entidade `Company` em memória e basta um
 * endpoint devolver a company para o segredo vazar. Aqui ele mora atrás de UM
 * serviço, lido só por quem envia.
 *
 * ORIGEM DO DADO vs. FORMATO (DL-073): hoje estas linhas são preenchidas **à
 * mão** pelo endpoint de plataforma (`PUT /platform/companies/:slug/whatsapp`).
 * Quando a Story 6.12 (Embedded Signup) nascer, ela preenche **os mesmos
 * campos** automaticamente. O que muda é a origem, nunca o formato — por isso
 * não há nada aqui que pressuponha preenchimento manual.
 *
 * O QUE NÃO ACONTECE AQUI (DL-082): rebaixar plano **não** apaga esta linha.
 * Revogar a capability desliga o USO; refazer a conexão com a Meta (conta,
 * verificação, aprovação de modelos) é a parte cara para o dono, e quem volta
 * depois de um mês parado não pode ter de refazer aquilo.
 */
@Entity({ name: "company_whatsapp_connections" })
// UMA conexão por empresa. O dia em que um salão quiser dois números, isto vira
// uma decisão consciente (migration), não um acidente de dado duplicado.
@Unique("uq_company_whatsapp_company", ["company_id"])
// GLOBAL, e de propósito: é por este campo que o webhook descobre de quem é a
// mensagem que a Meta mandou. Escopar por empresa deixaria dois tenants
// reivindicarem o mesmo número e tornaria o roteamento ambíguo — pela mesma
// razão que a unicidade do evento na 6.20 é global (DL-080).
@Unique("uq_company_whatsapp_phone_number_id", ["phone_number_id"])
export class CompanyWhatsAppConnection {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ type: "bigint" })
  company_id!: string;

  /**
   * Qual implementação atende este tenant. **Sem default** (AC-2): o provider é
   * definido no provisionamento da conexão, não herdado de um palpite — um
   * default `evolution_api` acabaria valendo em produção por omissão, que é
   * exatamente o que o DL-054 proíbe.
   */
  @Column({ type: "varchar", length: 30 })
  provider!: WhatsAppProviderName;

  /**
   * Identificador do NÚMERO na Cloud API (`phone_number_id` da Meta). É a chave
   * de roteamento do webhook e o caminho do envio (`/{phone_number_id}/messages`).
   *
   * No `evolution_api` (só dev — DL-054) este campo guarda o **nome da
   * instância**, que é o identificador equivalente naquele provider. Em produção
   * só existe a Cloud API, então não há ambiguidade possível.
   */
  @Column({ type: "varchar", length: 50 })
  phone_number_id!: string;

  /** Identificador da CONTA (WABA) do cliente. Diagnóstico e suporte. */
  @Column({ type: "varchar", length: 50, nullable: true })
  waba_id!: string | null;

  /** Número em formato legível (`+55 11 94245-8672`) — só exibição. */
  @Column({ type: "varchar", length: 30, nullable: true })
  display_phone_number!: string | null;

  /**
   * Token de operação **em nome do cliente**, CIFRADO em repouso (AES-256-GCM,
   * chave em `WHATSAPP_TOKEN_KEY` — ver `whatsapp-token.cipher.ts`).
   *
   * Cifrar não protege de quem já está dentro do servidor — protege do **dump de
   * banco**, que sai da máquina para backup enquanto o arquivo de ambiente não
   * sai. Quem tem este token envia WhatsApp **como o salão**.
   *
   * NULO quando a conexão está `desconectado`: desligar apaga o segredo e
   * preserva a linha (audita quem esteve conectado, e o número segue reservado).
   */
  @Column({ type: "text", nullable: true })
  access_token!: string | null;

  @Column({ type: "varchar", length: 20, default: "conectado" })
  status!: WhatsAppConnectionState;

  @Column({ type: "timestamp", nullable: true })
  connected_at!: Date | null;

  /**
   * COMO a conexão chegou aqui. Texto livre pela mesma razão do `granted_by` das
   * capabilities: a origem varia e vai variar de novo. Hoje `manual:plataforma`;
   * quando a 6.12 nascer, `embedded_signup`.
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  connected_by!: string | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
