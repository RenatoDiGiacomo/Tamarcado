import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * Edição da identidade visual da instalação (AC1). Logo é URL no MVP (DL-034 —
 * upload self-service é futuro). Cor primária em hex `#RRGGBB`.
 */
export class UpdateInstallationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "primaryColor deve ser hex #RRGGBB",
  })
  primaryColor?: string;
}
