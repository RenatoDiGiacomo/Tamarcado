import {
  capabilitiesForPlan,
  DEFAULT_PLAN,
  isKnownPlan,
  PLAN_NAMES,
  PRESERVE_CURRENT_ACCESS,
  presetsAreWellFormed,
} from "./capability-presets";
import { CAPABILITY_KEYS } from "../../common/capabilities/capability";

describe("capability-presets — o plano é PRESET, não decisão (DL-072)", () => {
  it("todo preset só cita capabilities que o código sabe gatear", () => {
    expect(presetsAreWellFormed()).toBe(true);
  });

  it("o Básico não concede capability nenhuma (é o produto manual de hoje)", () => {
    expect(capabilitiesForPlan("basico")).toEqual([]);
  });

  it("o Pró concede as duas metades do WhatsApp", () => {
    expect(capabilitiesForPlan("pro")).toEqual([
      "whatsapp_bot",
      "lembrete_automatico",
    ]);
  });

  it("plano desconhecido não concede nada (falha fechado)", () => {
    expect(capabilitiesForPlan("enterprise")).toEqual([]);
    expect(capabilitiesForPlan("")).toEqual([]);
  });

  it("isKnownPlan valida ENTRADA (não decide acesso)", () => {
    expect(PLAN_NAMES.every(isKnownPlan)).toBe(true);
    expect(isKnownPlan("enterprise")).toBe(false);
  });

  it("o plano padrão é o de quem não escolheu nada", () => {
    expect(isKnownPlan(DEFAULT_PLAN)).toBe(true);
    expect(capabilitiesForPlan(DEFAULT_PLAN)).toEqual([]);
  });

  it("PRESERVE_CURRENT_ACCESS é vazio — ninguém perde nem GANHA na virada", () => {
    // Vazio porque, na virada, NENHUM recurso em produção é gateado por
    // capability. Conceder o Pró a todos aqui daria acesso que ninguém tinha.
    expect(PRESERVE_CURRENT_ACCESS).toEqual([]);
  });

  it("as capabilities do primeiro momento são as duas do DL-072", () => {
    // Separadas de propósito: são as duas metades que se vendem sozinhas.
    expect([...CAPABILITY_KEYS]).toEqual([
      "whatsapp_bot",
      "lembrete_automatico",
    ]);
  });
});
