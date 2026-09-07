import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  DEFAULT_PLAN,
  PLAN_NAMES,
} from "../../capabilities/capability-presets";

/**
 * Provisionamento de estabelecimento (Story 1.9). O `slug` vira a URL pública
 * (`/agendar/{slug}`) e o identificador de login do painel — por isso é
 * imutável na prática (trocar quebraria o link no site do cliente). Validado
 * como kebab-case ASCII: minúsculas, dígitos e hífens simples, sem acento,
 * espaço nem caractere especial.
 */
export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      "slug inválido: use apenas minúsculas, números e hífens (sem acento, espaço ou caractere especial)",
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ownerName!: string;

  @IsEmail()
  @MaxLength(200)
  ownerEmail!: string;

  /**
   * Plano CONTRATADO (Story 6.11, DL-072). Age só como PRESET: no provisionamento
   * ele preenche `company_capabilities` e vira rótulo comercial em
   * `companies.plan`. Nenhuma regra de acesso volta a lê-lo.
   *
   * Omitido → `basico`, que é o produto manual de hoje e não concede capability
   * nenhuma. Validação de ENTRADA (recusar um plano que não vendemos), não
   * decisão de acesso.
   */
  @IsOptional()
  @IsString()
  @IsIn([...PLAN_NAMES])
  plan?: string = DEFAULT_PLAN;
}
