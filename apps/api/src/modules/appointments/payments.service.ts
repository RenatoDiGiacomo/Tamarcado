import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import {
  Payment,
  type PaymentMethod,
  type PaymentStatus,
} from "../../database/entities/payment.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { Actor } from "../auth/actor.decorator";
import { RegisterPaymentDto } from "./dto/register-payment.dto";

export interface PaymentView {
  status: PaymentStatus;
  amount: number;
  method: PaymentMethod | null;
}

export function toPaymentView(p: Payment): PaymentView {
  return {
    status: p.status,
    amount: Number(p.amount),
    method: p.method,
  };
}

/**
 * Pagamentos por agendamento (Story 5.2). UM por agendamento (upsert). Acesso é
 * do módulo Financeiro (DL-062) — enforçado no controller (`@RequireModule`). O
 * `status` do pagamento é próprio: registrar `pendente` NÃO mexe no status do
 * agendamento (a marcação de comparecimento segue pela 3.7).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    private readonly tenant: TenantContextService,
  ) {}

  /** Cria ou atualiza (upsert) o pagamento do agendamento, tenant-scoped. */
  async register(
    appointmentId: string,
    dto: RegisterPaymentDto,
    actor: Actor,
  ): Promise<PaymentView> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointments.findOne({
      where: { id: appointmentId, company_id: companyId },
    });
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    let payment = await this.payments.findOne({
      where: { company_id: companyId, appointment_id: appointmentId },
    });
    if (!payment) {
      payment = this.payments.create({
        company_id: companyId,
        appointment_id: appointmentId,
        created_by_user_id: actor.userId,
      });
    }
    payment.amount = dto.amount.toFixed(2);
    payment.method = dto.method ?? null;
    payment.status = dto.status;
    return toPaymentView(await this.payments.save(payment));
  }
}
