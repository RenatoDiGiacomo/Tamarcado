import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

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
}
