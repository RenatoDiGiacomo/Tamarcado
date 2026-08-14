import type { Actor } from "../auth/actor.decorator";
import type {
  AppointmentSource,
  AppointmentStatus,
} from "../../database/entities/appointment.entity";
import { minutesToTime, utcToZonedParts } from "../availability/tz.util";

/** Linha crua vinda do join appointments×clients×salon_services×users. */
export interface RawAppointmentRow {
  id: string;
  scheduled_at: Date;
  duration_minutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  service_id: string;
  professional_id: string | null;
  client_name: string | null;
  service_name: string | null;
  professional_name: string | null;
}

/**
 * Item da listagem da agenda (Story 3.2). Horário já no fuso do tenant; a tela
 * deriva `weekday` de `date` e mapeia `status`→StatusChip / `source`→origem.
 * Mantém `status`/`source` crus (o backend não conhece os rótulos do front).
 */
export interface AppointmentView {
  id: string;
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
}

/**
 * Converte uma linha crua (UTC) para a visão da agenda no fuso do tenant.
 * `scheduled_at` está em UTC (ADR-008); `end` = início + `duration_minutes`.
 * Função pura — todo o cálculo de fuso passa por aqui (unit-testável).
 */
export function toAppointmentView(
  row: RawAppointmentRow,
  timeZone: string,
): AppointmentView {
  const { dateStr, minutesOfDay } = utcToZonedParts(row.scheduled_at, timeZone);
  return {
    id: String(row.id),
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
}

/**
 * Escopo de visibilidade por papel (FR-D2/DL-022, revisado DL-062): quem
 * gerencia a agenda de toda a equipe (`owner` ou `can_manage_all_appointments`)
 * vê todos (retorna `undefined` = sem filtro); quem NÃO gerencia vê só os
 * próprios agendamentos e os não atribuídos (`professional_id = self OR NULL`).
 */
export function roleScope(
  user: Actor,
): { professionalId: string } | undefined {
  return user.canManageAll ? undefined : { professionalId: user.userId };
}
