import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CapabilityGuard } from "./capability.guard";
import { REQUIRE_CAPABILITY_KEY } from "../../../common/decorators/require-capability.decorator";
import type { CapabilitiesService } from "../../capabilities/capabilities.service";
import type { User } from "../../../database/entities/user.entity";

function contextWith(currentUser?: Partial<User>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ currentUser }) }),
    getHandler: () => function handler() {},
    getClass: () => class Klass {},
  } as unknown as ExecutionContext;
}

function guardWith(
  required: string | undefined,
  has: boolean,
): { guard: CapabilityGuard; hasCapability: jest.Mock } {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === REQUIRE_CAPABILITY_KEY ? required : undefined,
  } as unknown as Reflector;
  const hasCapability = jest.fn().mockResolvedValue(has);
  const capabilities = { hasCapability } as unknown as CapabilitiesService;
  return { guard: new CapabilityGuard(reflector, capabilities), hasCapability };
}

describe("CapabilityGuard — camada 2 do DL-072 (Story 6.11)", () => {
  it("libera a rota que não declara @RequireCapability (não é gateada)", async () => {
    const { guard, hasCapability } = guardWith(undefined, false);
    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
    // Não gastou query: rota sem gate não consulta capability.
    expect(hasCapability).not.toHaveBeenCalled();
  });

  it("libera quando a EMPRESA tem a capability", async () => {
    const { guard, hasCapability } = guardWith("whatsapp_bot", true);
    await expect(
      guard.canActivate(
        contextWith({ company_id: "7", access_level: "professional" }),
      ),
    ).resolves.toBe(true);
    // Lê pela EMPRESA da linha fresca — nunca pelo token.
    expect(hasCapability).toHaveBeenCalledWith("7", "whatsapp_bot");
  });

  it("403 quando a empresa NÃO tem a capability", async () => {
    const { guard } = guardWith("whatsapp_bot", false);
    await expect(
      guard.canActivate(contextWith({ company_id: "7" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("o OWNER não passa por cima: papel não compra recurso (≠ ModuleGuard)", async () => {
    // Diferença central para o ModuleGuard (DL-062), onde `owner` passa sempre:
    // ali é permissão INTERNA da equipe; aqui é o que a EMPRESA comprou.
    const { guard } = guardWith("whatsapp_bot", false);
    await expect(
      guard.canActivate(contextWith({ company_id: "7", access_level: "owner" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("nega quando não há linha fresca (ActiveUserGuard ausente na rota)", async () => {
    const { guard } = guardWith("whatsapp_bot", true);
    await expect(guard.canActivate(contextWith(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("a mensagem do 403 não vende nem cita preço (quem vende é a tela)", async () => {
    const { guard } = guardWith("whatsapp_bot", false);
    await expect(
      guard.canActivate(contextWith({ company_id: "7" })),
    ).rejects.toThrow("Recurso não contratado");
  });
});
