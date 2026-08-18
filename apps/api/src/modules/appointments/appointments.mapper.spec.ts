import type { Actor } from "../auth/actor.decorator";
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
    payment_status: null,
    payment_amount: null,
    payment_method: null,
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

describe("toAppointmentView — pagamento (Story 5.2, corte de valor DL-062)", () => {
  const paid = row({
    payment_status: "pago",
    payment_amount: "50.00",
    payment_method: "pix",
  });

  it("SEM Financeiro (includePayment=false): `payment` NEM entra no payload", () => {
    const v = toAppointmentView(paid, TZ, false);
    expect("payment" in v).toBe(false);
  });

  it("COM Financeiro: expõe status/valor/forma", () => {
    const v = toAppointmentView(paid, TZ, true);
    expect(v.payment).toEqual({ status: "pago", amount: 50, method: "pix" });
  });

  it("COM Financeiro, sem pagamento registrado: `payment` = null", () => {
    const v = toAppointmentView(row(), TZ, true);
    expect(v.payment).toBeNull();
  });
});

describe("roleScope (FR-D2/DL-022, revisado DL-062)", () => {
  const base: Actor = {
    userId: "7",
    companyId: "1",
    accessLevel: "professional",
    canManageAll: false,
    canViewFinanceiro: false,
  };

  it("quem gerencia a equipe vê todos (sem filtro) — owner", () => {
    expect(
      roleScope({ ...base, accessLevel: "owner", canManageAll: true }),
    ).toBeUndefined();
  });

  it("Profissional COM o flag vê todos (sem filtro)", () => {
    expect(roleScope({ ...base, canManageAll: true })).toBeUndefined();
  });

  it("Profissional SEM o flag: por padrão inclui os NÃO ATRIBUÍDOS (agenda)", () => {
    expect(roleScope({ ...base, canManageAll: false, userId: "7" })).toEqual({
      professionalId: "7",
      includeUnassigned: true,
    });
  });

  it("includeUnassigned=false (pendentes/histórico): SÓ os do profissional", () => {
    expect(roleScope({ ...base, canManageAll: false, userId: "7" }, false)).toEqual({
      professionalId: "7",
      includeUnassigned: false,
    });
  });
});
