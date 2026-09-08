import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  CapabilityRequiredException,
  ModuleAccessDeniedException,
  RoleAccessDeniedException,
  type ForbiddenBody,
} from "./forbidden-reason";

/**
 * Story 6.15 — os três 403 do sistema precisam chegar DISTINGUÍVEIS ao front.
 *
 * O front não pode adivinhar o motivo pelo texto da mensagem nem pela rota:
 * texto muda no primeiro ajuste de copy, e rota não diz nada sobre o porquê.
 * A informação vem no campo `reason` do corpo.
 */
describe("403 marcado por motivo (Story 6.15, DL-072 + DL-062)", () => {
  it("capability: reason `capability` e a chave do recurso, para a tela vender", () => {
    const body = new CapabilityRequiredException(
      "whatsapp_bot",
    ).getResponse() as ForbiddenBody;
    expect(body.statusCode).toBe(403);
    expect(body.reason).toBe("capability");
    expect(body.capability).toBe("whatsapp_bot");
  });

  it("módulo: reason `module` e o módulo — NUNCA a chave de capability", () => {
    const body = new ModuleAccessDeniedException(
      "financeiro",
    ).getResponse() as ForbiddenBody;
    expect(body.reason).toBe("module");
    expect(body.module).toBe("financeiro");
    // Se `capability` vazasse aqui, o front ofereceria plano a quem não compra.
    expect(body.capability).toBeUndefined();
  });

  it("papel: reason `role`, sem capability nem módulo", () => {
    const body = new RoleAccessDeniedException().getResponse() as ForbiddenBody;
    expect(body.reason).toBe("role");
    expect(body.capability).toBeUndefined();
    expect(body.module).toBeUndefined();
  });

  it("os três motivos são distintos entre si (é o ponto da story)", () => {
    const reasons = [
      new CapabilityRequiredException("whatsapp_bot"),
      new ModuleAccessDeniedException("financeiro"),
      new RoleAccessDeniedException(),
    ].map((e) => (e.getResponse() as ForbiddenBody).reason);
    expect(new Set(reasons).size).toBe(3);
  });

  it("nenhuma mensagem cita preço (quem vende é a tela — DL-075)", () => {
    const mensagens = [
      new CapabilityRequiredException("whatsapp_bot"),
      new ModuleAccessDeniedException("financeiro"),
      new RoleAccessDeniedException(),
    ].map((e) => (e.getResponse() as ForbiddenBody).message);
    for (const mensagem of mensagens) {
      expect(mensagem).not.toMatch(/R\$|\d+[,.]\d{2}|reais/i);
    }
  });
});

/**
 * GUARD-RAIL (padrão da casa — DL-027, DL-053, DL-072): um `ForbiddenException`
 * cru num guard é um 403 SEM motivo, e o front volta a mostrá-lo como "Tivemos
 * um problema no servidor" — exatamente o defeito que esta story fecha.
 *
 * Varre os guards e falha se algum lançar `ForbiddenException` diretamente em
 * vez de uma das exceções marcadas.
 */
describe("GUARD-RAIL: nenhum guard lança 403 sem motivo (Story 6.15)", () => {
  const GUARDS_DIR = join(__dirname, "..", "..", "modules", "auth", "guards");

  function arquivosDeGuard(dir: string): string[] {
    return readdirSync(dir)
      .filter((nome) => nome.endsWith(".guard.ts"))
      .map((nome) => join(dir, nome))
      .filter((caminho) => statSync(caminho).isFile());
  }

  it("todos os guards usam as exceções marcadas", () => {
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeGuard(GUARDS_DIR)) {
      const codigo = readFileSync(arquivo, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (/new ForbiddenException\s*\(/.test(codigo)) {
        violacoes.push(relative(GUARDS_DIR, arquivo).split("/").join(sep));
      }
    }
    // Se falhar: troque o `ForbiddenException` cru por
    // `CapabilityRequiredException`, `ModuleAccessDeniedException` ou
    // `RoleAccessDeniedException` (common/errors/forbidden-reason.ts). Se o novo
    // guard barra por um motivo que não é nenhum dos três, acrescente o motivo
    // lá — e trate-o no `ErrorState` do front, senão ele vira "erro de servidor".
    expect(violacoes).toEqual([]);
  });

  it("a varredura enxerga os guards de fato (sanity)", () => {
    // Sem esta âncora, um erro de caminho deixaria o guard-rail cego e verde.
    const nomes = arquivosDeGuard(GUARDS_DIR).map((a) => a.split(sep).pop());
    expect(nomes).toEqual(
      expect.arrayContaining([
        "capability.guard.ts",
        "module.guard.ts",
        "roles.guard.ts",
      ]),
    );
  });
});
