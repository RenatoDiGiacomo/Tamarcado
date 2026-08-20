import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Registro de uma SAÍDA (pagamento à equipe) — Story 5.10. Data do pagamento
 * (`paidOn`, entra no período do Financeiro) e o período a que se refere
 * (`periodFrom/To`, o previsão→real). O `IsIn` do DATE_RE via @Matches.
 */
export class RegisterTeamPaymentDto {
  @IsString()
  professionalId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @Matches(DATE_RE, { message: "paidOn deve ser YYYY-MM-DD" })
  paidOn!: string;

  @Matches(DATE_RE, { message: "periodFrom deve ser YYYY-MM-DD" })
  periodFrom!: string;

  @Matches(DATE_RE, { message: "periodTo deve ser YYYY-MM-DD" })
  periodTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
