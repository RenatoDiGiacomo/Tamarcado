import type { Actor } from "../auth/actor.decorator";
import type {
  AppointmentSource,
  AppointmentStatus,
} from "../../database/entities/appointment.entity";
import type {
  PaymentMethod,
  PaymentStatus,
} from "../../database/entities/payment.entity";
import { minutesToTime, utcToZonedParts } from "../availability/tz.util";

/** Linha crua vinda do join appointments×clients×salon_services×users×payments. */
export interface RawAppointmentRow {
  id: string;
  client_id: string;
  scheduled_at: Date;
  duration_minutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  service_id: string;
  professional_id: string | null;
  client_name: string | null;
  service_name: string | null;
  professional_name: string | null;
  price_snapshot: string | null;
  // Pagamento (Story 5.2) — via LEFT JOIN; null quando não há registro.
  payment_status: PaymentStatus | null;
  payment_amount: string | null;
  payment_method: PaymentMethod | null;
}

/** Pagamento exposto na view — SÓ para quem tem o módulo Financeiro (DL-062). */
export interface PaymentSummary {
  status: PaymentStatus;
  amount: number;
  method: PaymentMethod | null;
}

/**
 * Item da listagem da agenda (Story 3.2). Horário já no fuso do tenant; a tela
 * deriva `weekday` de `date` e mapeia `status`→StatusChip / `source`→origem.
 * Mantém `status`/`source` crus (o backend não conhece os rótulos do front).
 */
export interface AppointmentView {
  id: string;
  /** Id da cliente — permite ir da agenda ao perfil dela (DL-066). Não é valor. */
  clientId: string;
  clientName: string;
  serviceId: string; // 3.5: o modal busca quem executa este serviço (GET /services/:id/professionals)
  serviceName: string;
  professionalId: string | null; // 3.5: pré-seleciona o profissional atual no select
  professionalName: string | null;
  date: string; // YYYY-MM-DD (fuso do tenant)
  start: string; // HH:MM
  end: string; // HH:MM
  status: AppointmentStatus;
  source: AppointmentSource;
  /**
   * Preço do serviço no agendamento (`price_snapshot`, DL-038). Também é VALOR —
   * só entra para quem tem Financeiro (`includePayment`). Serve para
   * PRÉ-PREENCHER o "Valor recebido" (Story 5.2). `null` = serviço sob consulta.
   */
  price?: number | null;
  /**
   * Pagamento (Story 5.2). SÓ presente para quem tem o módulo Financeiro
   * (`includePayment`); ausente do payload para os demais (corte de VALOR,
   * DL-062). `null` = tem acesso, mas o agendamento ainda não tem pagamento.
   */
  payment?: PaymentSummary | null;
}

/**
 * Converte uma linha crua (UTC) para a visão da agenda no fuso do tenant.
 * `scheduled_at` está em UTC (ADR-008); `end` = início + `duration_minutes`.
 * `includePayment` (DL-062): quando `true` (usuário com Financeiro), inclui o
 * pagamento; quando `false`, o campo `payment` **nem entra** no objeto — o valor
 * não trafega. Função pura — todo o cálculo de fuso passa por aqui (unit-testável).
 */
export function toAppointmentView(
  row: RawAppointmentRow,
  timeZone: string,
  includePayment = false,
): AppointmentView {
  const { dateStr, minutesOfDay } = utcToZonedParts(row.scheduled_at, timeZone);
  const view: AppointmentView = {
    id: String(row.id),
    clientId: String(row.client_id),
    clientName: row.client_name ?? "",
    serviceId: String(row.service_id),
    serviceName: row.service_name ?? "",
    professionalId: row.professional_id != null ? String(row.professional_id) : null,
    professionalName: row.professional_name ?? null,
    date: dateStr,
    start: minutesToTime(minutesOfDay),
    end: minutesToTime(minutesOfDay + row.duration_minutes),
    status: row.status,
    source: row.source,
  };
  if (includePayment) {
    view.price = row.price_snapshot != null ? Number(row.price_snapshot) : null;
    view.payment =
      row.payment_status != null
        ? {
            status: row.payment_status,
            amount: Number(row.payment_amount),
            method: row.payment_method,
          }
        : null;
  }
  return view;
}

/** Recorte por profissional aplicado no repositório. */
export interface ProfessionalScope {
  professionalId: string;
  /** `true` inclui os NÃO ATRIBUÍDOS (`professional_id IS NULL`); `false` = só os do profissional. */
  includeUnassigned: boolean;
}

/**
 * Escopo de visibilidade por papel (FR-D2/DL-022, revisado DL-062): quem
 * gerencia a agenda de toda a equipe (`owner` ou `can_manage_all_appointments`)
 * vê todos (retorna `undefined` = sem filtro); quem NÃO gerencia vê só os
 * próprios. `includeUnassigned` decide se os NÃO ATRIBUÍDOS entram junto:
 * - **agenda** (listByPeriod): `true` — o profissional vê os próprios + os livres;
 * - **pendentes e histórico da cliente** (refinamento 2026-08-14): `false` —
 *   só os DELE; não atribuído fica só para quem gerencia a equipe.
 */
export function roleScope(
  user: Actor,
  includeUnassigned = true,
): ProfessionalScope | undefined {
  return user.canManageAll
    ? undefined
    : { professionalId: user.userId, includeUnassigned };
}
