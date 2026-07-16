import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/** Edição de serviço (AC2): nome/duração/preço/ativo. Tudo opcional (PATCH). */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration_minutes?: number;

  // null limpa o preço (DL-030); IsOptional aceita null e pula as demais regras.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
