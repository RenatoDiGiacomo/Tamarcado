import { IsIn, IsNumber, IsOptional, Min } from "class-validator";
import type {
  PaymentMethod,
  PaymentStatus,
} from "../../../database/entities/payment.entity";

/**
 * Registro de pagamento de um agendamento (Story 5.2). `amount` obrigatório
 * (≥ 0, até 2 casas); `method` OPCIONAL (dropdown de 5 opções); `status`
 * (`pago`/`pendente`) é o dado próprio do pagamento.
 */
export class RegisterPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsIn(["dinheiro", "pix", "debito", "credito", "outro"])
  method?: PaymentMethod;

  @IsIn(["pago", "pendente"])
  status!: PaymentStatus;
}
