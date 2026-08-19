import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import {
  Payment,
  type PaymentMethod,
  type PaymentStatus,
} from "../../database/entities/payment.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import {
  addDays,
  utcToZonedParts,
  zonedWallTimeToUtc,
} from "../availability/tz.util";
import type { Actor } from "../auth/actor.decorator";
import { RegisterPaymentDto } from "./dto/register-payment.dto";

export interface PaymentView {
  status: PaymentStatus;
  amount: number;
  method: PaymentMethod | null;
}

/** Um recebimento na lista do Financeiro (Story 5.3): pagamento + dados do atendimento. */
export interface Receipt {
  appointmentId: string;
  clientId: string | null;
  clientName: string;
  serviceName: string;
  date: string; // YYYY-MM-DD (fuso do tenant)
  amount: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
}

export interface ReceiptsView {
  receipts: Receipt[];
  totalReceived: number; // soma dos `pago`
  totalPending: number; // soma dos `pendente`
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
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Recebimentos de um período (Story 5.3) — pagamentos dos agendamentos com
   * `scheduled_at` em `[from, to]` (datas civis do tenant), mais recentes
   * primeiro, com os TOTAIS recebido (pago) e pendente. Acesso do módulo
   * Financeiro (gate no controller). Tenant-scoped por `company_id`.
   */
  async listReceipts(from: string, to: string): Promise<ReceiptsView> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const startUtc = zonedWallTimeToUtc(from, 0, tz);
    const endUtc = zonedWallTimeToUtc(addDays(to, 1), 0, tz); // `to` inclusivo

    const rows = await this.payments
      .createQueryBuilder("p")
      .innerJoin(
        "appointments",
        "a",
        "a.id = p.appointment_id AND a.company_id = p.company_id",
      )
      .leftJoin("clients", "c", "c.id = a.client_id AND c.company_id = a.company_id")
      .leftJoin(
        "salon_services",
        "s",
        "s.id = a.service_id AND s.company_id = a.company_id",
      )
      .select("p.appointment_id", "appointment_id")
      .addSelect("p.amount", "amount")
      .addSelect("p.method", "method")
      .addSelect("p.status", "status")
      .addSelect("a.scheduled_at", "scheduled_at")
      .addSelect("a.client_id", "client_id")
      .addSelect("c.name", "client_name")
      .addSelect("s.name", "service_name")
      .where("p.company_id = :companyId", { companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .orderBy("a.scheduled_at", "DESC")
      .getRawMany<{
        appointment_id: string;
        amount: string;
        method: PaymentMethod | null;
        status: PaymentStatus;
        scheduled_at: Date;
        client_id: string | null;
        client_name: string | null;
        service_name: string | null;
      }>();

    const receipts: Receipt[] = rows.map((r) => ({
      appointmentId: String(r.appointment_id),
      clientId: r.client_id != null ? String(r.client_id) : null,
      clientName: r.client_name ?? "",
      serviceName: r.service_name ?? "",
      date: utcToZonedParts(r.scheduled_at, tz).dateStr,
      amount: Number(r.amount),
      method: r.method,
      status: r.status,
    }));
    const sum = (s: PaymentStatus): number =>
      receipts.filter((r) => r.status === s).reduce((acc, r) => acc + r.amount, 0);
    return {
      receipts,
      totalReceived: sum("pago"),
      totalPending: sum("pendente"),
    };
  }

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
