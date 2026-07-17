import type { AuthUser } from "../auth/auth-user";
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
  serviceName: string;
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
    serviceName: row.service_name ?? "",
    professionalName: row.professional_name ?? null,
    date: dateStr,
    start: minutesToTime(minutesOfDay),
    end: minutesToTime(minutesOfDay + row.duration_minutes),
    status: row.status,
    source: row.source,
  };
}

/**
 * Escopo de visibilidade por papel (FR-D2/DL-022): `owner`/`manager` veem todos
 * (retorna `undefined` = sem filtro); `basic` vê só os próprios agendamentos e os
 * não atribuídos (`professional_id = self OR professional_id IS NULL`).
 */
export function roleScope(
  user: AuthUser,
): { professionalId: string } | undefined {
  return user.accessLevel === "basic"
    ? { professionalId: user.userId }
    : undefined;
}
