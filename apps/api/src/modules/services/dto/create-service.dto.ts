import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/** Criação de serviço (AC2). `price` é OPCIONAL (DL-030). */
export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  duration_minutes!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  /** Descrição curta na página pública (1ª leva do redesenho). */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;
}
