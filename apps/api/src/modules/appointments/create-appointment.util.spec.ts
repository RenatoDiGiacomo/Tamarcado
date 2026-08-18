import type { Actor } from "../auth/actor.decorator";
import { isPastCivilDate, resolveProfessionalId } from "./create-appointment.util";

const TZ = "America/Sao_Paulo"; // UTC-3

function user(over: Partial<Actor> = {}): Actor {
  return {
    userId: "7",
    companyId: "1",
    accessLevel: "owner",
    canManageAll: true,
    canViewFinanceiro: true,
    ...over,
  };
}

describe("resolveProfessionalId (FR-D2/DL-009, revisado DL-062)", () => {
  it("SEM o flag (Gestão restrita) sempre cria para si (ignora o body)", () => {
    const restrito = { accessLevel: "professional" as const, canManageAll: false, userId: "7" };
    expect(resolveProfessionalId(user(restrito), "99")).toBe("7");
    expect(resolveProfessionalId(user(restrito), null)).toBe("7");
  });

  it("COM o flag (ou owner) usa o escolhido", () => {
    expect(resolveProfessionalId(user({ accessLevel: "owner", canManageAll: true }), "42")).toBe("42");
    expect(
      resolveProfessionalId(user({ accessLevel: "professional", canManageAll: true }), "42"),
    ).toBe("42");
  });

  it("gerenciando a equipe, sem escolha → não atribuído (null)", () => {
    expect(resolveProfessionalId(user({ canManageAll: true }), null)).toBeNull();
    expect(resolveProfessionalId(user({ canManageAll: true }), undefined)).toBeNull();
  });
});

describe("isPastCivilDate (AC4)", () => {
  const now = new Date("2026-07-20T12:00:00Z"); // 09:00 SP, 2026-07-20

  it("ontem é passado", () => {
    expect(isPastCivilDate(new Date("2026-07-19T12:00:00Z"), now, TZ)).toBe(true);
  });

  it("mais cedo no MESMO dia não é passado (compara só a data)", () => {
    // 06:00 SP do mesmo dia (09:00Z) — antes do 'now' em horário, mas mesma data.
    expect(isPastCivilDate(new Date("2026-07-20T09:00:00Z"), now, TZ)).toBe(false);
  });

  it("amanhã não é passado", () => {
    expect(isPastCivilDate(new Date("2026-07-21T12:00:00Z"), now, TZ)).toBe(false);
  });

  it("respeita o fuso na virada do dia", () => {
    // 2026-07-20T02:00Z = 2026-07-19 23:00 SP → data civil 07-19 (passado vs 07-20).
    expect(isPastCivilDate(new Date("2026-07-20T02:00:00Z"), now, TZ)).toBe(true);
  });
});
