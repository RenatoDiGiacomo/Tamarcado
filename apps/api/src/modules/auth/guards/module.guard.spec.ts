import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ModuleName } from "../../../common/decorators/require-module.decorator";
import type { User } from "../../../database/entities/user.entity";
import { ModuleGuard } from "./module.guard";

function makeContext(currentUser?: Partial<User>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ currentUser }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(required: ModuleName | undefined): Reflector {
  return {
    getAllAndOverride: (): ModuleName | undefined => required,
  } as unknown as Reflector;
}

describe("ModuleGuard (DL-062 — visibilidade de módulo)", () => {
  it("sem @RequireModule → libera", () => {
    const guard = new ModuleGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext({ access_level: "manager" }))).toBe(
      true,
    );
  });

  it("owner passa sempre (ignora o flag)", () => {
    const guard = new ModuleGuard(makeReflector("financeiro"));
    expect(
      guard.canActivate(
        makeContext({ access_level: "owner", can_view_financeiro: false }),
      ),
    ).toBe(true);
  });

  it("Gestão COM o flag do módulo → passa", () => {
    const guard = new ModuleGuard(makeReflector("financeiro"));
    expect(
      guard.canActivate(
        makeContext({ access_level: "manager", can_view_financeiro: true }),
      ),
    ).toBe(true);
  });

  it("Gestão SEM o flag do módulo → 403", () => {
    const guard = new ModuleGuard(makeReflector("financeiro"));
    expect(() =>
      guard.canActivate(
        makeContext({ access_level: "manager", can_view_financeiro: false }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("cada módulo lê seu próprio flag (dashboard ≠ financeiro)", () => {
    const guard = new ModuleGuard(makeReflector("dashboard"));
    // tem financeiro, mas NÃO dashboard → 403 no dashboard
    expect(() =>
      guard.canActivate(
        makeContext({
          access_level: "manager",
          can_view_financeiro: true,
          can_view_dashboard: false,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it("sem a linha fresca no request → 403 (nega por segurança)", () => {
    const guard = new ModuleGuard(makeReflector("financeiro"));
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
