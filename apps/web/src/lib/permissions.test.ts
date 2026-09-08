import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../auth/AuthContext";
import { canViewModule, hasCapability } from "./permissions";

/**
 * Story 6.11 (DL-072) — os DOIS eixos, no front, não podem virar um só.
 *
 * `canViewModule` é por PESSOA (DL-062) e o `owner` passa sempre.
 * `hasCapability` é por EMPRESA e o `owner` NÃO passa por cima — papel não
 * compra recurso. Isto aqui é espelho de UX; a segurança é o 403 do backend.
 */
function usuario(patch: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "1",
    companyId: "1",
    name: "Dona",
    email: "dona@salao.dev",
    accessLevel: "professional",
    attendsClients: true,
    theme: "light",
    canViewFinanceiro: false,
    canViewDashboard: false,
    canViewEquipe: false,
    canManageAllAppointments: false,
    companyCapabilities: [],
    ...patch,
  };
}

describe("hasCapability — o DIREITO da empresa (DL-072)", () => {
  it("false sem usuário", () => {
    expect(hasCapability(null, "whatsapp_bot")).toBe(false);
  });

  it("true quando a empresa contratou o recurso", () => {
    const user = usuario({ companyCapabilities: ["whatsapp_bot"] });
    expect(hasCapability(user, "whatsapp_bot")).toBe(true);
  });

  it("false para o recurso que a empresa NÃO contratou", () => {
    const user = usuario({ companyCapabilities: ["whatsapp_bot"] });
    // As duas metades se vendem separadas: ter o bot não dá o lembrete.
    expect(hasCapability(user, "lembrete_automatico")).toBe(false);
  });

  it("o OWNER não passa por cima da capability (≠ canViewModule)", () => {
    const dono = usuario({ accessLevel: "owner", companyCapabilities: [] });
    expect(hasCapability(dono, "whatsapp_bot")).toBe(false);
    // ...enquanto no eixo de MÓDULO ele passa sempre.
    expect(canViewModule(dono, "financeiro")).toBe(true);
  });

  it("os eixos são independentes nas quatro combinações", () => {
    const temTudo = usuario({
      canViewFinanceiro: true,
      companyCapabilities: ["whatsapp_bot"],
    });
    const soCapability = usuario({ companyCapabilities: ["whatsapp_bot"] });
    const soModulo = usuario({ canViewFinanceiro: true });
    const nada = usuario();

    expect([
      hasCapability(temTudo, "whatsapp_bot") &&
        canViewModule(temTudo, "financeiro"),
      hasCapability(soCapability, "whatsapp_bot") &&
        canViewModule(soCapability, "financeiro"),
      hasCapability(soModulo, "whatsapp_bot") &&
        canViewModule(soModulo, "financeiro"),
      hasCapability(nada, "whatsapp_bot") && canViewModule(nada, "financeiro"),
    ]).toEqual([true, false, false, false]);
  });

  it("resposta antiga sem o campo não quebra a tela (trata como não contratado)", () => {
    // Backend velho / cache de resposta: falha FECHADO, sem estourar.
    const legado = { ...usuario(), companyCapabilities: undefined } as unknown as CurrentUser;
    expect(hasCapability(legado, "whatsapp_bot")).toBe(false);
  });
});
