import type { AuthUser } from "../auth/auth-user";
import {
  roleScope,
  toAppointmentView,
  type RawAppointmentRow,
} from "./appointments.mapper";

const TZ = "America/Sao_Paulo"; // UTC-3, sem DST hoje

function row(over: Partial<RawAppointmentRow> = {}): RawAppointmentRow {
  return {
    id: "10",
    // 2026-07-20 09:00 em São Paulo = 12:00Z
    scheduled_at: new Date("2026-07-20T12:00:00Z"),
    duration_minutes: 60,
    status: "confirmed",
    source: "whatsapp",
    service_id: "3",
    professional_id: "7",
    client_name: "Maria",
    service_name: "Corte",
    professional_name: "Ana",
    ...over,
  };
}

describe("toAppointmentView", () => {
  it("converte UTC para o fuso do tenant (data/início/fim)", () => {
    const v = toAppointmentView(row(), TZ);
    expect(v.date).toBe("2026-07-20");
    expect(v.start).toBe("09:00");
    expect(v.end).toBe("10:00"); // +60min
  });

  it("soma a duração ao horário de início para o fim", () => {
    const v = toAppointmentView(row({ duration_minutes: 90 }), TZ);
    expect(v.start).toBe("09:00");
    expect(v.end).toBe("10:30");
  });

  it("mantém status e source crus (a tela mapeia)", () => {
    const v = toAppointmentView(row({ status: "no_show", source: "manual" }), TZ);
    expect(v.status).toBe("no_show");
    expect(v.source).toBe("manual");
  });

  it("preserva null de profissional (não atribuído)", () => {
    const v = toAppointmentView(
      row({ professional_id: null, professional_name: null }),
      TZ,
    );
    expect(v.professionalName).toBeNull();
    expect(v.professionalId).toBeNull();
  });

  it("expõe serviceId e professionalId como string (Story 3.5)", () => {
    const v = toAppointmentView(row(), TZ);
    expect(v.serviceId).toBe("3");
    expect(v.professionalId).toBe("7");
  });

  it("normaliza nomes ausentes de cliente/serviço para string vazia", () => {
    const v = toAppointmentView(
      row({ client_name: null, service_name: null }),
      TZ,
    );
    expect(v.clientName).toBe("");
    expect(v.serviceName).toBe("");
  });

  it("id sempre string (bigint do driver)", () => {
    const v = toAppointmentView(row({ id: 42 as unknown as string }), TZ);
    expect(v.id).toBe("42");
  });

  it("respeita fuso diferente (UTC vira dia anterior tarde)", () => {
    // 2026-07-20 02:00 São Paulo = 05:00Z; em UTC seria 05:00 do mesmo dia,
    // mas no fuso do tenant continua 2026-07-20 02:00.
    const v = toAppointmentView(
      row({ scheduled_at: new Date("2026-07-20T05:00:00Z") }),
      TZ,
    );
    expect(v.date).toBe("2026-07-20");
    expect(v.start).toBe("02:00");
  });
});

describe("roleScope (FR-D2/DL-022)", () => {
  const base: AuthUser = {
    userId: "7",
    companyId: "1",
    accessLevel: "basic",
    attendsClients: true,
    tokenVersion: 0,
  };

  it("owner vê todos (sem filtro)", () => {
    expect(roleScope({ ...base, accessLevel: "owner" })).toBeUndefined();
  });

  it("manager vê todos (sem filtro)", () => {
    expect(roleScope({ ...base, accessLevel: "manager" })).toBeUndefined();
  });

  it("basic limita ao próprio profissional", () => {
    expect(roleScope({ ...base, accessLevel: "basic", userId: "7" })).toEqual({
      professionalId: "7",
    });
  });
});
