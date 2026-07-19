import { noSlotsReason } from "./availability.service";

describe("noSlotsReason", () => {
  it("sem nenhum horário configurado → no_schedule_config", () => {
    expect(
      noSlotsReason({ hasAnySchedule: false, hasTodaySchedule: false }),
    ).toBe("no_schedule_config");
  });

  it("tem horários, mas não nesse dia → day_off", () => {
    expect(
      noSlotsReason({ hasAnySchedule: true, hasTodaySchedule: false }),
    ).toBe("day_off");
  });

  it("atende nesse dia mas está lotado → full", () => {
    expect(
      noSlotsReason({ hasAnySchedule: true, hasTodaySchedule: true }),
    ).toBe("full");
  });
});
