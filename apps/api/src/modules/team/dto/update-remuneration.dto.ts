import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

/** Comissão de UM serviço do profissional (escopo por serviço). */
export class ServiceCommissionInput {
  @IsString()
  serviceId!: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsIn(["percent", "fixed"])
  kind?: "percent" | "fixed" | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number | null;
}

/**
 * Edição da remuneração de um membro (Story 5.9), só pelo Dono. Salário fixo
 * (valor + cadência) e comissão (por profissional OU por serviço) coexistem.
 */
export class UpdateRemunerationDto {
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryAmount?: number | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsIn(["daily", "weekly", "monthly"])
  salaryCadence?: "daily" | "weekly" | "monthly" | null;

  @IsIn(["none", "professional", "service"])
  commissionScope!: "none" | "professional" | "service";

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsIn(["percent", "fixed"])
  commissionKind?: "percent" | "fixed" | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  commissionValue?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceCommissionInput)
  serviceCommissions?: ServiceCommissionInput[];
}
