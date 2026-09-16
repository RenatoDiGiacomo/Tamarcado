import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/** Providers aceitos. Produção é exclusivamente `cloud_api` (DL-054). */
export const WHATSAPP_PROVIDERS = ["cloud_api", "evolution_api"] as const;

/**
 * Conexão de WhatsApp preenchida **à mão** (Story 6.1 + 6.16, DL-073).
 *
 * É o caminho de hoje porque o Embedded Signup (Story 6.12) está bloqueado pelo
 * CNPJ inapto. **O formato não muda quando ele destravar** — a 6.12 vai
 * preencher exatamente estes campos, só que sozinha, a partir do que a Meta
 * devolver. Por isso nada aqui tem cara de provisório: não há campo "manual",
 * não há caminho especial, e o primeiro tenant (a WABA de desenvolvimento) entra
 * como um tenant qualquer.
 *
 * ⚠️ **O `accessToken` ENTRA E NUNCA MAIS SAI.** Nenhuma resposta desta API o
 * devolve, nem truncado. Se o operador precisar conferir qual token está
 * gravado, a resposta é **regravar** — conferir segredo é justamente o hábito
 * que faz segredo aparecer em print de tela.
 *
 * ⚠️ **`whitelist: true` no `ValidationPipe` global** descarta campo com nome
 * errado **em silêncio** (DL do contrato da API). `phone_number_id` em vez de
 * `phoneNumberId` viraria um corpo sem o campo obrigatório — 400, felizmente
 * ruidoso. Este módulo é novo, então segue o `camelCase` dos módulos novos.
 */
export class ConnectWhatsAppDto {
  @IsString()
  @IsIn([...WHATSAPP_PROVIDERS])
  provider!: (typeof WHATSAPP_PROVIDERS)[number];

  /**
   * `phone_number_id` da Meta — identificador do NÚMERO, não da conta. É a chave
   * de roteamento do webhook.
   *
   * No provider `evolution_api` (só dev) este campo é o **nome da instância**.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phoneNumberId!: string;

  /** Identificador da CONTA (WABA) do cliente. Diagnóstico e suporte. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  wabaId?: string;

  /** Número legível (`+55 11 94245-8672`). Só exibição. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  displayPhoneNumber?: string;

  /**
   * Token de operação em nome do cliente. Guardado **cifrado** (DL-084).
   * Sem limite de tamanho: os tokens da Meta são longos e mudam de formato.
   */
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
