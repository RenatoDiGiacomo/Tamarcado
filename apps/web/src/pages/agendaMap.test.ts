import { describe, it, expect } from "vitest";
import {
  formatDateLabel,
  mapOrigin,
  mapStatus,
  mondayOf,
  periodRange,
  shiftAnchor,
  toAgendaAppointment,
  weekdayMon,
  type ApiAppointment,
} from "./agendaMap";

function item(over: Partial<ApiAppointment> = {}): ApiAppointment {
  return {
    id: "1",
    clientName: "Maria",
    serviceId: "3",
    serviceName: "Corte",
    professionalId: "7",
    professionalName: "Ana",
    date: "2026-07-20", // segunda
    start: "09:00",
    end: "10:00",
    status: "confirmed",
    source: "manual",
    ...over,
  };
}

describe("mapStatus", () => {
  it("mapeia completed→done e no_show→noshow", () => {
    expect(mapStatus("completed")).toBe("done");
    expect(mapStatus("no_show")).toBe("noshow");
  });
  it("mantém os que já batem", () => {
    expect(mapStatus("pending")).toBe("pending");
    expect(mapStatus("confirmed")).toBe("confirmed");
    expect(mapStatus("cancelled")).toBe("cancelled");
  });
});

describe("mapOrigin", () => {
  it("whatsapp é balão; manual/app são lápis", () => {
    expect(mapOrigin("whatsapp")).toBe("whatsapp");
    expect(mapOrigin("manual")).toBe("manual");
    expect(mapOrigin("app")).toBe("manual");
  });
});

describe("weekdayMon (0=Seg..6=Dom)", () => {
  it("segunda 2026-07-20 → 0", () => {
    expect(weekdayMon("2026-07-20")).toBe(0);
  });
  it("domingo 2026-07-26 → 6", () => {
    expect(weekdayMon("2026-07-26")).toBe(6);
  });
  it("sábado 2026-07-25 → 5", () => {
    expect(weekdayMon("2026-07-25")).toBe(5);
  });
});

describe("toAgendaAppointment", () => {
  it("converte item da API no formato da casca", () => {
    const a = toAgendaAppointment(
      item({ status: "no_show", source: "whatsapp", date: "2026-07-22" }),
    );
    expect(a).toEqual({
      id: "1",
      clientName: "Maria",
      serviceName: "Corte",
      start: "09:00",
      end: "10:00",
      status: "noshow",
      origin: "whatsapp",
      professionalName: "Ana",
      weekday: 2, // quarta
    });
  });
  it("preserva professionalName null", () => {
    const a = toAgendaAppointment(item({ professionalName: null }));
    expect(a.professionalName).toBeNull();
  });
});

describe("periodRange", () => {
  it("dia → from=to=âncora", () => {
    expect(periodRange("2026-07-22", "dia")).toEqual({
      from: "2026-07-22",
      to: "2026-07-22",
    });
  });
  it("semana → segunda a domingo da semana da âncora", () => {
    // quarta 2026-07-22 → semana 20 (seg) a 26 (dom)
    expect(periodRange("2026-07-22", "semana")).toEqual({
      from: "2026-07-20",
      to: "2026-07-26",
    });
  });
});

describe("mondayOf", () => {
  it("segunda mapeia para ela mesma", () => {
    expect(mondayOf("2026-07-20")).toBe("2026-07-20");
  });
  it("domingo cai na segunda anterior", () => {
    expect(mondayOf("2026-07-26")).toBe("2026-07-20");
  });
});

describe("shiftAnchor", () => {
  it("dia move ±1 dia", () => {
    expect(shiftAnchor("2026-07-20", "dia", 1)).toBe("2026-07-21");
    expect(shiftAnchor("2026-07-20", "dia", -1)).toBe("2026-07-19");
  });
  it("semana move ±7 dias", () => {
    expect(shiftAnchor("2026-07-20", "semana", 1)).toBe("2026-07-27");
    expect(shiftAnchor("2026-07-20", "semana", -1)).toBe("2026-07-13");
  });
  it("atravessa a virada do mês", () => {
    expect(shiftAnchor("2026-07-31", "dia", 1)).toBe("2026-08-01");
  });
});

describe("formatDateLabel", () => {
  it("dia → 'Seg, 20/07'", () => {
    expect(formatDateLabel("2026-07-20", "dia")).toBe("Seg, 20/07");
  });
  it("semana → '20/07 – 26/07'", () => {
    expect(formatDateLabel("2026-07-22", "semana")).toBe("20/07 – 26/07");
  });
});
