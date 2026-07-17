import {
  dayOfWeekOfLocalDate,
  timeToMinutes,
  minutesToTime,
  zonedWallTimeToUtc,
  utcToZonedParts,
  addDays,
} from "./tz.util";

const SP = "America/Sao_Paulo"; // UTC-3, sem DST hoje

describe("tz.util", () => {
  it("dayOfWeekOfLocalDate: âncora conhecida (2000-01-01 = sábado)", () => {
    expect(dayOfWeekOfLocalDate("2000-01-01")).toBe(6);
    // 2026-07-20 é segunda-feira.
    expect(dayOfWeekOfLocalDate("2026-07-20")).toBe(1);
  });

  it("timeToMinutes / minutesToTime", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("09:30:00")).toBe(570);
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(570)).toBe("09:30");
  });

  it("zonedWallTimeToUtc: 09:00 em SP (UTC-3) → 12:00Z", () => {
    const utc = zonedWallTimeToUtc("2026-07-20", timeToMinutes("09:00"), SP);
    expect(utc.toISOString()).toBe("2026-07-20T12:00:00.000Z");
  });

  it("zonedWallTimeToUtc: em UTC o wall-time é o próprio UTC", () => {
    const utc = zonedWallTimeToUtc("2026-07-20", timeToMinutes("09:00"), "UTC");
    expect(utc.toISOString()).toBe("2026-07-20T09:00:00.000Z");
  });

  it("utcToZonedParts: 12:00Z em SP → 2026-07-20 09:00", () => {
    const { dateStr, minutesOfDay } = utcToZonedParts(
      new Date("2026-07-20T12:00:00.000Z"),
      SP,
    );
    expect(dateStr).toBe("2026-07-20");
    expect(minutesOfDay).toBe(timeToMinutes("09:00"));
  });

  it("round-trip wall→utc→wall preserva o horário local", () => {
    const utc = zonedWallTimeToUtc("2026-12-25", timeToMinutes("14:15"), SP);
    const back = utcToZonedParts(utc, SP);
    expect(back.dateStr).toBe("2026-12-25");
    expect(back.minutesOfDay).toBe(timeToMinutes("14:15"));
  });

  it("addDays cruza fim de mês", () => {
    expect(addDays("2026-07-30", 3)).toBe("2026-08-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
