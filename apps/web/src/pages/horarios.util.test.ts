import { describe, it, expect } from "vitest";
import {
  buildWeek,
  hasSchedule,
  toPutBody,
  validateWeek,
  type ApiDay,
} from "./horarios.util";

const day = (dow: number, active: boolean, s = "09:00:00", e = "18:00:00"): ApiDay => ({
  dayOfWeek: dow,
  startTime: s,
  endTime: e,
  isActive: active,
});

describe("buildWeek", () => {
  it("reconstrói os 7 dias na ordem Seg→Dom", () => {
    const week = buildWeek([]);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("ausentes viram inativos com default 09:00–18:00", () => {
    const week = buildWeek([day(1, true, "10:00:00", "16:00:00")]);
    const seg = week[0];
    expect(seg).toEqual({ dayOfWeek: 1, active: true, start: "10:00", end: "16:00" });
    const dom = week[6]; // 0 = domingo, ausente
    expect(dom).toEqual({ dayOfWeek: 0, active: false, start: "09:00", end: "18:00" });
  });

  it("trunca HH:MM:SS para HH:MM", () => {
    expect(buildWeek([day(2, true, "08:30:00", "12:45:00")])[1].start).toBe("08:30");
  });
});

describe("toPutBody", () => {
  it("envia os 7 dias + intervalo em snake_case", () => {
    const body = toPutBody(buildWeek([day(1, true)]), 15);
    expect(body.interval_minutes).toBe(15);
    expect(body.days).toHaveLength(7);
    expect(body.days[0]).toEqual({
      day_of_week: 1,
      start_time: "09:00",
      end_time: "18:00",
      is_active: true,
    });
  });
});

describe("validateWeek", () => {
  it("aceita faixas válidas", () => {
    expect(validateWeek(buildWeek([day(1, true, "09:00:00", "18:00:00")]))).toBeNull();
  });
  it("rejeita fim <= início num dia ativo (com o nome do dia)", () => {
    const week = buildWeek([day(3, true, "14:00:00", "14:00:00")]);
    expect(validateWeek(week)).toMatch(/Quarta/);
  });
  it("ignora faixa inválida em dia INATIVO", () => {
    const week = buildWeek([day(3, false, "20:00:00", "08:00:00")]);
    expect(validateWeek(week)).toBeNull();
  });
});

describe("hasSchedule", () => {
  it("true se há ≥1 dia ativo", () => {
    expect(hasSchedule([day(1, false), day(2, true)])).toBe(true);
  });
  it("false se nenhum dia ativo (ou vazio)", () => {
    expect(hasSchedule([])).toBe(false);
    expect(hasSchedule([day(1, false)])).toBe(false);
  });
});
